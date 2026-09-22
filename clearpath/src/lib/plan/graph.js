/**
 * The patient's visit as a scheduled dependency graph.
 *
 * The idea this file exists to express: a visit is not a sequence of stages, it
 * is a partial order of work with slack in it. Most of that work is not on the
 * path that determines when the patient goes home, and the whole point of
 * computing the graph is to find out which work actually is.
 *
 * ── The patient is a resource ──
 *
 * The load-bearing correction here is that the patient's own body is a
 * contended, non-shareable resource, and usually the scarcest one in the plan.
 * Existing systems model scanners, beds and staff but not the patient, which is
 * why a blood draw and a CT both get labelled "can run in parallel" when they
 * plainly cannot: the patient can only be in one of those two rooms. Once
 * presence is modelled, real concurrency becomes something we compute instead of
 * something we assert — and the honest answer is usually that far less can run
 * in parallel than a `can_parallel` flag claims, while the things that genuinely
 * can (paperwork, prior-auth, arranging a ride) are exactly the ones nobody
 * starts early.
 */
import { ZERO, duration, maxOf, median, remaining, sum } from "./distribution.js";

/**
 * Presence levels, ordered by how much of the patient they consume.
 * `brief` still blocks, but it is interruptible, so the scheduler is allowed to
 * slot it into a gap ahead of a long `required` step.
 */
export const PRESENCE = { none: 0, brief: 1, required: 2 };

export function needsPatient(step) {
  return (PRESENCE[step.presence] ?? 0) > 0;
}

function durationOf(step) {
  if (step.duration) return step.duration;
  return duration(step.p50 ?? 20, step.p90);
}

/**
 * What is left of a step right now, honestly.
 * A finished step costs nothing; a running step is re-estimated against how long
 * it has already been running, which for a fat tail means it can get *worse*.
 */
function remainingOf(step) {
  if (step.state === "done" || step.state === "skipped") return { ...ZERO };
  if (step.state === "running") return remaining(durationOf(step), step.elapsed || 0);
  return durationOf(step);
}

/** Kahn's algorithm. Throws on a cycle, because a cyclic care plan is a bug. */
export function topoOrder(steps, extraEdges = []) {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const indegree = new Map(steps.map((s) => [s.id, 0]));
  const out = new Map(steps.map((s) => [s.id, []]));

  const edges = [
    ...steps.flatMap((s) => (s.requires || []).filter((d) => byId.has(d)).map((d) => [d, s.id])),
    ...extraEdges,
  ];
  for (const [from, to] of edges) {
    if (!byId.has(from) || !byId.has(to)) continue;
    out.get(from).push(to);
    indegree.set(to, indegree.get(to) + 1);
  }

  const ready = steps.filter((s) => indegree.get(s.id) === 0).map((s) => s.id);
  const order = [];
  while (ready.length) {
    const id = ready.shift();
    order.push(id);
    for (const next of out.get(id)) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) ready.push(next);
    }
  }
  if (order.length !== steps.length) {
    const stuck = steps.filter((s) => !order.includes(s.id)).map((s) => s.id);
    throw new Error(`Cyclic care plan: ${stuck.join(" -> ")}`);
  }
  return order;
}

/**
 * Longest remaining work downstream of each step, in median minutes.
 *
 * This is the scheduling priority that matters. A five-minute task with four
 * hours of work behind it should win the patient ahead of a thirty-minute task
 * that ends the chain, and "how long is the tail behind this" is the only
 * number that expresses that. Standard list-scheduling level, and the reason
 * least-slack-first later in the pipeline is not just a vibe.
 */
export function downstreamWeight(steps) {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const successors = new Map(steps.map((s) => [s.id, []]));
  for (const s of steps) {
    for (const dep of s.requires || []) {
      if (successors.has(dep)) successors.get(dep).push(s.id);
    }
  }
  const weight = new Map();
  const order = topoOrder(steps).reverse();
  for (const id of order) {
    const own = median(remainingOf(byId.get(id)));
    const best = successors.get(id).reduce((m, n) => Math.max(m, weight.get(n) || 0), 0);
    weight.set(id, own + best);
  }
  return weight;
}

/**
 * Forward pass: when can each step actually start and finish.
 *
 * Times are minutes from now, so a negative finish means it already happened.
 * Steps are walked in topological order with ties broken by downstream weight,
 * which is list scheduling (HLFET). Resource-constrained scheduling is NP-hard,
 * so this is a good approximation rather than an optimum — but it is a
 * principled one, and it respects the constraint that matters most: only one
 * thing can have the patient at a time.
 */
export function forwardPass(steps) {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const weight = downstreamWeight(steps);
  const order = topoOrder(steps).sort((a, b) => {
    // Re-sorting a topological order is only safe because the comparator is
    // applied to an already-valid order and we re-check dependencies below.
    const w = (weight.get(b) || 0) - (weight.get(a) || 0);
    return w;
  });

  // Restore validity: walk the priority order but defer anything whose
  // dependencies have not been placed yet.
  const placed = new Set();
  const sequence = [];
  const pending = [...order];
  while (pending.length) {
    const before = pending.length;
    for (let i = 0; i < pending.length; i += 1) {
      const id = pending[i];
      const deps = (byId.get(id).requires || []).filter((d) => byId.has(d));
      if (deps.every((d) => placed.has(d))) {
        placed.add(id);
        sequence.push(id);
        pending.splice(i, 1);
        break;
      }
    }
    if (pending.length === before) throw new Error("Unschedulable care plan");
  }

  const start = new Map();
  const finish = new Map();
  const startDist = new Map();
  const finishDist = new Map();
  const presenceEdges = [];

  let patientFreeAt = 0;
  let patientFreeDist = { ...ZERO };
  let lastPresence = null;

  for (const id of sequence) {
    const step = byId.get(id);
    const deps = (step.requires || []).filter((d) => byId.has(d));
    const rem = remainingOf(step);

    if (step.state === "done") {
      const at = -(step.agoMinutes || 0);
      start.set(id, at);
      finish.set(id, at);
      startDist.set(id, { ...ZERO });
      finishDist.set(id, { ...ZERO });
      continue;
    }

    const depFinish = deps.length ? Math.max(...deps.map((d) => finish.get(d))) : 0;
    const depDists = deps.map((d) => finishDist.get(d)).filter(Boolean);

    let s = Math.max(0, depFinish);
    let sDist = depDists.length ? maxOf(depDists) : { ...ZERO };

    // A running step already owns whatever it needs; it cannot be pushed later
    // by contention that is, by definition, already resolved.
    if (step.state === "running") {
      s = 0;
      sDist = { ...ZERO };
    } else if (needsPatient(step)) {
      if (patientFreeAt > s) {
        s = patientFreeAt;
        sDist = maxOf([sDist, patientFreeDist]);
        if (lastPresence) presenceEdges.push([lastPresence, id]);
      }
    }

    const f = s + median(rem);
    const fDist = sum([sDist, rem]);
    start.set(id, s);
    finish.set(id, f);
    startDist.set(id, sDist);
    finishDist.set(id, fDist);

    if (needsPatient(step)) {
      patientFreeAt = f;
      patientFreeDist = fDist;
      lastPresence = id;
    }
  }

  return { start, finish, startDist, finishDist, presenceEdges, sequence, weight };
}

/**
 * Backward pass: the latest each step could start without pushing the finish.
 *
 * Run over the dependency edges *plus* the presence edges the forward pass
 * induced, so slack accounts for the queue for the patient's own body rather
 * than pretending the graph is the only constraint.
 */
export function backwardPass(steps, forward, horizon) {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const successors = new Map(steps.map((s) => [s.id, []]));
  const edges = [
    ...steps.flatMap((s) => (s.requires || []).filter((d) => byId.has(d)).map((d) => [d, s.id])),
    ...forward.presenceEdges,
  ];
  for (const [from, to] of edges) successors.get(from).push(to);

  const end = horizon ?? Math.max(0, ...steps.map((s) => forward.finish.get(s.id) || 0));
  const latestFinish = new Map();
  const latestStart = new Map();

  for (const id of topoOrder(steps, forward.presenceEdges).reverse()) {
    const step = byId.get(id);
    const next = successors.get(id);
    const lf = next.length
      ? Math.min(...next.map((n) => latestStart.get(n)))
      : end;
    const dur = median(remainingOf(step));
    latestFinish.set(id, lf);
    latestStart.set(id, lf - dur);
  }

  const slack = new Map();
  for (const s of steps) {
    slack.set(s.id, Math.round((latestStart.get(s.id) - forward.start.get(s.id)) * 10) / 10);
  }
  return { latestStart, latestFinish, slack, horizon: end };
}

/**
 * Build the whole plan view for one patient.
 *
 * `criticalPath` is the chain with no slack — the only work whose delay moves
 * the discharge time. Everything else is float, and knowing which is which is
 * the difference between expediting what matters and expediting at random.
 */
export function plan(steps) {
  const live = steps.filter((s) => s.state !== "skipped");
  if (!live.length) {
    return {
      steps: [], criticalPath: [], finish: { ...ZERO },
      horizon: 0, presenceMinutes: 0, parallelMinutes: 0,
    };
  }

  const forward = forwardPass(live);
  const backward = backwardPass(live, forward);
  const byId = new Map(live.map((s) => [s.id, s]));

  const annotated = live.map((s) => {
    const slack = backward.slack.get(s.id);
    return {
      ...s,
      earliestStart: Math.round(forward.start.get(s.id)),
      earliestFinish: Math.round(forward.finish.get(s.id)),
      latestStart: Math.round(backward.latestStart.get(s.id)),
      slack: Math.max(0, Math.round(slack)),
      critical: s.state !== "done" && slack <= 0.5,
      downstreamWeight: Math.round(forward.weight.get(s.id) || 0),
      finishForecast: forward.finishDist.get(s.id),
      needsPatient: needsPatient(s),
    };
  });

  // Terminal steps are the ones nothing else waits on; the visit ends when the
  // unluckiest of them lands, which is a max and not a sum.
  const hasSuccessor = new Set(live.flatMap((s) => (s.requires || [])));
  const terminals = annotated.filter((s) => !hasSuccessor.has(s.id) && s.state !== "done");
  const finish = terminals.length
    ? maxOf(terminals.map((s) => s.finishForecast))
    : { ...ZERO };

  const criticalPath = annotated
    .filter((s) => s.critical)
    .sort((a, b) => a.earliestStart - b.earliestStart);

  const open = annotated.filter((s) => s.state !== "done");
  const presenceMinutes = open
    .filter((s) => s.needsPatient)
    .reduce((t, s) => t + median(remainingOf(byId.get(s.id))), 0);
  const offPathMinutes = open
    .filter((s) => !s.critical)
    .reduce((t, s) => t + median(remainingOf(byId.get(s.id))), 0);

  return {
    steps: annotated,
    criticalPath,
    finish,
    horizon: Math.round(backward.horizon),
    // How much of the remaining time genuinely needs the patient present, versus
    // how much is work the hospital owes them that could already be running.
    presenceMinutes: Math.round(presenceMinutes),
    offPathMinutes: Math.round(offPathMinutes),
  };
}
