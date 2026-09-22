import assert from "node:assert/strict";
import test from "node:test";
import { duration, fixed, median } from "../src/lib/plan/distribution.js";
import { downstreamWeight, plan, topoOrder } from "../src/lib/plan/graph.js";

const s = (id, opts = {}) => ({
  id,
  label: id,
  requires: opts.requires || [],
  resource: opts.resource || null,
  presence: opts.presence || "none",
  duration: opts.fixedAt ? fixed(opts.fixedAt) : duration(opts.p50 ?? 10, opts.p90),
  probability: opts.probability ?? 1,
  state: opts.state || "pending",
  elapsed: opts.elapsed,
  agoMinutes: opts.agoMinutes,
  clock: Boolean(opts.clock),
});

const byId = (p, id) => p.steps.find((x) => x.id === id);

test("topological order respects dependencies", () => {
  const steps = [s("c", { requires: ["b"] }), s("a"), s("b", { requires: ["a"] })];
  const order = topoOrder(steps);
  assert.ok(order.indexOf("a") < order.indexOf("b"));
  assert.ok(order.indexOf("b") < order.indexOf("c"));
});

test("a cyclic care plan is a bug, not a schedule", () => {
  const steps = [s("a", { requires: ["b"] }), s("b", { requires: ["a"] })];
  assert.throws(() => topoOrder(steps), /Cyclic/);
});

test("dangling dependencies are ignored so bundles can compose freely", () => {
  const steps = [s("a"), s("b", { requires: ["a", "never-compiled"] })];
  assert.doesNotThrow(() => topoOrder(steps));
  assert.equal(topoOrder(steps).length, 2);
});

test("downstream weight measures the work waiting behind a step", () => {
  const steps = [
    s("quick", { p50: 5 }),
    s("long-tail-1", { requires: ["quick"], p50: 60 }),
    s("long-tail-2", { requires: ["long-tail-1"], p50: 60 }),
    s("dead-end", { p50: 30 }),
  ];
  const w = downstreamWeight(steps);
  // The five-minute task outranks the thirty-minute one because two hours of
  // work sits behind it. This is why duration alone is the wrong priority.
  assert.ok(w.get("quick") > w.get("dead-end"));
});

test("independent work runs concurrently when it does not need the patient", () => {
  const p = plan([
    s("root", { p50: 10, presence: "required" }),
    s("lab-a", { requires: ["root"], p50: 40 }),
    s("lab-b", { requires: ["root"], p50: 40 }),
  ]);
  assert.equal(byId(p, "lab-a").earliestStart, byId(p, "lab-b").earliestStart,
    "neither needs the patient, so both start together");
});

test("the patient is a resource: two steps needing them cannot overlap", () => {
  const p = plan([
    s("scan", { p50: 30, presence: "required" }),
    s("draw", { p50: 10, presence: "required" }),
  ]);
  const scan = byId(p, "scan");
  const draw = byId(p, "draw");
  const overlap = Math.min(scan.earliestFinish, draw.earliestFinish) -
    Math.max(scan.earliestStart, draw.earliestStart);
  assert.ok(overlap <= 0,
    `a patient cannot be in two rooms at once, but these overlap by ${overlap} min`);
  assert.equal(Math.max(scan.earliestFinish, draw.earliestFinish), 40,
    "they serialise, so the pair takes the sum and not the max");
});

test("splitting a lab exposes the gap where the patient is free", () => {
  // The same 45 minutes of lab work, modelled as one opaque box versus split
  // into the draw that needs the patient and the analysis that does not.
  const fused = plan([
    s("lab", { p50: 45, presence: "required" }),
    s("ct", { p50: 20, presence: "required" }),
  ]);
  const split = plan([
    s("draw", { p50: 5, presence: "required" }),
    s("analysis", { requires: ["draw"], p50: 40 }),
    s("ct", { p50: 20, presence: "required" }),
  ]);
  assert.equal(fused.presenceMinutes, 65, "opaque model thinks the patient is busy the whole time");
  assert.equal(split.presenceMinutes, 25, "actually the patient is needed for 25 of those minutes");
  assert.ok(median(split.finish) < median(fused.finish),
    "and the visit is genuinely shorter because the CT fits inside the analysis window");
});

test("the critical path is the only chain whose delay moves the finish", () => {
  const steps = [
    s("start", { p50: 5 }),
    s("slow", { requires: ["start"], p50: 120 }),
    s("fast", { requires: ["start"], p50: 10 }),
    s("end", { requires: ["slow", "fast"], p50: 5 }),
  ];
  const p = plan(steps);
  assert.ok(byId(p, "slow").critical, "the long branch is critical");
  assert.equal(byId(p, "fast").critical, false, "the short branch is not");
  assert.equal(byId(p, "fast").slack, 110, "and has 110 minutes of float");
  assert.equal(byId(p, "slow").slack, 0);
});

test("expediting off the critical path buys exactly nothing", () => {
  const steps = [
    s("start", { p50: 5 }),
    s("slow", { requires: ["start"], p50: 120 }),
    s("fast", { requires: ["start"], p50: 40 }),
    s("end", { requires: ["slow", "fast"], p50: 5 }),
  ];
  const before = median(plan(steps).finish);
  const expedited = steps.map((x) => (x.id === "fast" ? s("fast", { requires: ["start"], p50: 1 }) : x));
  const after = median(plan(expedited).finish);
  assert.ok(Math.abs(before - after) < 1,
    `cutting a non-critical task from 40 min to 1 min moved the finish by ${(before - after).toFixed(1)} min`);
});

test("a long-lead external item is pulled to the front by the backward pass", () => {
  // The ride home takes 45 minutes of someone else's driving and gates leaving.
  // Nothing about it depends on the clinical work, so it should start at zero.
  const p = plan([
    s("care", { p50: 200, presence: "required" }),
    s("ride", { p50: 45 }),
    s("leave", { requires: ["care", "ride"], p50: 2, presence: "required" }),
  ]);
  assert.equal(byId(p, "ride").earliestStart, 0, "startable immediately");
  assert.equal(byId(p, "ride").latestStart, 155,
    "and has until minute 155 before it starts delaying discharge");
  assert.ok(byId(p, "ride").slack > 0, "so it is not the thing to chase");
});

test("a short-lead item that gates discharge becomes critical when care is short", () => {
  const p = plan([
    s("care", { p50: 20, presence: "required" }),
    s("ride", { p50: 45 }),
    s("leave", { requires: ["care", "ride"], p50: 2, presence: "required" }),
  ]);
  // Same graph, shorter visit: now the ride is the thing holding them, which is
  // exactly the situation that produces a patient sitting in a wheelchair by the
  // door for forty minutes.
  assert.ok(byId(p, "ride").critical);
  assert.equal(byId(p, "care").critical, false);
});

test("finished work is pinned to the past and stops consuming the patient", () => {
  const p = plan([
    s("done-scan", { p50: 30, presence: "required", state: "done", agoMinutes: 50 }),
    s("next", { requires: ["done-scan"], p50: 10, presence: "required" }),
  ]);
  assert.equal(byId(p, "done-scan").earliestFinish, -50);
  assert.equal(byId(p, "next").earliestStart, 0, "not queued behind history");
});

test("a running step is re-estimated upward, not counted down", () => {
  const running = plan([s("scan", { p50: 45, p90: 110, state: "running", elapsed: 40 })]);
  assert.ok(median(running.finish) > 5,
    "naive countdown would say 5 minutes left; conditioning says more");
});

test("a clock-bound interval is immune to everything and still dominates", () => {
  const p = plan([
    s("draw1", { p50: 5, presence: "required" }),
    s("wait", { requires: ["draw1"], fixedAt: 180, clock: true }),
    s("draw2", { requires: ["wait"], p50: 5, presence: "required" }),
    s("sidework", { p50: 60 }),
  ]);
  assert.ok(byId(p, "wait").critical);
  assert.equal(byId(p, "sidework").critical, false,
    "an hour of other work fits inside the interval for free");
  assert.ok(median(p.finish) >= 185);
});

test("an empty plan is empty rather than an exception", () => {
  const p = plan([]);
  assert.deepEqual(p.steps, []);
  assert.equal(p.horizon, 0);
});

test("skipped steps leave the graph entirely", () => {
  const p = plan([s("a", { p50: 10 }), { ...s("b", { p50: 999 }), state: "skipped" }]);
  assert.equal(p.steps.length, 1);
  assert.ok(median(p.finish) < 20);
});
