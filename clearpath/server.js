import "dotenv/config";
import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import cors from "cors";
import { v4 as uuid } from "uuid";
import {
  db, migrate, addEvent, getBlockers, getEvents, blockersByPatientIds, createBlocker, getMeta,
  openBlockerRows, escalationLevel, createEscalation, openEscalations, ackEscalation,
  closeEscalationsFor,
  insertClaim, listClaims, getClaim, verifyClaim, rejectClaim, correctClaim,
  claimLineage, recordAudit,
  upsertVital, listLatestVitals, hydrateVitalsFromClaims, openObservationFor, retireUnverified,
} from "./db.js";
import { floorPlan, patientPlan, controlLoop } from "./src/lib/plan/index.js";
import { batchEligible, captureUtterance, gate, mayExecute, openingCaptures, planAuthority, presentEpistemic } from "./src/lib/evidence.js";
import { listenAmbient, shouldWatch, snapshotMap, tickFloor, vitalsHolds } from "./src/lib/agent/vitals.js";
import {
  BLOCKER_TYPES,
  dueEscalationLevel,
  escalationRung,
  typicalMinutesFor,
  waitMinutes,
  STATUS_TO_STAGE,
  STAGE_TO_STATUS,
  URGENCY_RANK,
  enrichPatient,
  computeFlow,
  inferBlockersFromSituation,
  currentStage,
  STAGES,
} from "./src/lib/journey.js";
import { freezeAt } from "./src/lib/clock.js";
import {
  converse,
  DEFAULT_UI,
  explainStatus,
  staffBrief,
  draftDischarge,
  followUpReminder,
  handoffSummary,
  conciergeAnswer,
} from "./ai.js";
import { DEPARTMENTS, DEPT_NAMES, DEPT_ROOM } from "./src/constants.js";

migrate();

const frozenNow = getMeta("frozen_now");
if (frozenNow) {
  const ms = Date.parse(frozenNow);
  if (Number.isFinite(ms)) {
    freezeAt(ms);
    console.log(`Clock frozen at ${frozenNow}`);
  }
}

function seedEvidence() {
  const existing = db.prepare(`SELECT COUNT(*) AS n FROM claims`).get();
  if (existing?.n) return;
  const patients = db.prepare(`SELECT * FROM patients WHERE status != 'discharged'`).all();
  for (const claim of openingCaptures(patients)) insertClaim(claim);
}

seedEvidence();
hydrateVitalsFromClaims();

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const patientSockets = new Map();

wss.on("connection", (ws, req) => {
  const id = new URL(req.url, "http://localhost").searchParams.get("id");
  if (id) patientSockets.set(id, ws);
  ws.on("close", () => { if (id) patientSockets.delete(id); });
});

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach((c) => { if (c.readyState === 1) c.send(msg); });
}

function notifyPatient(id, data) {
  const ws = patientSockets.get(id);
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(data));
}

function getQueue(department) {
  return db.prepare(
    `SELECT * FROM patients WHERE department=? AND status='waiting'
     ORDER BY CASE urgency WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, checked_in_at ASC`
  ).all(department);
}

function getActivePatients() {
  return db.prepare(
    `SELECT * FROM patients WHERE status != 'discharged' ORDER BY checked_in_at ASC`
  ).all();
}

function recalcPositions(department) {
  const queue = getQueue(department);
  const stmt = db.prepare(`UPDATE patients SET queue_position=? WHERE id=?`);
  queue.forEach((p, i) => stmt.run(i + 1, p.id));
  return queue;
}

function getPatient(id) {
  return db.prepare(`SELECT * FROM patients WHERE id=?`).get(id);
}

function touch(id) {
  db.prepare(`UPDATE patients SET last_updated_at=datetime('now') WHERE id=?`).run(id);
}

function deptName(id) {
  return DEPT_NAMES[id] || id;
}

function enrich(patient) {
  if (!patient) return null;
  return enrichPatient(patient, getBlockers(patient.id), { deptName: deptName(patient.department) });
}

function journeyPayload(patient) {
  const blockers = getBlockers(patient.id);
  const events = getEvents(patient.id);
  const packed = enrichPatient(patient, blockers, { deptName: deptName(patient.department) });
  const plan = patientPlan(patient, blockers);
  const operating = {
    visitKind: plan.visitKind,
    blockedBy: plan.blockedBy,
    clockBound: plan.clockBound,
    remainingMinutes: plan.forecast?.confident ?? packed.predicted_remaining,
    presenceMinutes: plan.presenceMinutes,
    startableNow: plan.startableNow,
  };
  return {
    ...packed,
    predicted_remaining: operating.remainingMinutes,
    events,
    departmentMeta: DEPARTMENTS[patient.department] || DEPARTMENTS.triage,
    stages: STAGES,
    operating,
  };
}

function flowPayload() {
  const patients = getActivePatients();
  const map = blockersByPatientIds(patients.map((p) => p.id));
  return computeFlow(patients, map, DEPT_NAMES);
}

function notifyFlow() {
  broadcast({ type: "FLOW_UPDATED", queue: getActivePatients() });
}

/**
 * Walks every open dependency and records any escalation rung it has newly
 * earned. This is the difference between a dashboard and a coordinator: nobody
 * has to be looking at the screen for an overdue lab to find an owner.
 *
 * Recording a rung surfaces it to staff and writes an audit event. Actually
 * paging a pager would need a real notification integration; this is the
 * decision layer that such an integration would consume.
 */
function sweepEscalations() {
  const rows = openBlockerRows();
  let raised = 0;

  for (const blocker of rows) {
    const due = dueEscalationLevel(blocker);
    if (!due) continue;
    const current = escalationLevel(blocker.id);
    if (due <= current) continue;

    // Climb one rung per sweep so a long-stale blocker still leaves a trail
    // through each audience rather than jumping straight to the flow lead.
    const level = current + 1;
    const rung = escalationRung(level);
    const elapsed = waitMinutes(blocker.created_at);
    const reason = `${blocker.title} has been open ${elapsed} min against a typical ${typicalMinutesFor(blocker)} min.`;

    const record = createEscalation({
      blocker_id: blocker.id,
      patient_id: blocker.patient_id,
      level,
      owner_role: blocker.owner_role,
      notified: rung.audience(blocker),
      reason,
    });
    if (!record) continue;

    db.prepare(
      `UPDATE blockers SET status='escalated', escalated_at=datetime('now'), updated_at=datetime('now') WHERE id=? AND status='pending'`
    ).run(blocker.id);
    addEvent(blocker.patient_id, "escalated", `${rung.label}: ${blocker.title}`, reason);
    raised += 1;
  }

  if (raised) {
    broadcast({ type: "ESCALATIONS_UPDATED", count: raised });
    notifyFlow();
  }
  return raised;
}

const ESCALATION_SWEEP_MS = 20000;
// Unref'd so the sweep never becomes the reason the process refuses to exit.
setInterval(sweepEscalations, ESCALATION_SWEEP_MS).unref();

let agentTick = 0;

function persistAgentSnapshot(beds) {
  for (const bed of beds) {
    for (const row of bed.snapshot || []) {
      upsertVital({
        patientId: bed.patientId,
        measure: row.measure,
        value: row.measure === "bp" ? row.proposition?.systolic : row.value,
        display: row.display,
        consequential: row.consequential,
      });
    }
  }
}

function ingestAgentEvents(events) {
  const created = [];
  for (const spec of events) {
    const prior = openObservationFor(spec.patientId, spec.proposition?.measure);
    if (prior && prior.display === spec.display) continue;
    const row = insertClaim(spec);
    if (!row) continue;
    if (prior) retireUnverified(prior.id);
    created.push(row);
    if (spec.consequential) {
      addEvent(spec.patientId, "vitals", `Monitor: ${spec.display}`, spec.emitReason || "passive agent");
    }
  }
  return created;
}

function runAgentTick(requestedTick) {
  const patients = getActivePatients();
  const tick = requestedTick ?? agentTick;
  const result = tickFloor(patients, { tick, previousByPatient: snapshotMap(listLatestVitals()) });
  persistAgentSnapshot(result.beds);
  const created = ingestAgentEvents(result.events);
  agentTick = tick + 1;
  if (created.length) {
    broadcast({ type: "EVIDENCE_UPDATED", count: created.length });
    notifyFlow();
  }
  return { ...result, created: created.length };
}

function agentPayload() {
  const patients = getActivePatients();
  const latest = listLatestVitals();
  const byId = {};
  for (const row of latest) {
    byId[row.patient_id] = byId[row.patient_id] || [];
    byId[row.patient_id].push(row);
  }
  const holds = vitalsHolds(listClaims());
  const held = new Set(holds.map((h) => h.patientId));
  const beds = patients.map((p) => {
    const watching = shouldWatch(p);
    const vitals = byId[p.id] || [];
    const exception = vitals.some((v) => v.consequential) || held.has(p.id);
    return {
      patientId: p.id,
      name: p.name,
      room: p.room,
      watching,
      exception,
      quiet: watching && !exception,
      vitals: vitals.map((v) => ({
        measure: v.measure,
        display: v.display,
        consequential: Boolean(v.consequential),
      })),
    };
  });
  return {
    tick: agentTick,
    watching: beds.filter((b) => b.watching).length,
    silent: beds.filter((b) => b.quiet).length,
    exceptions: beds.filter((b) => b.exception).length,
    holds,
    beds,
  };
}

setInterval(() => runAgentTick(), 10000).unref();
runAgentTick(0);

function seedBlockers(patient, specs) {
  specs.forEach((spec) => {
    const meta = BLOCKER_TYPES[spec.type] || {};
    createBlocker(patient.id, {
      ...spec,
      owner_role: spec.owner_role || meta.owner,
      eta_minutes: spec.eta_minutes || meta.typicalMins,
    });
  });
}

const PATIENT_STATUS_MESSAGES = {
  in_progress: "A care team member is with you now.",
  pending_test: "Your test is in progress. We'll update you when results are ready.",
  pending_signature: "Your paperwork is being reviewed.",
  pending_transport: "Transport has been arranged and is on the way.",
  pending_bed: "We're preparing your room. Thank you for your patience.",
  called: "It's your turn. Please head to the desk.",
  waiting: "You're in line. We'll alert you when it's your turn.",
};

app.post("/api/checkin", (req, res) => {
  const {
    name, situation, summary, department, room, floor, urgency, reason,
    phone, language, sentiment, sentimentNote, aiContext,
  } = req.body;
  const id = uuid();
  const share = uuid().slice(0, 8);
  const count = db.prepare(
    `SELECT COUNT(*) as c FROM patients WHERE department=? AND status='waiting'`
  ).get(department).c;

  db.prepare(`
    INSERT INTO patients (
      id, name, situation, summary, department, room, floor, urgency, reason,
      phone, language, sentiment, sentimentNote, queue_position, stage, share_token, ai_context, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'waiting', ?, ?, 'waiting')
  `).run(
    id,
    name || "Patient",
    situation,
    summary || situation,
    department,
    room,
    floor,
    urgency || "low",
    reason,
    phone || "",
    language || "English",
    sentiment || "calm",
    sentimentNote || "",
    count + 1,
    share,
    aiContext ? JSON.stringify(aiContext) : null
  );

  const patient = getPatient(id);
  seedBlockers(patient, inferBlockersFromSituation(patient));
  addEvent(id, "checkin", "Checked in", `${deptName(department)} · ${urgency || "low"} priority`);
  notifyFlow();
  broadcast({ type: "PATIENT_JOINED", patient: enrich(patient), queue: getActivePatients() });
  res.json({ success: true, patient: journeyPayload(getPatient(id)) });
});

app.get("/api/patient/:id", (req, res) => {
  const patient = getPatient(req.params.id);
  if (!patient) return res.status(404).json({ error: "Not found" });
  res.json(enrich(patient));
});

app.get("/api/journey/:id", (req, res) => {
  const patient = getPatient(req.params.id);
  if (!patient) return res.status(404).json({ error: "Not found" });
  res.json(journeyPayload(patient));
});

app.get("/api/follow/:token", (req, res) => {
  const patient = db.prepare(`SELECT * FROM patients WHERE share_token=?`).get(req.params.token);
  if (!patient) return res.status(404).json({ error: "Not found" });
  const payload = journeyPayload(patient);
  res.json({
    name: payload.name,
    stage: payload.stage,
    now: payload.now,
    timeline: payload.timeline,
    predicted_remaining: payload.predicted_remaining,
    wait_minutes: payload.wait_minutes,
    departmentMeta: payload.departmentMeta,
    language: payload.language,
    status: payload.status,
    open_blocker_count: payload.open_blocker_count,
    nowCard: payload.now,
    operating: payload.operating && {
      visitKind: payload.operating.visitKind,
      blockedBy: payload.operating.blockedBy,
      clockBound: payload.operating.clockBound,
      remainingMinutes: payload.operating.remainingMinutes,
    },
  });
});

app.get("/api/queue/:department", (req, res) => {
  res.json(getQueue(req.params.department).map(enrich));
});

app.get("/api/patients", (req, res) => {
  const patients = getActivePatients();
  const map = blockersByPatientIds(patients.map((p) => p.id));
  res.json(patients.map((p) => enrichPatient(p, map[p.id] || [], { deptName: deptName(p.department) })));
});

app.get("/api/flow", (_req, res) => {
  res.json(flowPayload());
});

app.post("/api/call-next/:department", (req, res) => {
  const queue = getQueue(req.params.department);
  if (!queue.length) return res.json({ success: false, message: "Queue empty" });
  const next = queue[0];
  return callPatient(next.id, res);
});

app.post("/api/call/:id", (req, res) => callPatient(req.params.id, res));

function callPatient(id, res) {
  const patient = getPatient(id);
  if (!patient) return res.status(404).json({ error: "Not found" });
  db.prepare(
    `UPDATE patients SET status='called', stage='evaluation', called_at=datetime('now'), last_updated_at=datetime('now') WHERE id=?`
  ).run(id);
  recalcPositions(patient.department);
  addEvent(id, "called", "Called for care", `Please go to ${patient.room}`);
  const updated = getPatient(id);
  notifyPatient(id, { type: "YOU_ARE_CALLED", patient: enrich(updated) });
  notifyFlow();
  res.json({ success: true, patient: enrich(updated) });
}

app.post("/api/move/:id", (req, res) => {
  const { department, room, floor, reason } = req.body;
  const current = getPatient(req.params.id);
  if (!current) return res.status(404).json({ error: "Not found" });
  const dest = DEPT_ROOM[department] || { room: room || "East Pavilion", floor: floor || "1" };
  db.prepare(
    `UPDATE patients SET department=?, room=?, floor=?, reason=?, status='waiting', stage='wayfinding', last_updated_at=datetime('now') WHERE id=?`
  ).run(department, room || dest.room, floor || dest.floor, reason || `Transferred to ${deptName(department)}`, req.params.id);
  recalcPositions(department);
  addEvent(req.params.id, "move", `Moved to ${deptName(department)}`, reason || "");
  createBlocker(req.params.id, {
    type: "transport",
    title: `Travel to ${deptName(department)}`,
    detail: "Patient needs to physically arrive before the new queue is meaningful.",
    owner_role: BLOCKER_TYPES.transport.owner,
    eta_minutes: 15,
    can_parallel: 0,
  });
  const updated = getPatient(req.params.id);
  notifyPatient(req.params.id, { type: "DEPARTMENT_CHANGED", patient: enrich(updated) });
  notifyFlow();
  res.json({ success: true, patient: enrich(updated) });
});

app.post("/api/discharge/:id", (req, res) => {
  const { instructions } = req.body;
  const text = instructions || "You have been discharged. Please follow up with your primary care clinician if symptoms return or worsen.";
  db.prepare(
    `UPDATE patients SET status='discharged', stage='discharge', discharged_at=datetime('now'), last_updated_at=datetime('now') WHERE id=?`
  ).run(req.params.id);
  db.prepare(`UPDATE blockers SET status='resolved', resolved_at=datetime('now') WHERE patient_id=? AND status != 'resolved'`).run(req.params.id);
  addEvent(req.params.id, "discharge", "Discharged", text);
  notifyPatient(req.params.id, { type: "DISCHARGED", instructions: text });
  notifyFlow();
  res.json({ success: true });
});

app.post("/api/update-status/:id", (req, res) => {
  const { status } = req.body;
  const valid = ["waiting", "in_progress", "pending_test", "pending_signature", "pending_transport", "pending_bed", "called"];
  if (!valid.includes(status)) return res.status(400).json({ error: "Invalid status" });
  const stage = STATUS_TO_STAGE[status] || "waiting";
  db.prepare(`UPDATE patients SET status=?, stage=?, last_updated_at=datetime('now') WHERE id=?`).run(status, stage, req.params.id);
  addEvent(req.params.id, "status", `Status → ${status.replaceAll("_", " ")}`);
  const updated = getPatient(req.params.id);
  if (status === "pending_test") {
    const existing = getBlockers(updated.id, { includeResolved: false });
    if (!existing.some((b) => b.type === "lab" || b.type === "imaging")) {
      seedBlockers(updated, inferBlockersFromSituation({ ...updated, status }));
    }
  }
  if (PATIENT_STATUS_MESSAGES[status]) {
    notifyPatient(req.params.id, {
      type: "STATUS_UPDATE",
      status,
      stage,
      message: PATIENT_STATUS_MESSAGES[status],
      patient: enrich(updated),
    });
  }
  notifyFlow();
  res.json({ success: true, patient: enrich(getPatient(req.params.id)) });
});

app.post("/api/advance/:id", (req, res) => {
  const patient = getPatient(req.params.id);
  if (!patient) return res.status(404).json({ error: "Not found" });
  const packed = enrich(patient);
  const next = packed.next_stage.id;
  const status = STAGE_TO_STATUS[next] || patient.status;
  db.prepare(`UPDATE patients SET status=?, stage=?, last_updated_at=datetime('now') WHERE id=?`).run(status, next, req.params.id);
  addEvent(req.params.id, "advance", `Advanced to ${packed.next_stage.label}`);
  const updated = getPatient(req.params.id);
  notifyPatient(req.params.id, {
    type: "STATUS_UPDATE",
    status: updated.status,
    stage: updated.stage,
    message: PATIENT_STATUS_MESSAGES[updated.status] || "Your visit has moved forward.",
    patient: enrich(updated),
  });
  notifyFlow();
  res.json({ success: true, patient: enrich(updated) });
});

app.post("/api/prepare-discharge/:id", (req, res) => {
  const patient = getPatient(req.params.id);
  if (!patient) return res.status(404).json({ error: "Not found" });
  const open = getBlockers(patient.id, { includeResolved: false });
  if (!open.some((b) => b.type === "documentation")) {
    createBlocker(patient.id, {
      type: "documentation",
      title: "Discharge paperwork",
      detail: "Started while care continues so they aren't waiting on paperwork at the end.",
      owner_role: BLOCKER_TYPES.documentation.owner,
      eta_minutes: 15,
      can_parallel: 1,
    });
  }
  if (!open.some((b) => b.type === "pharmacy") && patient.urgency !== "low") {
    createBlocker(patient.id, {
      type: "pharmacy",
      title: "Discharge medications",
      detail: "Pharmacy can fill now rather than after the last clinical step.",
      owner_role: BLOCKER_TYPES.pharmacy.owner,
      eta_minutes: 25,
      can_parallel: 1,
    });
  }
  addEvent(req.params.id, "prep", "Discharge paperwork started while care continues");
  notifyPatient(req.params.id, {
    type: "STATUS_UPDATE",
    status: patient.status,
    message: "Your team has already started getting you ready to go home.",
  });
  notifyFlow();
  res.json({ success: true, patient: enrich(getPatient(req.params.id)) });
});

app.post("/api/blockers", (req, res) => {
  const { patientId, type, title, detail, owner_role } = req.body;
  if (!patientId || !type) return res.status(400).json({ error: "patientId and type required" });
  const meta = BLOCKER_TYPES[type] || {};
  const blocker = createBlocker(patientId, {
    type,
    title: title || meta.label || type,
    detail,
    owner_role: owner_role || meta.owner,
    eta_minutes: meta.typicalMins,
  });
  touch(patientId);
  notifyPatient(patientId, {
    type: "STATUS_UPDATE",
    message: `A new step was added: ${blocker.title}.`,
  });
  notifyFlow();
  res.json({ success: true, blocker });
});

app.post("/api/blockers/:id/resolve", (req, res) => {
  const blocker = db.prepare(`SELECT * FROM blockers WHERE id=?`).get(req.params.id);
  if (!blocker) return res.status(404).json({ error: "Not found" });
  db.prepare(`UPDATE blockers SET status='resolved', resolved_at=datetime('now'), updated_at=datetime('now') WHERE id=?`).run(req.params.id);
  closeEscalationsFor(req.params.id);
  addEvent(blocker.patient_id, "resolved", `${blocker.title} completed`);
  touch(blocker.patient_id);
  const remaining = getBlockers(blocker.patient_id, { includeResolved: false });
  notifyPatient(blocker.patient_id, {
    type: "STATUS_UPDATE",
    message: remaining.length
      ? `${blocker.title} is done. Still waiting on ${remaining[0].title}.`
      : `${blocker.title} is done. Your visit can move forward.`,
  });
  notifyFlow();
  res.json({ success: true, patient: enrich(getPatient(blocker.patient_id)) });
});

app.post("/api/blockers/:id/escalate", (req, res) => {
  const blocker = db.prepare(`SELECT * FROM blockers WHERE id=?`).get(req.params.id);
  if (!blocker) return res.status(404).json({ error: "Not found" });
  db.prepare(`UPDATE blockers SET status='escalated', escalated_at=datetime('now'), updated_at=datetime('now') WHERE id=?`).run(req.params.id);
  addEvent(blocker.patient_id, "escalated", `Escalated ${blocker.title}`, `Owner: ${blocker.owner_role}`);
  touch(blocker.patient_id);
  notifyFlow();
  res.json({ success: true, patient: enrich(getPatient(blocker.patient_id)) });
});

/**
 * The floor as a scheduling problem rather than a set of independent queues.
 *
 * Computed fresh per request. The whole floor is a few dozen small graphs, which
 * is cheap enough that caching would cost more in staleness than it saves in
 * CPU — and a plan that lags reality is worse than no plan.
 */
function floorPayload() {
  const patients = getActivePatients();
  const blockers = blockersByPatientIds(patients.map((p) => p.id));
  const floor = floorPlan(patients, blockers);
  const holds = vitalsHolds(listClaims());
  return {
    ...floor,
    authority: planAuthority(),
    control: controlLoop(patients, blockers, { holds }),
    agent: agentPayload(),
    worklists: floor.worklists.map((list) => ({
      ...list,
      items: list.items.map((item) => ({ ...item, departmentName: deptName(item.department) })),
    })),
  };
}

app.get("/api/floor", (_req, res) => {
  res.json(floorPayload());
});

app.get("/api/agent", (_req, res) => {
  res.json(agentPayload());
});

app.post("/api/agent/tick", (req, res) => {
  const tick = Number.isFinite(Number(req.body?.tick)) ? Number(req.body.tick) : undefined;
  const result = runAgentTick(tick);
  res.json({
    tick: result.tick,
    watching: result.watching,
    silent: result.silent,
    exceptions: result.exceptions,
    created: result.created,
    events: result.events.map((e) => ({
      patientId: e.patientId,
      display: e.display,
      reason: e.emitReason,
      consequential: e.consequential,
    })),
    agent: agentPayload(),
  });
});

app.post("/api/agent/listen", (req, res) => {
  const { patientId, text } = req.body || {};
  if (!patientId || !text) return res.status(400).json({ error: "patientId and text required" });
  const patient = getPatient(patientId);
  if (!patient) return res.status(404).json({ error: "Not found" });
  const created = listenAmbient(text).map((claim) => insertClaim({
    ...claim,
    patientId,
    evidence: { ...claim.evidence, room: patient.room || null },
  })).filter(Boolean);
  if (created.length) broadcast({ type: "EVIDENCE_UPDATED", count: created.length });
  res.json({ claims: created.map(presentClaim) });
});

/**
 * Stage a reversible operational move. This is authority level 2: prepare,
 * do not execute. It writes a visit event so the floor can see that the work
 * was queued. It does not place an order.
 */
app.post("/api/control/stage", (req, res) => {
  const floor = floorPayload();
  const rec = floor.control?.recommended;
  if (!rec) return res.status(409).json({ staged: false, reason: "No move is worth staging." });
  if (!rec.authority?.prepare) {
    return res.status(403).json({ staged: false, authority: rec.authority });
  }
  if (rec.patientId) {
    addEvent(rec.patientId, "staged", rec.title, rec.reason);
  }
  res.json({ staged: true, move: rec });
});

function presentClaim(claim) {
  if (!claim) return null;
  const decision = gate(claim);
  return {
    ...claim,
    authority: decision,
    batch: batchEligible(claim),
    epistemic: presentEpistemic(claim.epistemic_state),
  };
}

app.get("/api/evidence/:id/lineage", (req, res) => {
  const chain = claimLineage(req.params.id).map(presentClaim);
  if (!chain.length) return res.status(404).json({ error: "Not found" });
  res.json({ chain });
});

app.get("/api/evidence", (_req, res) => {
  const presented = listClaims().map(presentClaim);
  const open = presented.filter((c) => c.status === "unverified")
    .sort((a, b) => {
      if (Boolean(a.consequential) !== Boolean(b.consequential)) return a.consequential ? -1 : 1;
      return String(b.created_at || "").localeCompare(String(a.created_at || ""));
    });
  const seen = new Set();
  const inbox = [];
  for (const claim of open) {
    const key = claim.kind === "observation"
      ? `obs:${claim.patient_id}:${claim.proposition?.measure}`
      : claim.id;
    if (seen.has(key)) continue;
    seen.add(key);
    inbox.push(claim);
  }
  const closed = presented.filter((c) => c.status !== "unverified");
  res.json({
    claims: [...inbox, ...closed],
    unverified: inbox.length,
    consequential: inbox.filter((c) => c.consequential).length,
    batchable: inbox.filter((c) => c.batch).length,
  });
});

app.post("/api/evidence/capture", (req, res) => {
  const { patientId, text, speaker } = req.body || {};
  if (!patientId || !text) return res.status(400).json({ error: "patientId and text required" });
  const patient = getPatient(patientId);
  if (!patient) return res.status(404).json({ error: "Not found" });
  const created = captureUtterance(text).map((claim) => insertClaim({
    ...claim,
    patientId,
    evidence: { ...claim.evidence, speaker: speaker || "bedside", room: patient.room || null },
  })).filter(Boolean);
  res.json({ claims: created.map(presentClaim) });
});

app.post("/api/evidence/:id/verify", (req, res) => {
  const claim = verifyClaim(req.params.id, req.body?.by);
  if (!claim) return res.status(404).json({ error: "Not found" });
  addEvent(claim.patient_id, "verified", `Verified ${claim.display}`, claim.evidence?.quote || "");
  recordAudit({ claimId: claim.id, patientId: claim.patient_id, actor: req.body?.by || "staff", action: "verify", detail: claim.display, authority: gate(claim) });
  res.json({ claim: presentClaim(claim) });
});

app.post("/api/evidence/:id/reject", (req, res) => {
  const claim = rejectClaim(req.params.id, req.body?.by, req.body?.note);
  if (!claim) return res.status(404).json({ error: "Not found" });
  addEvent(claim.patient_id, "rejected", `Rejected ${claim.display}`, req.body?.note || "");
  recordAudit({ claimId: claim.id, patientId: claim.patient_id, actor: req.body?.by || "staff", action: "reject", detail: req.body?.note || claim.display, authority: gate(claim) });
  res.json({ claim: presentClaim(claim) });
});

app.post("/api/evidence/:id/correct", (req, res) => {
  const proposition = req.body?.proposition;
  if (!proposition) return res.status(400).json({ error: "proposition required" });
  const result = correctClaim(req.params.id, req.body?.by, proposition, req.body?.display);
  if (!result) return res.status(404).json({ error: "Not found" });
  addEvent(result.original.patient_id, "corrected", `Corrected ${result.original.display}`, result.replacement.display);
  recordAudit({
    claimId: result.replacement.id,
    patientId: result.original.patient_id,
    actor: req.body?.by || "staff",
    action: "correct",
    detail: `${result.original.display} → ${result.replacement.display}`,
    authority: gate(result.replacement),
  });
  res.json({
    original: presentClaim(result.original),
    replacement: presentClaim(result.replacement),
  });
});

/** Batch confirm refuses anything consequential. The server rechecks; the client does not decide. */
app.post("/api/evidence/verify-batch", (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const verified = [];
  const skipped = [];
  for (const id of ids) {
    const claim = getClaim(id);
    if (!claim || !batchEligible(claim)) {
      skipped.push(id);
      continue;
    }
    verified.push(presentClaim(verifyClaim(id, req.body?.by)));
  }
  res.json({ verified, skipped });
});

/** Executing a claim is a different door from reading it, and this door stays shut for clinical acts. */
app.post("/api/evidence/:id/execute", (req, res) => {
  const claim = getClaim(req.params.id);
  if (!claim) return res.status(404).json({ error: "Not found" });
  const decision = mayExecute(claim, req.body?.level ?? 3);
  if (!decision.allowed) {
    recordAudit({
      claimId: claim.id,
      patientId: claim.patient_id,
      actor: req.body?.by || "system",
      action: "execute_refused",
      detail: decision.reason,
      authority: decision,
    });
    return res.status(403).json({ allowed: false, authority: decision, claim: presentClaim(claim) });
  }
  res.json({ allowed: true, authority: decision, claim: presentClaim(claim) });
});

/** One patient's execution plan, priced against live contention on the floor. */
app.get("/api/patients/:id/plan", (req, res) => {
  const patient = getPatient(req.params.id);
  if (!patient) return res.status(404).json({ error: "Not found" });
  res.json(patientPlan(patient, getBlockers(patient.id), { load: floorPayload().load }));
});

/**
 * Handoff view: open escalations grouped by the team that owns the work, so a
 * department can see everything waiting on them in one place instead of hunting
 * through a patient list.
 */
app.get("/api/escalations", (_req, res) => {
  const rows = openEscalations();
  const groups = new Map();

  for (const row of rows) {
    const key = row.owner_role || "Unassigned";
    if (!groups.has(key)) groups.set(key, { owner: key, items: [], highest: 0, unacknowledged: 0 });
    const group = groups.get(key);
    const elapsed = waitMinutes(row.blocker_created_at);
    group.items.push({
      ...row,
      elapsed_minutes: elapsed,
      typical_minutes: typicalMinutesFor(row),
      over_by: Math.max(0, elapsed - typicalMinutesFor(row)),
      rung_label: escalationRung(row.level).label,
      acknowledged: Boolean(row.acknowledged_at),
      department_name: deptName(row.department),
    });
    group.highest = Math.max(group.highest, row.level);
    if (!row.acknowledged_at) group.unacknowledged += 1;
  }

  // Inside a team's own backlog, urgency beats age: the department should see
  // the sickest patient first, then whoever has been waiting longest past due.
  const rank = { high: 0, medium: 1, low: 2 };
  for (const group of groups.values()) {
    group.items.sort(
      (a, b) =>
        (rank[a.urgency] ?? 1) - (rank[b.urgency] ?? 1) ||
        b.level - a.level ||
        b.over_by - a.over_by
    );
  }

  const grouped = [...groups.values()].sort(
    (a, b) => b.highest - a.highest || b.unacknowledged - a.unacknowledged
  );
  res.json({
    total: rows.length,
    unacknowledged: rows.filter((r) => !r.acknowledged_at).length,
    groups: grouped,
  });
});

app.post("/api/escalations/:id/ack", (req, res) => {
  const record = ackEscalation(req.params.id, req.body?.by);
  if (!record) return res.status(404).json({ error: "Not found" });
  addEvent(record.patient_id, "acknowledged", `${record.notified} acknowledged`, record.reason || "");
  notifyFlow();
  res.json({ success: true, escalation: record });
});

/** Manual trigger so the sweep can be exercised without waiting on the timer. */
app.post("/api/escalations/sweep", (_req, res) => {
  res.json({ success: true, raised: sweepEscalations() });
});

app.post("/api/patients/:id/language", (req, res) => {
  const patient = getPatient(req.params.id);
  if (!patient) return res.status(404).json({ error: "Not found" });
  const { language } = req.body;
  if (!language) return res.status(400).json({ error: "language required" });
  db.prepare(`UPDATE patients SET language=?, last_updated_at=datetime('now') WHERE id=?`).run(language, patient.id);
  addEvent(patient.id, "language", `Preferred language set to ${language}`);
  notifyFlow();
  res.json({ success: true, patient: enrich(getPatient(patient.id)) });
});

/**
 * A patient asking for an interpreter is a queue event, not a preference. It
 * becomes a tracked blocker with an owner so it shows up on the staff board and
 * ages like any other dependency, instead of dying in a chat message.
 */
app.post("/api/patients/:id/interpreter", (req, res) => {
  const patient = getPatient(req.params.id);
  if (!patient) return res.status(404).json({ error: "Not found" });
  const language = req.body?.language || patient.language || "unspecified";

  const existing = getBlockers(patient.id).find(
    (b) => b.type === "interpreter" && b.status !== "resolved"
  );
  if (existing) {
    // Already queued at check-in. Escalate instead of stacking a duplicate:
    // the patient asking directly is the signal that the wait is being felt.
    db.prepare(
      `UPDATE blockers SET status='escalated', escalated_at=datetime('now'), updated_at=datetime('now') WHERE id=?`
    ).run(existing.id);
    addEvent(patient.id, "escalated", "Patient asked for an interpreter", `Language: ${language}`);
    notifyFlow();
    return res.json({ success: true, blocker: existing, escalated: true });
  }

  const meta = BLOCKER_TYPES.interpreter;
  const blocker = createBlocker(patient.id, {
    type: "interpreter",
    title: `Interpreter — ${language}`,
    detail: "Requested by the patient from their visit page.",
    owner_role: meta.owner,
    eta_minutes: meta.typicalMins,
    can_parallel: 1,
  });
  addEvent(patient.id, "requested", "Patient requested an interpreter", `Language: ${language}`);
  touch(patient.id);
  notifyFlow();
  res.json({ success: true, blocker, escalated: false });
});

app.post("/api/route", async (req, res) => {
  const { situation } = req.body;
  const result = await converse([{ role: "user", content: situation || "" }]);
  if (result.mode === "question") {
    return res.json({
      department: "triage",
      reason: result.question,
      urgency: "low",
      detectedLanguage: result.detectedLanguage,
      ui: DEFAULT_UI,
    });
  }
  res.json({ ...result, ui: { ...DEFAULT_UI, ...(result.ui || {}) } });
});

app.post("/api/converse", async (req, res) => {
  const { messages } = req.body;
  try {
    const result = await converse(messages || []);
    res.json({ ...result, ui: { ...DEFAULT_UI, ...(result.ui || {}) } });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      mode: "question",
      question: "I'm having trouble connecting. Can you describe your situation again in a short sentence?",
      detectedLanguage: "English",
    });
  }
});

app.get("/api/handoff-summary", async (_req, res) => {
  const flow = flowPayload();
  const summary = await handoffSummary(flow.patients);
  res.json({ summary, kpis: flow.kpis, bottlenecks: flow.bottlenecks.slice(0, 3) });
});

app.post("/api/ai/explain/:id", async (req, res) => {
  const patient = getPatient(req.params.id);
  if (!patient) return res.status(404).json({ error: "Not found" });
  const text = await explainStatus(patient, getBlockers(patient.id), deptName(patient.department));
  res.json(text);
});

app.post("/api/ai/brief/:id", async (req, res) => {
  const patient = getPatient(req.params.id);
  if (!patient) return res.status(404).json({ error: "Not found" });
  const brief = await staffBrief(patient, getBlockers(patient.id));
  res.json(brief);
});

app.post("/api/ai/discharge-draft/:id", async (req, res) => {
  const patient = getPatient(req.params.id);
  if (!patient) return res.status(404).json({ error: "Not found" });
  const draft = await draftDischarge(patient, req.body?.notes || "");
  res.json(draft);
});

app.post("/api/ai/followup", async (req, res) => {
  const { situation, instructions, language } = req.body;
  const text = await followUpReminder(situation, instructions, language);
  res.json({ text });
});

app.post("/api/ai/concierge/:id", async (req, res) => {
  const patient = getPatient(req.params.id);
  if (!patient) return res.status(404).json({ error: "Not found" });
  const answer = await conciergeAnswer(
    patient,
    getBlockers(patient.id),
    req.body?.question || "What is happening now?",
    deptName(patient.department)
  );
  addEvent(patient.id, "concierge", "Asked ClearPath", req.body?.question || "");
  res.json(answer);
});

app.get("/api/analytics", (_req, res) => {
  const totalToday = db.prepare(`SELECT COUNT(*) as count FROM patients WHERE date(checked_in_at) = date('now')`).get().count;
  const discharged = db.prepare(`SELECT COUNT(*) as count FROM patients WHERE status = 'discharged' AND date(checked_in_at) = date('now')`).get().count;
  const avgWaitByDept = db.prepare(`
    SELECT department,
      ROUND(AVG((julianday(COALESCE(called_at, last_updated_at)) - julianday(checked_in_at)) * 24 * 60), 1) as avg_wait_minutes,
      COUNT(*) as total
    FROM patients
    WHERE date(checked_in_at) = date('now')
    GROUP BY department
  `).all();
  const urgencyBreakdown = db.prepare(`
    SELECT urgency, COUNT(*) as count FROM patients
    WHERE date(checked_in_at) = date('now') GROUP BY urgency
  `).all();
  const byHour = db.prepare(`
    SELECT strftime('%H', checked_in_at) as hour, COUNT(*) as count
    FROM patients WHERE date(checked_in_at) = date('now') GROUP BY hour ORDER BY hour ASC
  `).all();
  const languages = db.prepare(`
    SELECT language, COUNT(*) as count FROM patients
    WHERE date(checked_in_at) = date('now') GROUP BY language ORDER BY count DESC
  `).all();
  const currentlyWaiting = db.prepare(`SELECT COUNT(*) as count FROM patients WHERE status = 'waiting'`).get().count;
  const statusBreakdown = db.prepare(`
    SELECT status, COUNT(*) as count FROM patients WHERE status != 'discharged' GROUP BY status
  `).all();
  const blockerBreakdown = db.prepare(`
    SELECT type, status, COUNT(*) as count FROM blockers GROUP BY type, status
  `).all();
  const flow = flowPayload();

  res.json({
    totalToday,
    discharged,
    currentlyWaiting,
    avgWaitByDept,
    urgencyBreakdown,
    byHour,
    languages,
    statusBreakdown,
    blockerBreakdown,
    kpis: flow.kpis,
    bottlenecks: flow.bottlenecks,
    predictions: flow.predictions,
    queues: flow.queues,
  });
});

// Overridable so a test can boot the real app on an ephemeral port against a
// throwaway database, rather than asserting against whatever is on 3001.
// `?? ` rather than `||` so PORT=0, which means "any free port", survives.
const PORT = process.env.PORT != null && process.env.PORT !== ""
  ? Number(process.env.PORT)
  : 3001;
server.listen(PORT, () => console.log(`ClearPath backend running on http://localhost:${PORT}`));

export { app, server };
