import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  batchEligible, captureUtterance, consequentialVital, gate, looksLikeFact, mayExecute, openingCaptures,
} from "../src/lib/evidence.js";

const tmp = path.join(os.tmpdir(), `clearpath-evidence-${process.pid}.db`);
process.env.CLEARPATH_DB = tmp;
const { db, migrate, insertClaim, correctClaim, verifyClaim, getClaim, listClaims, claimLineage } = await import("../db.js");
migrate();

test.after(() => {
  db.close();
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(tmp + suffix, { force: true });
});

test("a prediction is not rendered as a fact", () => {
  assert.equal(looksLikeFact("PREDICTED"), false);
  assert.equal(looksLikeFact("AI_EXTRACTED"), false);
  assert.equal(looksLikeFact("HUMAN_VERIFIED"), true);
  assert.equal(looksLikeFact("SUPERSEDED"), false);
});

test("a spoken round becomes separate captured measurements", () => {
  const claims = captureUtterance("Pulse 72. SpO2 98%. Blood pressure 118 over 76. Temperature 36.6. Respiratory rate 16.");
  const measures = claims.map((c) => c.proposition.measure).sort();
  assert.deepEqual(measures, ["bp", "pulse", "rr", "spo2", "temp"]);
  assert.ok(claims.every((c) => c.kind === "observation"));
});

test("a spoken vital keeps the words it was interpreted from", () => {
  const [bp] = captureUtterance("Blood pressure 118 over 76, and let's get a CT.");
  assert.equal(bp.kind, "observation");
  assert.equal(bp.proposition.display, "118/76 mmHg");
  assert.equal(bp.evidence.quote, "Blood pressure 118 over 76");
  assert.equal(bp.consequential, false);
});

test("an intention extracted from the same sentence is not an observation", () => {
  const claims = captureUtterance("Blood pressure 118 over 76, and let's get a CT.");
  const intent = claims.find((c) => c.kind === "intent");
  assert.equal(intent.display, "let's get a CT");
  assert.equal(intent.proposition.text, "Get CT");
  assert.equal(gate(intent).execute, false);
  assert.match(gate(intent).reason, /not an order/);
});

test("an unverified low oxygen reading can be shown and cannot be acted on", () => {
  const claim = {
    kind: "observation", status: "unverified", clinical: false,
    consequential: consequentialVital({ measure: "spo2", value: 89 }),
  };
  assert.equal(claim.consequential, true);
  const decision = gate(claim);
  assert.equal(decision.surface, true);
  assert.equal(decision.execute, false);
  assert.equal(mayExecute(claim, 3).allowed, false);
  assert.equal(batchEligible(claim), false, "the abnormal one is not swept into a batch");
});

test("a normal unverified vital is batchable and still not executable", () => {
  const claim = { kind: "observation", status: "unverified", consequential: false, clinical: false };
  assert.equal(batchEligible(claim), true);
  assert.equal(mayExecute(claim, 3).allowed, false);
});

test("a clinical act is refused even when someone asks the system to execute it", () => {
  const claim = { kind: "order", clinical: true, status: "verified" };
  const decision = mayExecute(claim, 5);
  assert.equal(decision.allowed, false);
  assert.equal(decision.level, 5);
});

test("reversible preparation can be staged and still cannot commit care", () => {
  const claim = { kind: "recommendation", reversible: true, status: "verified", clinical: false };
  const decision = mayExecute(claim, 2);
  assert.equal(decision.allowed, true);
  assert.equal(decision.prepare, true);
  assert.equal(decision.execute, false);
});

test("correcting a claim keeps the original evidence", () => {
  const original = insertClaim({
    patientId: "p1",
    kind: "observation",
    layer: "observation",
    display: "89%",
    proposition: { measure: "spo2", value: 89, display: "89%" },
    evidence: { quote: "Monitor frame: SpO2 89%", source: "monitor" },
    consequential: true,
  });
  const { original: kept, replacement } = correctClaim(original.id, "nurse", {
    measure: "spo2", value: 98, display: "98%",
  }, "98%");

  assert.equal(kept.status, "corrected");
  assert.equal(kept.epistemic_state, "SUPERSEDED");
  assert.equal(replacement.epistemic_state, "HUMAN_VERIFIED");
  assert.equal(kept.proposition.value, 89, "the first reading is still the first reading");
  assert.equal(kept.evidence.quote, "Monitor frame: SpO2 89%");
  assert.equal(replacement.status, "verified");
  assert.equal(replacement.proposition.value, 98);
  assert.equal(replacement.supersedes, original.id);
  assert.equal(getClaim(original.id).evidence.quote, "Monitor frame: SpO2 89%");
});

test("verifying does not delete the quote", () => {
  const claim = insertClaim({
    patientId: "p1",
    kind: "observation",
    layer: "observation",
    display: "118/76 mmHg",
    proposition: { measure: "bp", display: "118/76 mmHg" },
    evidence: { quote: "Blood pressure 118 over 76" },
  });
  const verified = verifyClaim(claim.id, "nurse");
  assert.equal(verified.status, "verified");
  assert.equal(verified.evidence.quote, "Blood pressure 118 over 76");
  assert.equal(verified.verified_by, "nurse");
  assert.equal(verified.epistemic_state, "HUMAN_VERIFIED");
});

test("lineage keeps the extraction and the correction in order", () => {
  const original = insertClaim({
    patientId: "p-line",
    kind: "observation",
    layer: "observation",
    display: "118/76 mmHg",
    proposition: { measure: "bp", display: "118/76 mmHg" },
    evidence: { quote: "Blood pressure 118 over 76", source: "spoken" },
  });
  const { replacement } = correctClaim(original.id, "nurse", {
    measure: "bp", display: "120/78 mmHg", systolic: 120, diastolic: 78,
  }, "120/78 mmHg");
  const chain = claimLineage(replacement.id);
  assert.deepEqual(chain.map((c) => c.epistemic_state), ["SUPERSEDED", "HUMAN_VERIFIED"]);
  assert.equal(chain[0].evidence.quote, "Blood pressure 118 over 76");
  assert.equal(chain[1].display, "120/78 mmHg");
  assert.equal(chain[1].supersedes, chain[0].id);
});

test("sample captures are labeled synthetic and only one is abnormal", () => {
  const captures = openingCaptures([
    { id: "a", name: "Ada", situation: "crushing chest pain", room: "4" },
    { id: "b", name: "Bo", situation: "crushing chest pain", room: "5" },
  ]);
  assert.ok(captures.every((c) => c.evidence.synthetic));
  assert.equal(captures.filter((c) => c.consequential).length, 1);
  assert.equal(listClaims().length >= 2, true);
});
