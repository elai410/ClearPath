import assert from "node:assert/strict";
import test from "node:test";
import { duration } from "../src/lib/plan/distribution.js";
import { plan } from "../src/lib/plan/graph.js";
import {
  URGENCY_CREDIT, governingConstraint, priorityScore, queueCost, readySteps, worklists,
} from "../src/lib/plan/schedule.js";
import { savingFromSpeculating, speculationDecisions, wasteCost } from "../src/lib/plan/speculate.js";

const s = (id, opts = {}) => ({
  id, label: opts.label || id,
  requires: opts.requires || [],
  resource: opts.resource || null,
  presence: opts.presence || "none",
  duration: duration(opts.p50 ?? 10, opts.p90),
  probability: opts.probability ?? 1,
  state: opts.state || "pending",
  why: "",
});

/** A patient whose plan has one queued item on the named resource. */
function entry(id, { urgency = "medium", arrivedAt, resource, minutes, trailing = 0 }) {
  const steps = [
    s("root", { state: "done" }),
    s("work", { requires: ["root"], resource, p50: minutes }),
  ];
  if (trailing) steps.push(s("after", { requires: ["work"], p50: trailing }));
  return {
    patient: { id, name: id, urgency, department: "emergency", checked_in_at: arrivedAt, status: "waiting" },
    plan: plan(steps),
  };
}

test("ready work is only what could actually start now", () => {
  const steps = [
    s("done-thing", { state: "done", resource: "lab" }),
    s("startable", { requires: ["done-thing"], resource: "lab", p50: 10 }),
    s("blocked", { requires: ["startable"], resource: "lab", p50: 10 }),
    s("no-resource", { requires: ["done-thing"], p50: 10 }),
  ];
  const items = readySteps([
    { patient: { id: "p1", name: "A", urgency: "low", checked_in_at: "2026-01-01 00:00:00" }, plan: plan(steps) },
  ]);
  assert.deepEqual(items.map((i) => i.stepId), ["startable"],
    "not the blocked one, not the finished one, not the one needing no resource");
});

test("acuity buys a named, finite amount of queue credit", () => {
  const high = { slack: 60, urgency: "high" };
  const low = { slack: 0, urgency: "low" };
  assert.equal(priorityScore(high), priorityScore(low),
    "an hour of float on a high-acuity patient ties zero float on a low-acuity one");
  assert.equal(URGENCY_CREDIT.high, 60, "and the exchange rate is written down");
});

test("delay is free until it eats through the slack", () => {
  const roomy = [{ minutes: 30, slack: 100, urgency: "low" }];
  const tight = [{ minutes: 30, slack: 0, urgency: "low" }];
  assert.equal(queueCost(roomy, 1), 0, "finishing inside the float delays nobody");
  assert.equal(queueCost(tight, 1), 30);
});

test("reordering the same queue strictly reduces weighted patient delay", () => {
  // A two-minute read that a discharge hangs on, sitting behind an hour of
  // routine work nobody is waiting on. The canonical FIFO failure, on a
  // single-server resource so the contention is real.
  const entries = [
    entry("routine", { arrivedAt: "2026-01-01 08:00:00", resource: "ct", minutes: 60 }),
    entry("urgent-read", { arrivedAt: "2026-01-01 09:00:00", resource: "ct", minutes: 2, trailing: 200 }),
  ];
  const [list] = worklists(entries);

  assert.ok(list.saved > 0, `expected a saving, got ${list.saved}`);
  assert.ok(list.fifoCost > list.cost);
  assert.equal(list.items[0].patientName, "urgent-read", "the short critical read goes first");
  assert.equal(list.items[0].wasPosition, 2, "it was second under arrival order");
});

test("ordering is a no-op when everything has ample float", () => {
  const entries = [
    entry("a", { arrivedAt: "2026-01-01 08:00:00", resource: "lab", minutes: 5 }),
    entry("b", { arrivedAt: "2026-01-01 08:10:00", resource: "lab", minutes: 5 }),
  ];
  const [list] = worklists(entries);
  assert.equal(list.saved, 0, "nothing to win, so the planner claims nothing");
});

test("high acuity is pulled forward even holding slack equal", () => {
  const entries = [
    entry("routine", { arrivedAt: "2026-01-01 08:00:00", resource: "ct", minutes: 20, trailing: 100 }),
    entry("critical", { arrivedAt: "2026-01-01 09:30:00", urgency: "high", resource: "ct", minutes: 20, trailing: 100 }),
  ];
  const [list] = worklists(entries);
  assert.equal(list.items[0].patientName, "critical");
  assert.ok(list.items[0].reason.length > 0, "and says why it moved");
});

test("the constraint is the saturated resource patients are actually waiting on", () => {
  const entries = [
    entry("p1", { arrivedAt: "2026-01-01 08:00:00", resource: "ct", minutes: 90, trailing: 100 }),
    entry("p2", { arrivedAt: "2026-01-01 08:05:00", resource: "ct", minutes: 90, trailing: 100 }),
    entry("p3", { arrivedAt: "2026-01-01 08:10:00", resource: "nurse", minutes: 5 }),
  ];
  const c = governingConstraint(worklists(entries), 120);
  assert.equal(c.resource, "ct");
  assert.equal(c.kind, "resource");
  assert.ok(c.overCapacity, "180 min of work against 120 min on a single scanner");
  assert.ok(c.subordinate.length > 0);
});

test("an unsaturated floor is diagnosed as structural, not as a staffing gap", () => {
  // Four patients all waiting on an attending, but there are three attendings
  // and only 80 minutes of work. Calling this a staffing constraint would send a
  // hospital hiring into a department with spare capacity.
  const entries = ["a", "b", "c", "d"].map((id, i) =>
    entry(id, { arrivedAt: `2026-01-01 08:0${i}:00`, resource: "attending", minutes: 20, trailing: 100 })
  );
  const c = governingConstraint(worklists(entries), 120);
  assert.equal(c.kind, "structural");
  assert.ok(c.utilisationPct < 80, `utilisation was ${c.utilisationPct}%`);
  assert.match(c.subordinate, /Don't add staff/);
  assert.match(c.headline, /waiting on the next step/);
});

test("a busy resource nobody is waiting on is not the constraint", () => {
  // The lab is saturated, but this patient's discharge is gated by a long
  // clinical step running alongside it, so the lab work has hours of float.
  // Utilisation dashboards flag this queue; a constraint finder must not.
  const steps = [
    s("root", { state: "done" }),
    s("long-pole", { requires: ["root"], p50: 400, presence: "required" }),
    s("routine-lab", { requires: ["root"], resource: "lab", p50: 200 }),
    s("leave", { requires: ["long-pole", "routine-lab"], p50: 2 }),
  ];
  const entries = [{
    patient: { id: "p1", name: "A", urgency: "low", department: "emergency", checked_in_at: "2026-01-01 08:00:00", status: "waiting" },
    plan: plan(steps),
  }];
  const lists = worklists(entries);
  assert.ok(lists.find((l) => l.resource === "lab"), "the queue is still reported");
  assert.equal(governingConstraint(lists, 120), null, "but it is not what governs throughput");
});

test("speculation gets more expensive as the resource saturates", () => {
  const steps = [
    s("info", { state: "done" }),
    s("gate", { requires: ["info"], p50: 60 }),
    s("consult", { requires: ["gate"], resource: "cardiology", p50: 40, probability: 0.8 }),
    s("leave", { requires: ["consult"], p50: 2 }),
  ];
  const idle = speculationDecisions(steps)[0];
  const contended = speculationDecisions(steps, { load: { cardiology: { criticalDepth: 8 } } })[0];

  assert.equal(idle.recommend, true, "pre-paging an idle cardiologist is nearly free");
  assert.equal(contended.recommend, false,
    "the identical page against eight critical patients is not");
  assert.ok(contended.expectedWaste > idle.expectedWaste);
});

test("speculation is priced, not assumed", () => {
  const cheap = s("paperwork", { resource: "registration", p50: 30, probability: 0.5 });
  const dear = s("cards", { resource: "cardiology", p50: 30, probability: 0.5 });
  assert.ok(wasteCost(dear) > wasteCost(cheap),
    "wasting the single cardiologist costs more than wasting one of three clerks");
});

test("speculating pays when the work is on the path and likely", () => {
  const steps = [
    s("info", { state: "done" }),
    s("gate", { requires: ["info"], p50: 60 }),
    s("consult", { requires: ["gate"], resource: "cardiology", p50: 40, probability: 0.8 }),
    s("leave", { requires: ["consult"], p50: 2 }),
  ];
  const saving = savingFromSpeculating(steps, "consult");
  assert.ok(saving > 0, `starting the consult during the 60-min gate should save time, got ${saving}`);

  const [decision] = speculationDecisions(steps);
  assert.equal(decision.id, "consult");
  assert.equal(decision.recommend, true);
  assert.match(decision.rationale, /80%/);
});

test("speculating off the critical path is refused, however likely", () => {
  const steps = [
    s("info", { state: "done" }),
    s("long-pole", { requires: ["info"], p50: 300 }),
    s("side", { requires: ["info"], resource: "cardiology", p50: 20, probability: 0.95 }),
    s("leave", { requires: ["long-pole", "side"], p50: 2 }),
  ];
  const [decision] = speculationDecisions(steps);
  assert.equal(decision.savingIfNeeded, 0);
  assert.equal(decision.recommend, false,
    "95% likely, but starting it early saves the patient nothing");
  assert.match(decision.rationale, /isn't holding anyone up/);
});

test("an unlikely call on a scarce resource is refused even when it would help", () => {
  const steps = [
    s("info", { state: "done" }),
    s("gate", { requires: ["info"], p50: 30 }),
    s("consult", { requires: ["gate"], resource: "cardiology", p50: 90, probability: 0.1 }),
    s("leave", { requires: ["consult"], p50: 2 }),
  ];
  const [decision] = speculationDecisions(steps);
  assert.ok(decision.savingIfNeeded > 0, "it would help if needed");
  assert.equal(decision.recommend, false, "but 10% does not justify the expected waste");
});

test("aversion is a policy dial, not a buried constant", () => {
  const steps = [
    s("info", { state: "done" }),
    s("gate", { requires: ["info"], p50: 40 }),
    s("consult", { requires: ["gate"], resource: "surgery", p50: 45, probability: 0.45 }),
    s("leave", { requires: ["consult"], p50: 2 }),
  ];
  const bold = speculationDecisions(steps, { aversion: 0.2 })[0];
  const timid = speculationDecisions(steps, { aversion: 20 })[0];
  assert.equal(bold.recommend, true);
  assert.equal(timid.recommend, false);
});
