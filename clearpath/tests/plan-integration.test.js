import assert from "node:assert/strict";
import test from "node:test";
import { floorPlan, patientPlan } from "../src/lib/plan/index.js";

/** Shaped like a real row from the patients table. */
const patient = (over = {}) => ({
  id: "p1",
  name: "Test Patient",
  situation: "I have crushing chest pain and my left arm hurts",
  summary: "",
  reason: "",
  department: "emergency",
  urgency: "high",
  status: "waiting",
  language: "en",
  checked_in_at: "2026-09-21 12:00:00",
  last_updated_at: "2026-09-21 12:00:00",
  ...over,
});

const blocker = (over = {}) => ({
  id: "b1", patient_id: "p1", type: "lab", title: "Troponin",
  status: "pending", created_at: "2026-09-21 12:10:00", updated_at: "2026-09-21 12:10:00",
  ...over,
});

test("a chest pain presentation compiles into an ACS plan", () => {
  const p = patientPlan(patient());
  assert.match(p.presentation, /ACS/);
  assert.ok(p.steps.length > 10, `expected a real plan, got ${p.steps.length} steps`);
  assert.ok(p.steps.some((s) => s.id === "trop1-draw"));
  assert.ok(p.steps.some((s) => s.id === "trop-interval"));
});

test("the plan is gated by the troponin interval, not by any queue", () => {
  const p = patientPlan(patient());
  assert.ok(p.clockBound, "a chest pain rule-out is clock-bound");
  assert.equal(p.clockBound.minutes, 180);
  assert.match(p.clockBound.guidance, /required waiting period/);
});

test("the forecast is a range with a committable upper bound", () => {
  const p = patientPlan(patient());
  assert.ok(p.forecast.confident > p.forecast.p50);
  assert.ok(p.forecast.p50 > 180, "cannot beat the mandatory interval");
});

test("most of the remaining time does not need the patient present", () => {
  const p = patientPlan(patient());
  // The number that reframes the whole visit: the patient is the scarce
  // resource for only a small slice of their own stay.
  assert.ok(p.presenceMinutes < p.forecast.p50 / 2,
    `presence ${p.presenceMinutes} min of a ${p.forecast.p50} min visit`);
});

test("blockedBy names one thing, not a stage", () => {
  const p = patientPlan(patient());
  assert.ok(p.blockedBy);
  assert.ok(p.blockedBy.label.length > 0);
  assert.ok("resource" in p.blockedBy);
});

test("work that needs nothing from the patient is surfaced as startable now", () => {
  const p = patientPlan(patient());
  assert.ok(p.startableNow.length > 0, "there is always coordination work sitting idle");
  assert.ok(p.startableNow.every((s) => s.id !== "depart"));
});

test("a non-English patient gets interpreter work wired into the graph", () => {
  const p = patientPlan(patient({ language: "es" }));
  assert.ok(p.modifiers.includes("interpreter"));
  assert.ok(p.steps.some((s) => s.id === "interpreter"));
});

test("an admitted patient's plan grows the bed chain", () => {
  const p = patientPlan(patient({ status: "pending_bed" }));
  assert.ok(p.modifiers.includes("admitted"));
  assert.ok(p.steps.some((s) => s.id === "bed-request"));
  assert.ok(p.forecast.p50 > patientPlan(patient()).forecast.p50 - 1);
});

test("a pending lab blocker marks the analysis running and the draw done", () => {
  const p = patientPlan(patient({ status: "pending_test" }), [blocker()]);
  const run = p.steps.find((s) => s.id === "trop1-run");
  const draw = p.steps.find((s) => s.id === "trop1-draw");
  assert.equal(run.state, "running");
  assert.equal(draw.state, "done", "you cannot be analysing a specimen you never drew");
});

test("a resolved blocker advances the plan rather than stalling it", () => {
  const open = patientPlan(patient({ status: "pending_test" }), [blocker()]);
  const closed = patientPlan(patient({ status: "pending_test" }), [
    blocker({ status: "resolved", resolved_at: "2026-09-21 12:40:00" }),
  ]);
  assert.ok(closed.forecast.p50 <= open.forecast.p50);
});

test("a discharged patient has an empty remaining plan", () => {
  const p = patientPlan(patient({ status: "discharged" }));
  assert.equal(p.steps.filter((s) => s.state !== "done").length, 0);
  assert.equal(p.blockedBy, null);
});

test("every presentation compiles without throwing", () => {
  const situations = [
    "I cannot breathe properly and my chest feels tight",
    "terrible stomach pain and vomiting all night",
    "I fell off a ladder and my wrist is swollen",
    "high fever and chills for two days",
    "I have been having very dark thoughts",
    "a stray dog bit my hand this morning",
    "me duele mucho el pecho",
    "",
  ];
  for (const situation of situations) {
    const p = patientPlan(patient({ situation }));
    assert.ok(p.steps.length > 5, `"${situation}" produced ${p.steps.length} steps`);
    assert.ok(Number.isFinite(p.forecast.p50));
    assert.ok(p.forecast.p50 > 0);
  }
});

test("the floor view reorders queues and names the constraint", () => {
  const patients = [
    patient({ id: "a", name: "A", situation: "crushing chest pain", urgency: "high" }),
    patient({ id: "b", name: "B", situation: "stomach pain and vomiting", urgency: "medium" }),
    patient({ id: "c", name: "C", situation: "fell and my wrist is swollen", urgency: "low" }),
    patient({ id: "d", name: "D", situation: "fever and chills", urgency: "medium" }),
  ];
  const floor = floorPlan(patients, {});

  assert.equal(floor.patients, 4);
  assert.ok(floor.worklists.length > 0);
  assert.ok(floor.worklists.every((l) => l.items.length > 0));
  assert.ok(floor.constraint, "with four patients something governs throughput");
  assert.ok(floor.constraint.subordinate.length > 0, "and it says what to do about it");
  assert.ok(floor.load[floor.constraint.resource], "load is exposed for pricing speculation");
});

test("discharged patients are excluded from the floor view", () => {
  const floor = floorPlan([patient({ status: "discharged" })], {});
  assert.equal(floor.patients, 0);
  assert.equal(floor.worklists.length, 0);
});

test("a pre-op visit is a clearance, not an ED discharge", () => {
  const p = patientPlan(patient({
    situation: "I need to get my pre-admission testing done before my surgery next week",
    reason: "Pre-admission testing for scheduled surgery",
    department: "triage",
    urgency: "low",
    visit_kind: "preop",
  }));
  assert.equal(p.visitKind, "preop");
  assert.ok(p.steps.some((s) => s.id === "clearance"));
  assert.ok(!p.steps.some((s) => s.id === "ride-home"));
  assert.ok(!p.steps.some((s) => s.id === "prescriptions"));
});

test("screening imaging lets the patient leave after the scan, not the read", () => {
  const p = patientPlan(patient({
    situation: "Je dois faire une mammographie de routine",
    reason: "Routine mammography screening",
    department: "north",
    urgency: "low",
    visit_kind: "imaging",
  }));
  assert.equal(p.visitKind, "imaging");
  const depart = p.steps.find((s) => s.id === "depart");
  assert.ok(depart);
  assert.ok(depart.requires.includes("study-acquire"));
  assert.ok(!depart.requires.includes("study-read"));
});

test("a discharge-ready visit is not a new workup", () => {
  const p = patientPlan(patient({
    situation: "I think I'm ready to go home but nobody has brought the paperwork",
    reason: "Disposition ready — discharge stalled on paperwork",
    status: "pending_signature",
    urgency: "low",
  }));
  assert.ok(!p.steps.some((s) => s.id === "trop1-draw"));
  assert.ok(!p.steps.some((s) => s.id === "cultures-draw"));
  assert.ok(p.steps.some((s) => s.id === "ride-home"));
  assert.ok(p.steps.some((s) => s.id === "signoff"));
});

test("head trauma is not compiled as an ACS rule-out", () => {
  const p = patientPlan(patient({
    situation: "I was in a car accident, my head hurts and I'm dizzy",
    reason: "Head trauma from car accident — concussion evaluation",
    urgency: "high",
  }));
  assert.ok(p.steps.some((s) => s.id === "ct-acquire"));
  assert.ok(!p.steps.some((s) => s.id === "trop-interval"));
});

test("the floor view is stable on an empty hospital", () => {
  const floor = floorPlan([], {});
  assert.equal(floor.constraint, null);
  assert.equal(floor.minutesSaved, 0);
});
