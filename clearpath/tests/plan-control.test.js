import assert from "node:assert/strict";
import test from "node:test";
import { duration } from "../src/lib/plan/distribution.js";
import { plan } from "../src/lib/plan/graph.js";
import { controlLoop, generateInterventions } from "../src/lib/plan/control.js";

function entry(id, name, steps) {
  return {
    patient: {
      id, name, urgency: "medium", department: "emergency",
      checked_in_at: "2026-01-01 08:00:00", status: "waiting",
      situation: "crushing chest pain",
    },
    plan: plan(steps),
  };
}

test("eligible off-path work is offered as a reversible start", () => {
  const steps = [
    { id: "eval", label: "Eval", requires: [], resource: "attending", presence: "required", duration: duration(20, 30), probability: 1, state: "pending" },
    { id: "ride", label: "Arrange ride home", requires: [], resource: "external", presence: "none", duration: duration(45, 90), probability: 1, state: "pending" },
  ];
  const moves = generateInterventions([entry("p", "Ada", steps)]);
  assert.ok(moves.some((m) => m.stepId === "ride"), JSON.stringify(moves.map((m) => m.stepId)));
  assert.ok(moves.every((m) => m.reversible));
  assert.ok(moves.every((m) => m.clinical === false));
});

test("work that needs the patient is not started behind their back", () => {
  const steps = [
    { id: "scan", label: "CT", requires: [], resource: "ct", presence: "required", duration: duration(20, 40), probability: 1, state: "pending" },
  ];
  const moves = generateInterventions([entry("p", "Bea", steps)]);
  assert.equal(moves.length, 0);
});

test("the loop never recommends a clinical act", () => {
  const loop = controlLoop([
    {
      id: "p1", name: "Cam", urgency: "high", department: "emergency",
      status: "waiting", situation: "crushing chest pain",
      checked_in_at: "2026-01-01 08:00:00", language: "en",
    },
  ], {});
  assert.equal(loop.authority.execute, false);
  assert.equal(loop.authority.level, 2);
  if (loop.recommended) {
    assert.equal(loop.recommended.authority.execute, false);
    assert.ok(loop.recommended.minutesSaved >= 8);
  }
});

test("discharge meds are not offered for a pre-op visit", () => {
  const loop = controlLoop([
    {
      id: "pre", name: "Ibrahim Hassan", urgency: "low", department: "triage",
      status: "waiting", visit_kind: "preop", language: "en",
      situation: "I need to get my pre-admission testing done before my surgery next week",
      reason: "Pre-admission testing for scheduled surgery",
      checked_in_at: "2026-01-01 08:00:00",
    },
  ], {});
  const titles = [loop.recommended, ...(loop.alternatives || [])].filter(Boolean).map((m) => m.title);
  assert.ok(titles.every((t) => !/discharge medications/i.test(t)), titles.join("; "));
});

test("an empty hospital produces a quiet loop", () => {
  const loop = controlLoop([], {});
  assert.equal(loop.recommended, null);
  assert.equal(loop.considered, 0);
});

test("a discharge-ready visit is told to start the ride, not another test", () => {
  const loop = controlLoop([
    {
      id: "p", name: "Priya Nair", urgency: "low", department: "emergency",
      status: "pending_signature", visit_kind: "emergency", language: "en",
      situation: "I think I'm ready to go home but nobody has brought the paperwork",
      reason: "Disposition ready — discharge stalled on paperwork",
      checked_in_at: "2026-01-01 08:00:00",
    },
  ], {});
  assert.ok(loop.recommended, "expected a move");
  assert.match(loop.recommended.title, /ride home/i);
  assert.equal(loop.recommended.authority.execute, false);
});

test("a clock interval is never recommended as work to start", () => {
  const loop = controlLoop([
    {
      id: "p1", name: "James Carter", urgency: "high", department: "emergency",
      status: "in_progress", situation: "crushing chest pain radiating to my left arm",
      checked_in_at: "2026-01-01 08:00:00", language: "en",
    },
  ], {});
  const titles = [loop.recommended, ...(loop.alternatives || [])].filter(Boolean).map((m) => m.title);
  assert.ok(titles.every((t) => !/interval/i.test(t)), titles.join("; "));
});

test("an unverified desat holds going-home work for that patient", () => {
  const patient = {
    id: "p", name: "Priya Nair", urgency: "low", department: "emergency",
    status: "pending_signature", visit_kind: "emergency", language: "en",
    situation: "I think I'm ready to go home but nobody has brought the paperwork",
    reason: "Disposition ready — discharge stalled on paperwork",
    checked_in_at: "2026-01-01 08:00:00",
  };
  const loop = controlLoop([patient], {}, {
    holds: [{
      patientId: "p",
      patientName: "Priya Nair",
      display: "SpO2 89%",
      title: "Hold departure for Priya Nair",
      reason: "SpO2 89% is captured and not verified. Going-home work waits.",
    }],
  });
  assert.equal(loop.recommended?.type, "HOLD");
  assert.match(loop.recommended.title, /Hold departure/);
  assert.equal(loop.recommended.authority.execute, false);
  const titles = (loop.alternatives || []).map((a) => a.title).join("; ");
  assert.equal(/ride home/i.test(titles), false, titles);
});
