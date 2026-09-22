import assert from "node:assert/strict";
import test from "node:test";
import {
  listenAmbient, profileFor, sampleMonitors, shouldEmit, shouldWatch, tickFloor, tickPatient, vitalsHolds,
} from "../src/lib/agent/vitals.js";
import { gate, mayExecute } from "../src/lib/evidence.js";

const chest = {
  id: "james", name: "James Carter", visit_kind: "emergency", department: "emergency",
  urgency: "high", status: "in_progress",
  situation: "Severe chest pain radiating to my left arm",
  reason: "Chest pain with arm radiation — possible cardiac emergency",
};

const trauma = {
  id: "david", name: "David Kim", visit_kind: "emergency", department: "emergency",
  urgency: "high", status: "pending_test",
  situation: "I was in a car accident, my head hurts and I'm dizzy",
  reason: "Head trauma from car accident — concussion evaluation",
};

const clinic = {
  id: "helen", name: "Helen Park", visit_kind: "clinic", department: "dana",
  urgency: "low", status: "waiting",
  situation: "I've had blurry vision for a week",
};

test("the agent watches acute beds and ignores a routine clinic wait", () => {
  assert.equal(shouldWatch(chest), true);
  assert.equal(shouldWatch(trauma), true);
  assert.equal(shouldWatch(clinic), false);
  assert.equal(shouldWatch({ ...chest, status: "discharged" }), false);
});

test("a stable ordinary reading is silence, not a task", () => {
  const prev = { measure: "spo2", value: 98, consequential: false };
  const next = { measure: "spo2", value: 98, consequential: false };
  assert.equal(shouldEmit(prev, next).emit, false);
  assert.equal(shouldEmit(prev, next).reason, "stable");
});

test("the first ordinary reading is stored, not inboxed", () => {
  const next = { measure: "pulse", value: 72, consequential: false };
  assert.deepEqual(shouldEmit(null, next), { emit: false, reason: "baseline-quiet" });
});

test("the first consequential reading is spoken", () => {
  const next = { measure: "spo2", value: 89, consequential: true };
  assert.equal(shouldEmit(null, next).emit, true);
  assert.equal(shouldEmit(null, next).reason, "baseline-consequential");
});

test("crossing into the consequential band is the only reason to interrupt", () => {
  const prev = { measure: "pulse", value: 96, consequential: false };
  const next = { measure: "pulse", value: 138, consequential: true };
  assert.equal(shouldEmit(prev, next).reason, "crossed");
  const back = shouldEmit(next, prev);
  assert.equal(back.reason, "recovered");
});

test("an ACS profile starts with a low saturation, a clinic profile does not", () => {
  assert.equal(profileFor(chest).spo2, 89);
  assert.ok(profileFor(clinic).spo2 >= 96);
});

test("a watched bed that is already pictured stays quiet on tick 0", () => {
  const previous = {
    spo2: { measure: "spo2", value: 89, consequential: true },
    pulse: { measure: "pulse", value: 92, consequential: false },
    bp: { measure: "bp", value: 118, consequential: false },
    temp: { measure: "temp", value: 36.7, consequential: false },
    rr: { measure: "rr", value: 18, consequential: false },
  };
  const result = tickPatient(chest, { tick: 0, previous });
  assert.equal(result.watching, true);
  assert.equal(result.quiet, true);
  assert.equal(result.events.length, 0);
});

test("tick 3 on head trauma speaks because the pulse crossed", () => {
  const previous = {
    spo2: { measure: "spo2", value: 98, consequential: false },
    pulse: { measure: "pulse", value: 96, consequential: false },
    bp: { measure: "bp", value: 132, consequential: false },
    temp: { measure: "temp", value: 36.8, consequential: false },
    rr: { measure: "rr", value: 16, consequential: false },
  };
  const result = tickPatient(trauma, { tick: 3, previous });
  const pulse = result.events.find((e) => e.proposition.measure === "pulse");
  assert.ok(pulse, "expected a pulse event");
  assert.equal(pulse.consequential, true);
  assert.equal(pulse.evidence.source, "monitor");
  assert.equal(pulse.evidence.speaker, "passive-agent");
  assert.equal(mayExecute(pulse, 3).allowed, false);
  assert.equal(gate(pulse).execute, false);
});

test("an unwatched clinic bed produces no claims", () => {
  const result = tickPatient(clinic, { tick: 3, previous: {} });
  assert.equal(result.watching, false);
  assert.equal(result.events.length, 0);
});

test("the floor tick keeps most beds silent", () => {
  const previousByPatient = {
    james: {
      spo2: { measure: "spo2", value: 89, consequential: true },
      pulse: { measure: "pulse", value: 92, consequential: false },
      bp: { measure: "bp", value: 118, consequential: false },
      temp: { measure: "temp", value: 36.7, consequential: false },
      rr: { measure: "rr", value: 18, consequential: false },
    },
  };
  const floor = tickFloor([chest, clinic], { tick: 0, previousByPatient });
  assert.equal(floor.watching, 1);
  assert.equal(floor.events.length, 0);
});

test("unverified consequential vitals hold departure, they do not treat", () => {
  const holds = vitalsHolds([
    {
      kind: "observation", status: "unverified", consequential: true,
      patientId: "james", patientName: "James Carter",
      display: "SpO2 89%", proposition: { measure: "spo2", value: 89 },
    },
  ]);
  assert.equal(holds.length, 1);
  assert.match(holds[0].title, /Hold departure/);
  assert.match(holds[0].reason, /not a diagnosis/);
});

test("ambient listening reuses capture and does not invent a prompt", () => {
  const claims = listenAmbient("Pulse 72. SpO2 98%.");
  assert.equal(claims.length, 2);
  assert.ok(claims.every((c) => c.evidence.agent));
});

test("sampleMonitors is deterministic for the same tick", () => {
  const a = sampleMonitors(trauma, { tick: 1 });
  const b = sampleMonitors(trauma, { tick: 1 });
  assert.deepEqual(a.map((r) => r.display), b.map((r) => r.display));
});
