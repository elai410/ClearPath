import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Point the store at a throwaway file before db.js is imported, so these tests
// exercise the real schema and queries without touching the dev database.
const tmp = path.join(os.tmpdir(), `clearpath-test-${process.pid}.db`);
process.env.CLEARPATH_DB = tmp;

const {
  db, migrate, createBlocker, createEscalation, escalationLevel,
  openEscalations, openBlockerRows, ackEscalation, closeEscalationsFor,
} = await import("../db.js");

migrate();

function seedPatient(id, overrides = {}) {
  db.prepare(`
    INSERT INTO patients (id, name, department, urgency, status, language)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    id,
    overrides.name || "Test Patient",
    overrides.department || "emergency",
    overrides.urgency || "medium",
    overrides.status || "waiting",
    "en"
  );
  return id;
}

test.after(() => {
  db.close();
  for (const suffix of ["", "-wal", "-shm"]) {
    fs.rmSync(tmp + suffix, { force: true });
  }
});

test("escalation levels are recorded once per rung", () => {
  const patient = seedPatient("p-rungs");
  const blocker = createBlocker(patient, { type: "imaging", title: "Head CT", owner_role: "Radiology" });

  assert.equal(escalationLevel(blocker.id), 0);
  assert.ok(createEscalation({ blocker_id: blocker.id, patient_id: patient, level: 1, owner_role: "Radiology" }));
  assert.equal(escalationLevel(blocker.id), 1);

  // The unique index makes the sweep idempotent: a restart or an overlapping
  // tick must not page the same team twice for the same rung.
  assert.equal(
    createEscalation({ blocker_id: blocker.id, patient_id: patient, level: 1, owner_role: "Radiology" }),
    null
  );
  assert.equal(escalationLevel(blocker.id), 1);
});

test("the board shows one row per blocker, at its current rung", () => {
  const patient = seedPatient("p-current");
  const blocker = createBlocker(patient, { type: "lab", title: "Troponin", owner_role: "Laboratory" });
  for (const level of [1, 2, 3]) {
    createEscalation({ blocker_id: blocker.id, patient_id: patient, level, owner_role: "Laboratory" });
  }

  const rows = openEscalations().filter((r) => r.blocker_id === blocker.id);
  assert.equal(rows.length, 1, "three rungs, one actionable row");
  assert.equal(rows[0].level, 3, "shown at the highest rung reached");
  assert.equal(rows[0].blocker_title, "Troponin");
});

test("acknowledging answers the whole chain of pages for that blocker", () => {
  const patient = seedPatient("p-ack");
  const blocker = createBlocker(patient, { type: "transport", title: "Transport", owner_role: "Patient transport" });
  const first = createEscalation({ blocker_id: blocker.id, patient_id: patient, level: 1 });
  createEscalation({ blocker_id: blocker.id, patient_id: patient, level: 2 });

  ackEscalation(first.id, "Patient transport");

  const rungs = db.prepare(`SELECT * FROM escalations WHERE blocker_id=?`).all(blocker.id);
  assert.equal(rungs.length, 2);
  assert.ok(rungs.every((r) => r.acknowledged_at), "both rungs answered by one click");
  assert.ok(rungs.every((r) => r.acknowledged_by === "Patient transport"));
});

test("acknowledging is not completing: the row stays open for follow-through", () => {
  const rows = openEscalations().filter((r) => r.patient_id === "p-ack");
  assert.equal(rows.length, 1, "an acknowledged escalation is still open work");
  assert.ok(rows[0].acknowledged_at);
});

test("resolving the blocker closes every rung it climbed", () => {
  const patient = seedPatient("p-resolve");
  const blocker = createBlocker(patient, { type: "pharmacy", title: "Discharge meds", owner_role: "Pharmacy" });
  createEscalation({ blocker_id: blocker.id, patient_id: patient, level: 1 });
  createEscalation({ blocker_id: blocker.id, patient_id: patient, level: 2 });

  db.prepare(`UPDATE blockers SET status='resolved' WHERE id=?`).run(blocker.id);
  closeEscalationsFor(blocker.id);

  assert.equal(escalationLevel(blocker.id), 0);
  assert.equal(openEscalations().filter((r) => r.blocker_id === blocker.id).length, 0);
});

test("discharged patients drop out of the sweep and the board", () => {
  const patient = seedPatient("p-gone", { status: "waiting" });
  const blocker = createBlocker(patient, { type: "lab", title: "Orphan lab", owner_role: "Laboratory" });
  createEscalation({ blocker_id: blocker.id, patient_id: patient, level: 1 });

  assert.ok(openBlockerRows().some((b) => b.id === blocker.id));

  db.prepare(`UPDATE patients SET status='discharged' WHERE id=?`).run(patient);
  assert.equal(openBlockerRows().filter((b) => b.id === blocker.id).length, 0, "no paging about someone who left");
  assert.equal(openEscalations().filter((r) => r.blocker_id === blocker.id).length, 0);
});
