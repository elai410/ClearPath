import assert from "node:assert/strict";
import test from "node:test";
import { duration } from "../src/lib/plan/distribution.js";
import { plan } from "../src/lib/plan/graph.js";
import { fifoPolicy, project, simulate, slackPolicy } from "../src/lib/plan/simulate.js";

const job = (over) => ({
  key: over.key,
  patientId: over.patientId,
  patientName: over.patientName || over.patientId,
  urgency: over.urgency || "low",
  arrivedAt: over.arrivedAt || "2026-01-01 08:00:00",
  stepId: over.stepId || over.key,
  label: over.label || over.key,
  resource: over.resource || null,
  needsPatient: Boolean(over.needsPatient),
  requires: over.requires || [],
  minutes: over.minutes,
  slack: over.slack ?? 0,
  critical: Boolean(over.critical),
  clock: Boolean(over.clock),
  running: Boolean(over.running),
});

test("arrival order starts the long job while a critical one waits", () => {
  const jobs = [
    job({ key: "a:scan", patientId: "a", resource: "ct", minutes: 50, arrivedAt: "2026-01-01 08:00:00", slack: 80 }),
    job({ key: "b:scan", patientId: "b", resource: "ct", minutes: 10, arrivedAt: "2026-01-01 09:00:00", slack: 0, critical: true, urgency: "high" }),
  ];
  const fifo = simulate(jobs, fifoPolicy);
  const planned = simulate(jobs, slackPolicy);
  const started = (run, key) => run.jobs.find((j) => j.key === key).start;

  assert.equal(started(fifo, "a:scan"), 0);
  assert.equal(started(fifo, "b:scan"), 50, "the critical scan waits out the whole routine one");
  assert.equal(started(planned, "b:scan"), 0, "least-slack starts the critical scan first");
  assert.ok(fifo.inversions.length >= 1);
  assert.equal(fifo.inversions[0].waiting, "b");
});

test("a queue that is empty now and over capacity later is latent, not current", () => {
  // Three scans become ready together at minute 30, behind prep that needs no
  // scanner. CT is idle at minute 0. It cannot be idle at minute 45.
  const jobs = ["a", "b", "c"].flatMap((id) => [
    job({ key: `${id}:prep`, patientId: id, minutes: 30, label: "Prep" }),
    job({
      key: `${id}:scan`, patientId: id, resource: "ct", minutes: 40,
      requires: [`${id}:prep`], label: "CT", critical: true, slack: 0,
    }),
  ]);
  const run = simulate(jobs, slackPolicy);
  const at = (t) => run.samples.find((s) => s.t === t).load.ct || 0;
  assert.equal(at(0), 0, "nothing has reached CT yet");
  assert.ok(at(45) > 1, `CT should be over its single server by minute 45, load was ${at(45)}`);
});

test("the twin reports a latent CT jam from real plans", () => {
  const prepAndScan = (id, name) => {
    const steps = [
      { id: "prep", label: "Prep", requires: [], resource: null, presence: "none", duration: duration(30, 40), probability: 1, state: "pending", clock: false },
      { id: "scan", label: "CT", requires: ["prep"], resource: "ct", presence: "required", duration: duration(40, 70), probability: 1, state: "pending", clock: false },
    ];
    return {
      patient: { id, name, urgency: "high", checked_in_at: "2026-01-01 08:00:00", status: "waiting" },
      plan: plan(steps),
    };
  };
  const trajectory = project(["Ada", "Bea", "Cam"].map((name) => prepAndScan(name, name)));
  const ct = trajectory.latent.find((l) => l.resource === "ct");
  assert.ok(ct, `expected a latent CT jam, got ${JSON.stringify(trajectory.latent)}`);
  assert.equal(ct.depthNow <= ct.capacity, true);
  assert.ok(ct.peak > ct.capacity);
  assert.match(ct.detail, /hasn't reached the line yet/);
});

test("following the plan costs less delay than arrival order, on the same work", () => {
  const entries = [
    {
      patient: { id: "routine", name: "Routine", urgency: "low", checked_in_at: "2026-01-01 08:00:00", status: "waiting" },
      plan: plan([
        { id: "clock", label: "Long interval", requires: [], resource: null, presence: "none", duration: { mu: Math.log(200), sigma: 1e-6 }, probability: 1, state: "pending", clock: true },
        { id: "scan", label: "Routine CT", requires: [], resource: "ct", presence: "required", duration: duration(50, 60), probability: 1, state: "pending" },
        { id: "leave", label: "Leave", requires: ["clock", "scan"], resource: null, presence: "none", duration: duration(2, 3), probability: 1, state: "pending" },
      ]),
    },
    {
      patient: { id: "tight", name: "Tight", urgency: "high", checked_in_at: "2026-01-01 09:00:00", status: "waiting" },
      plan: plan([
        { id: "scan", label: "Critical CT", requires: [], resource: "ct", presence: "required", duration: duration(10, 15), probability: 1, state: "pending" },
        { id: "after", label: "Discharge chain", requires: ["scan"], resource: null, presence: "none", duration: duration(120, 140), probability: 1, state: "pending" },
      ]),
    },
  ];
  // The routine scan has float because nothing waits on it. The short scan does not.
  const trajectory = project(entries);
  assert.ok(trajectory.currentDelay > trajectory.plannedDelay,
    `arrival order delay ${trajectory.currentDelay} should exceed planned ${trajectory.plannedDelay}`);
  assert.equal(trajectory.savedMinutes, trajectory.currentDelay - trajectory.plannedDelay);
  assert.ok(trajectory.inversions.some((inv) => inv.waiting === "Tight"));
});

test("a mandatory interval is reported as usable surface, not as a delay", () => {
  const steps = [
    { id: "clock", label: "Mandatory 3-hour interval", requires: [], resource: null, presence: "none", duration: duration(180, 180), probability: 1, state: "pending", clock: true },
    { id: "paper", label: "Going-home instructions", requires: [], resource: "nurse", presence: "brief", duration: duration(15, 25), probability: 1, state: "pending" },
  ];
  // Fixed 180 has tiny sigma; duration() of equal p50/p90 gets floored spread.
  // clock flag is what the opportunity detector keys on, plus minutes >= 45.
  const trajectory = project([{
    patient: { id: "p", name: "Dana", urgency: "medium", checked_in_at: "2026-01-01 08:00:00", status: "waiting" },
    plan: plan(steps.map((s) => s.id === "clock" ? { ...s, duration: { mu: Math.log(180), sigma: 1e-6 } } : s)),
  }]);
  const interval = trajectory.opportunities.find((o) => o.kind === "interval");
  assert.ok(interval, `expected an interval opportunity, got ${JSON.stringify(trajectory.opportunities)}`);
  assert.match(interval.title, /Dana/);
  assert.match(interval.detail, /instructions/i);
});

test("three draws landing together become one round", () => {
  const entries = ["Ann", "Bo", "Cy"].map((name, i) => ({
    patient: { id: name, name, urgency: "medium", checked_in_at: `2026-01-01 08:0${i}:00`, status: "waiting" },
    plan: plan([{
      id: "draw", label: "Blood draw", requires: [], resource: "phlebotomy", presence: "required",
      duration: duration(5, 8), probability: 1, state: "pending",
    }]),
  }));
  const trajectory = project(entries);
  const round = trajectory.opportunities.find((o) => o.kind === "round");
  assert.ok(round, `expected a round, got ${JSON.stringify(trajectory.opportunities)}`);
  assert.match(round.title, /Blood draw/);
  assert.match(round.detail, /Phlebotomy/);
  assert.match(round.title, /3/);
});

test("an empty floor projects to nothing", () => {
  const trajectory = project([]);
  assert.equal(trajectory.savedMinutes, 0);
  assert.deepEqual(trajectory.latent, []);
  assert.deepEqual(trajectory.opportunities, []);
});
