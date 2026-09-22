/**
 * Durations as distributions instead of scalars.
 *
 * A hospital task has no "duration". A CT has a median of 45 minutes and a p90
 * of 110, and the gap between those two numbers is where every broken promise
 * lives. Planning against a mean is wrong half the time by construction, so
 * every duration here carries its own spread and the planner asks for the
 * quantile that matches the promise it is about to make.
 *
 * Lognormal is the shape service times actually take: bounded below by zero,
 * right-skewed, occasional very long tail. It is also the only family we can
 * fit from what hospitals can realistically measure — a median and a "it's
 * usually done by" number.
 */

/** Acklam's inverse normal CDF. Accurate to ~1e-9, which is far beyond need. */
const A = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239];
const B = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
const C = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
const D = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];

export function probit(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const low = 0.02425;
  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5]) /
      ((((D[0] * q + D[1]) * q + D[2]) * q + D[3]) * q + 1);
  }
  if (p > 1 - low) return -probit(1 - p);
  const q = p - 0.5;
  const r = q * q;
  return (((((A[0] * r + A[1]) * r + A[2]) * r + A[3]) * r + A[4]) * r + A[5]) * q /
    (((((B[0] * r + B[1]) * r + B[2]) * r + B[3]) * r + B[4]) * r + 1);
}

/** Abramowitz & Stegun 7.1.26 error function, enough for CDF work. */
function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return sign * y;
}

function normalCdf(z) {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

const Z90 = probit(0.9);

/**
 * A duration, carried as its log-space parameters so sums and maxima stay cheap.
 * Construct from the two numbers a department can actually tell you.
 */
export function duration(p50, p90 = p50 * 1.8) {
  const median = Math.max(0.1, p50);
  // A p90 at or below the median is a measurement error, not a certainty. Floor
  // the spread rather than producing a degenerate distribution that would make
  // the planner over-promise.
  const upper = Math.max(p90, median * 1.05);
  const mu = Math.log(median);
  const sigma = Math.log(upper / median) / Z90;
  return { mu, sigma };
}

/** A task with no variance at all: a fixed appointment, a legally fixed wait. */
export function fixed(minutes) {
  return { mu: Math.log(Math.max(0.1, minutes)), sigma: 1e-6 };
}

export const ZERO = fixed(0.1);

export function quantile(dist, p) {
  return Math.exp(dist.mu + dist.sigma * probit(p));
}

export function median(dist) {
  return Math.exp(dist.mu);
}

export function mean(dist) {
  return Math.exp(dist.mu + (dist.sigma * dist.sigma) / 2);
}

export function variance(dist) {
  const s2 = dist.sigma * dist.sigma;
  return (Math.exp(s2) - 1) * Math.exp(2 * dist.mu + s2);
}

/** Refit a lognormal from a mean and variance (moment matching). */
function fromMoments(m, v) {
  if (m <= 0) return { ...ZERO };
  const s2 = Math.log(1 + v / (m * m));
  return { mu: Math.log(m) - s2 / 2, sigma: Math.sqrt(Math.max(s2, 1e-12)) };
}

/**
 * Sum of independent durations, for a chain of steps.
 *
 * The exact sum of lognormals has no closed form, so this matches moments and
 * refits. The approximation is good where it matters (a handful of terms of
 * similar scale) and it preserves the property the planner depends on: adding
 * steps widens the spread, so a long chain is predicted less confidently than a
 * short one.
 */
export function sum(dists) {
  const list = dists.filter(Boolean);
  if (!list.length) return { ...ZERO };
  if (list.length === 1) return { ...list[0] };
  let m = 0;
  let v = 0;
  for (const d of list) {
    m += mean(d);
    v += variance(d);
  }
  return fromMoments(m, v);
}

/**
 * Distribution of the maximum, for a join where several branches must all land.
 *
 * Exact for independent variables — P(max <= t) is the product of the CDFs — so
 * this is solved numerically by bisection rather than approximated. This is the
 * function that makes parallelism honest: five parallel 30-minute tasks do not
 * finish in 30 minutes, they finish when the unluckiest one does.
 */
export function maxOf(dists) {
  const list = dists.filter(Boolean);
  if (!list.length) return { ...ZERO };
  if (list.length === 1) return { ...list[0] };

  const cdf = (t) => {
    if (t <= 0) return 0;
    let acc = 1;
    for (const d of list) {
      acc *= normalCdf((Math.log(t) - d.mu) / d.sigma);
      if (acc === 0) return 0;
    }
    return acc;
  };

  const solve = (target) => {
    let lo = 1e-6;
    let hi = Math.max(...list.map((d) => quantile(d, 0.9999))) || 1;
    for (let i = 0; i < 80; i += 1) {
      const mid = (lo + hi) / 2;
      if (cdf(mid) < target) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };

  // Refit through two quantiles so the result stays a plain lognormal and can
  // feed straight back into sum() further up the graph.
  const q50 = solve(0.5);
  const q90 = solve(0.9);
  return duration(q50, q90);
}

/**
 * How much longer something will take, given it has already run this long.
 *
 * This is the correction hospitals get backwards. With a fat right tail, a scan
 * that is already 90 minutes into a 45-minute median is not "nearly done" — the
 * fact that it has run long is evidence it is one of the bad ones, and its
 * expected remaining time has *grown*. Subtracting elapsed from the median
 * produces the opposite, falsely reassuring answer, and it is why "any minute
 * now" is repeated for two hours.
 */
export function remaining(dist, elapsedMinutes) {
  const e = Math.max(0, elapsedMinutes);
  if (e <= 0) return { ...dist };
  const survived = normalCdf((Math.log(Math.max(e, 1e-6)) - dist.mu) / dist.sigma);
  // Past the modelled tail there is nothing left to condition on, so fall back
  // to a flat "this is broken, ask someone" window rather than dividing by ~0.
  if (survived > 0.999) return duration(Math.max(5, e * 0.25));
  const at = (p) => {
    const adjusted = survived + p * (1 - survived);
    return Math.max(0.1, quantile(dist, Math.min(adjusted, 0.999999)) - e);
  };
  return duration(at(0.5), at(0.9));
}

/** Shift a distribution later by a known, certain delay. */
export function shift(dist, minutes) {
  if (!minutes) return { ...dist };
  return fromMoments(mean(dist) + minutes, variance(dist));
}

/**
 * The promise-shaped view: what to actually tell a patient or a bed planner.
 * `confident` is deliberately p90 — the number you can commit to — while `p50`
 * is the number you plan resources against.
 */
export function forecast(dist) {
  return {
    p50: Math.round(quantile(dist, 0.5)),
    p80: Math.round(quantile(dist, 0.8)),
    confident: Math.round(quantile(dist, 0.9)),
    spread: Math.round(quantile(dist, 0.9) - quantile(dist, 0.5)),
  };
}
