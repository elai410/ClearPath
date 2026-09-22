import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Boot the real server on an ephemeral port against a throwaway database, so
// these assertions cover the actual Express wiring without disturbing whatever
// is running on 3001.
const tmp = path.join(os.tmpdir(), `clearpath-api-${process.pid}.db`);
process.env.CLEARPATH_DB = tmp;
process.env.PORT = "0";

const { db } = await import("../db.js");
const { server } = await import("../server.js");

await new Promise((resolve) => {
  if (server.listening) return resolve();
  server.once("listening", resolve);
});
const base = `http://127.0.0.1:${server.address().port}/api`;

function seed(id, over = {}) {
  db.prepare(`
    INSERT INTO patients (id, name, situation, department, urgency, status, language, checked_in_at, last_updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now','-40 minutes'), datetime('now','-40 minutes'))
  `).run(
    id,
    over.name || "API Patient",
    over.situation || "crushing chest pain radiating down my left arm",
    over.department || "emergency",
    over.urgency || "high",
    over.status || "waiting",
    over.language || "en"
  );
}

test.after(() => {
  server.close();
  db.close();
  for (const s of ["", "-wal", "-shm"]) fs.rmSync(tmp + s, { force: true });
});

const get = async (p) => {
  const res = await fetch(`${base}${p}`);
  return { status: res.status, body: await res.json() };
};

test("the floor endpoint is stable on an empty hospital", async () => {
  const { status, body } = await get("/floor");
  assert.equal(status, 200);
  assert.equal(body.patients, 0);
  assert.equal(body.constraint, null);
  assert.deepEqual(body.worklists, []);
});

test("the floor endpoint plans real rows and exposes the presence split", async () => {
  seed("api-a", { name: "Alpha" });
  seed("api-b", { name: "Bravo", situation: "bad stomach pain and vomiting", urgency: "medium" });

  const { status, body } = await get("/floor");
  assert.equal(status, 200);
  assert.equal(body.patients, 2);
  assert.ok(body.worklists.length > 0);
  assert.ok(body.remainingMinutes > 0);
  assert.ok(
    body.coordinationMinutes > body.presenceMinutes,
    `coordination ${body.coordinationMinutes} should exceed presence ${body.presenceMinutes}`
  );
  assert.ok(body.worklists.every((l) => l.items.every((i) => "departmentName" in i)),
    "department names are resolved server-side");
});

test("a patient plan comes back with a critical path and a forecast", async () => {
  const { status, body } = await get("/patients/api-a/plan");
  assert.equal(status, 200);
  assert.match(body.presentation, /ACS/);
  assert.ok(body.criticalPath.length > 3);
  assert.ok(body.forecast.confident >= body.forecast.p50);
  assert.ok(body.clockBound, "chest pain is clock-bound");
  assert.ok(body.blockedBy);
});

test("an unknown patient plan is a 404, not a crash", async () => {
  const { status } = await get("/patients/does-not-exist/plan");
  assert.equal(status, 404);
});

test("the plan reflects a blocker the moment it is recorded", async () => {
  const before = await get("/patients/api-a/plan");
  const drawDone = before.body.steps.find((s) => s.id === "trop1-draw");
  assert.notEqual(drawDone.state, "done", "nothing has happened yet");

  const created = await fetch(`${base}/blockers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ patientId: "api-a", type: "lab", title: "Troponin", detail: "first set" }),
  });
  assert.equal(created.status, 200);

  const after = await get("/patients/api-a/plan");
  const run = after.body.steps.find((s) => s.id === "trop1-run");
  assert.equal(run.state, "running", "the analysis is now underway");
  assert.equal(
    after.body.steps.find((s) => s.id === "trop1-draw").state, "done",
    "and the draw it implies is recorded as done"
  );
});
