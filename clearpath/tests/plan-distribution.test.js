import assert from "node:assert/strict";
import test from "node:test";
import {
  duration, fixed, forecast, maxOf, mean, median,
  probit, quantile, remaining, sum,
} from "../src/lib/plan/distribution.js";

const close = (a, b, tol, msg) =>
  assert.ok(Math.abs(a - b) <= tol, `${msg || ""} expected ${a} within ${tol} of ${b}`);

test("probit matches known standard normal quantiles", () => {
  close(probit(0.5), 0, 1e-9);
  close(probit(0.9), 1.2815515655, 1e-6);
  close(probit(0.975), 1.9599639845, 1e-6);
  close(probit(0.025), -1.9599639845, 1e-6);
});

test("a duration reproduces the two numbers it was built from", () => {
  const d = duration(45, 110);
  close(quantile(d, 0.5), 45, 0.01, "median");
  close(quantile(d, 0.9), 110, 0.01, "p90");
});

test("a fat tail means the mean sits above the median", () => {
  const d = duration(45, 110);
  assert.ok(mean(d) > median(d), "lognormal mean exceeds its median");
  // This gap is the whole reason planning against a mean misleads: half of all
  // scans finish by 45 min, but the average is dragged up by the bad ones.
  assert.ok(mean(d) > 50);
});

test("a p90 below the median is treated as bad data, not certainty", () => {
  const d = duration(60, 30);
  assert.ok(quantile(d, 0.9) > quantile(d, 0.5), "spread is floored, not inverted");
});

test("summing a chain adds means and widens the spread", () => {
  const a = duration(30, 60);
  const b = duration(30, 60);
  const total = sum([a, b]);
  close(mean(total), mean(a) + mean(b), 0.5, "means add");
  assert.ok(quantile(total, 0.9) < quantile(a, 0.9) + quantile(b, 0.9),
    "p90s must not add: both halves being unlucky at once is unlikely");
});

test("parallel work finishes when the unluckiest branch lands, not the median one", () => {
  const one = duration(30, 60);
  const five = maxOf([one, one, one, one, one]);
  assert.ok(median(five) > median(one),
    "five parallel 30-min tasks do not finish in 30 min");
  // All five must land for the join to clear, so P(max <= t) = F(t)^5. Setting
  // that to 0.5 puts the median of the max at the 0.5^(1/5) ≈ 0.87 quantile of
  // a single branch — nearly double the 30-minute median anyone would quote.
  close(median(five), quantile(one, Math.pow(0.5, 1 / 5)), 1.5);
  assert.ok(median(five) > 50, `five 30-min branches join at ${Math.round(median(five))} min`);
});

test("max of one thing is that thing", () => {
  const d = duration(20, 50);
  close(median(maxOf([d])), median(d), 0.01);
});

test("a task already running long is predicted to run longer still", () => {
  const ct = duration(45, 110);
  const naive = 45 - 40;
  const conditional = median(remaining(ct, 40));
  assert.ok(conditional > naive,
    `subtracting elapsed from the median says ${naive} min left; conditioning says ${Math.round(conditional)}`);
  // The inspection paradox, which is why "any minute now" gets repeated for
  // hours: having run long is evidence of being one of the slow ones.
  assert.ok(median(remaining(ct, 90)) > median(remaining(ct, 40)));
});

test("conditioning past the modelled tail degrades instead of exploding", () => {
  const d = duration(10, 15);
  const left = median(remaining(d, 600));
  assert.ok(Number.isFinite(left) && left > 0, `got ${left}`);
});

test("a fixed duration has effectively no spread", () => {
  const f = fixed(180);
  close(quantile(f, 0.5), 180, 0.01);
  close(quantile(f, 0.99), 180, 0.1, "a mandated 3-hour interval is exactly 3 hours");
});

test("forecast reports a plannable median and a committable p90", () => {
  const f = forecast(duration(45, 110));
  assert.equal(f.p50, 45);
  assert.equal(f.confident, 110);
  assert.ok(f.confident > f.p80 && f.p80 > f.p50, "quantiles are ordered");
  assert.equal(f.spread, 65);
});
