import Database from "better-sqlite3";
import { v4 as uuid } from "uuid";
import { initialEpistemic } from "./src/lib/evidence.js";

// Overridable so tests can run the real schema against a throwaway file
// instead of the development database.
export const db = new Database(process.env.CLEARPATH_DB || "clearpath.db");
db.pragma("journal_mode = WAL");

function ensureColumn(table, column, def) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
  }
}

export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY,
      name TEXT,
      situation TEXT,
      summary TEXT,
      department TEXT,
      room TEXT,
      floor TEXT,
      urgency TEXT,
      reason TEXT,
      status TEXT DEFAULT 'waiting',
      phone TEXT,
      language TEXT DEFAULT 'en',
      sentiment TEXT DEFAULT 'calm',
      sentimentNote TEXT,
      queue_position INTEGER,
      checked_in_at TEXT DEFAULT (datetime('now')),
      called_at TEXT,
      discharged_at TEXT,
      last_updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS blockers (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT,
      detail TEXT,
      owner_role TEXT,
      owner_name TEXT,
      status TEXT DEFAULT 'pending',
      can_parallel INTEGER DEFAULT 1,
      blocks_downstream TEXT,
      eta_minutes INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      resolved_at TEXT,
      escalated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      patient_id TEXT,
      kind TEXT,
      title TEXT,
      detail TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    /*
      One row per rung of the ladder a blocker climbs, rather than a single
      mutable level, so "who was told, when, and did they answer" survives as an
      audit trail. That history is the point: an unanswered page is itself the
      signal that a department is underwater.
    */
    CREATE TABLE IF NOT EXISTS escalations (
      id TEXT PRIMARY KEY,
      blocker_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      level INTEGER NOT NULL,
      owner_role TEXT,
      notified TEXT,
      reason TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      acknowledged_at TEXT,
      acknowledged_by TEXT,
      resolved_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_blockers_patient ON blockers(patient_id);
    CREATE INDEX IF NOT EXISTS idx_events_patient ON events(patient_id);
    CREATE INDEX IF NOT EXISTS idx_patients_status ON patients(status);
    CREATE INDEX IF NOT EXISTS idx_escalations_blocker ON escalations(blocker_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_escalations_rung ON escalations(blocker_id, level);

    /*
      A claim is an interpretation with its evidence still attached. Corrections
      insert a new row that points at the one they replace. The original is
      never overwritten, because "what the system thought" is part of the record.
    */
    CREATE TABLE IF NOT EXISTS claims (
      id TEXT PRIMARY KEY,
      patient_id TEXT,
      fingerprint TEXT,
      kind TEXT NOT NULL,
      layer TEXT NOT NULL,
      display TEXT,
      proposition TEXT NOT NULL,
      evidence TEXT NOT NULL,
      confidence REAL,
      status TEXT DEFAULT 'unverified',
      consequential INTEGER DEFAULT 0,
      clinical INTEGER DEFAULT 0,
      reversible INTEGER DEFAULT 0,
      supersedes TEXT,
      note TEXT,
      verified_by TEXT,
      verified_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_claims_fingerprint ON claims(fingerprint) WHERE fingerprint IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_claims_patient ON claims(patient_id);
    CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status);

    CREATE TABLE IF NOT EXISTS audit (
      id TEXT PRIMARY KEY,
      claim_id TEXT,
      patient_id TEXT,
      actor TEXT,
      action TEXT NOT NULL,
      detail TEXT,
      authority TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  ensureColumn("claims", "epistemic_state", "TEXT DEFAULT 'AI_EXTRACTED'");
  ensureColumn("claims", "source_type", "TEXT");

  ensureColumn("patients", "stage", "TEXT");
  ensureColumn("patients", "share_token", "TEXT");
  ensureColumn("patients", "assigned_to", "TEXT");
  ensureColumn("patients", "ai_context", "TEXT");
  ensureColumn("patients", "notes", "TEXT");
  ensureColumn("patients", "visit_kind", "TEXT");

  db.exec(`
    CREATE TABLE IF NOT EXISTS vitals_latest (
      patient_id TEXT NOT NULL,
      measure TEXT NOT NULL,
      value REAL,
      display TEXT,
      sampled_at TEXT DEFAULT (datetime('now')),
      consequential INTEGER DEFAULT 0,
      PRIMARY KEY (patient_id, measure)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

export function getMeta(key) {
  const row = db.prepare(`SELECT value FROM meta WHERE key=?`).get(key);
  return row?.value ?? null;
}

export function setMeta(key, value) {
  db.prepare(`
    INSERT INTO meta (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value
  `).run(key, String(value));
}

export function addEvent(patientId, kind, title, detail = "") {
  db.prepare(
    `INSERT INTO events (id, patient_id, kind, title, detail) VALUES (?, ?, ?, ?, ?)`
  ).run(uuid(), patientId, kind, title, detail || "");
}

export function getBlockers(patientId, { includeResolved = true } = {}) {
  if (includeResolved) {
    return db.prepare(
      `SELECT * FROM blockers WHERE patient_id=? ORDER BY created_at ASC`
    ).all(patientId);
  }
  return db.prepare(
    `SELECT * FROM blockers WHERE patient_id=? AND status != 'resolved' ORDER BY created_at ASC`
  ).all(patientId);
}

export function getEvents(patientId) {
  return db.prepare(
    `SELECT * FROM events WHERE patient_id=? ORDER BY created_at ASC`
  ).all(patientId);
}

export function blockersByPatientIds(ids) {
  if (!ids.length) return {};
  const placeholders = ids.map(() => "?").join(",");
  const rows = db.prepare(
    `SELECT * FROM blockers WHERE patient_id IN (${placeholders}) ORDER BY created_at ASC`
  ).all(...ids);
  const map = {};
  ids.forEach((id) => { map[id] = []; });
  rows.forEach((row) => {
    if (!map[row.patient_id]) map[row.patient_id] = [];
    map[row.patient_id].push(row);
  });
  return map;
}

export function createBlocker(patientId, spec) {
  const id = uuid();
  db.prepare(`
    INSERT INTO blockers (
      id, patient_id, type, title, detail, owner_role, owner_name,
      status, can_parallel, blocks_downstream, eta_minutes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    patientId,
    spec.type,
    spec.title,
    spec.detail || "",
    spec.owner_role || "",
    spec.owner_name || "",
    spec.status || "pending",
    spec.can_parallel === 0 ? 0 : 1,
    spec.blocks_downstream ? JSON.stringify(spec.blocks_downstream) : null,
    spec.eta_minutes || null
  );
  addEvent(patientId, "blocker", spec.title, spec.detail || "");
  return db.prepare(`SELECT * FROM blockers WHERE id=?`).get(id);
}

/** Unresolved blockers across every active patient, for the escalation sweep. */
export function openBlockerRows() {
  return db.prepare(`
    SELECT b.*, p.name AS patient_name, p.urgency, p.department, p.status AS patient_status
    FROM blockers b
    JOIN patients p ON p.id = b.patient_id
    WHERE b.status != 'resolved' AND p.status != 'discharged'
    ORDER BY b.created_at ASC
  `).all();
}

export function escalationLevel(blockerId) {
  const row = db.prepare(
    `SELECT MAX(level) AS level FROM escalations WHERE blocker_id=? AND resolved_at IS NULL`
  ).get(blockerId);
  return row?.level || 0;
}

/**
 * Records a rung. The unique index on (blocker_id, level) makes the sweep
 * idempotent, so a restart or an overlapping tick cannot double-page anyone.
 */
export function createEscalation(spec) {
  const id = uuid();
  try {
    db.prepare(`
      INSERT INTO escalations (id, blocker_id, patient_id, level, owner_role, notified, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, spec.blocker_id, spec.patient_id, spec.level, spec.owner_role || "", spec.notified || "", spec.reason || "");
  } catch {
    return null;
  }
  return db.prepare(`SELECT * FROM escalations WHERE id=?`).get(id);
}

/**
 * One row per blocker at its current rung. Lower rungs stay in the table as the
 * audit trail, but the board needs one actionable row per piece of stuck work,
 * not the same lab three times because it climbed three levels.
 */
export function openEscalations() {
  return db.prepare(`
    SELECT e.*, b.type, b.title AS blocker_title, b.detail AS blocker_detail,
           b.created_at AS blocker_created_at, b.eta_minutes, b.status AS blocker_status,
           p.name AS patient_name, p.urgency, p.department, p.language
    FROM escalations e
    JOIN blockers b ON b.id = e.blocker_id
    JOIN patients p ON p.id = e.patient_id
    WHERE e.resolved_at IS NULL
      AND b.status != 'resolved'
      AND p.status != 'discharged'
      AND e.level = (
        SELECT MAX(x.level) FROM escalations x
        WHERE x.blocker_id = e.blocker_id AND x.resolved_at IS NULL
      )
    ORDER BY e.level DESC, b.created_at ASC
  `).all();
}

/**
 * "On it" answers every open rung for that blocker, not just the one clicked.
 * Someone picking up the work answers the whole chain of pages about it.
 */
export function ackEscalation(id, who) {
  const target = db.prepare(`SELECT * FROM escalations WHERE id=?`).get(id);
  if (!target) return null;
  db.prepare(`
    UPDATE escalations SET acknowledged_at=datetime('now'), acknowledged_by=?
    WHERE blocker_id=? AND acknowledged_at IS NULL
  `).run(who || "staff", target.blocker_id);
  return db.prepare(`SELECT * FROM escalations WHERE id=?`).get(id);
}

/** Closing the blocker closes every rung it climbed. */
export function closeEscalationsFor(blockerId) {
  db.prepare(
    `UPDATE escalations SET resolved_at=datetime('now') WHERE blocker_id=? AND resolved_at IS NULL`
  ).run(blockerId);
}

function parseClaim(row) {
  if (!row) return null;
  return {
    ...row,
    proposition: JSON.parse(row.proposition),
    evidence: JSON.parse(row.evidence),
    epistemic_state: row.epistemic_state || "AI_EXTRACTED",
    consequential: Boolean(row.consequential),
    clinical: Boolean(row.clinical),
    reversible: Boolean(row.reversible),
  };
}

export function insertClaim(spec) {
  const id = uuid();
  try {
    db.prepare(`
      INSERT INTO claims (
        id, patient_id, fingerprint, kind, layer, display, proposition, evidence,
        confidence, status, epistemic_state, source_type, consequential, clinical, reversible, supersedes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'unverified', ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      spec.patientId || spec.patient_id || null,
      spec.fingerprint || null,
      spec.kind,
      spec.layer || spec.kind,
      spec.display || "",
      JSON.stringify(spec.proposition || {}),
      JSON.stringify(spec.evidence || {}),
      spec.confidence ?? null,
      spec.epistemic || initialEpistemic(spec.kind),
      spec.evidence?.source === "monitor" ? "DEVICE" : spec.evidence?.source === "spoken" ? "AUDIO" : "SYSTEM_EVENT",
      spec.consequential ? 1 : 0,
      spec.clinical ? 1 : 0,
      spec.reversible ? 1 : 0,
      spec.supersedes || null
    );
  } catch {
    return null;
  }
  return parseClaim(db.prepare(`SELECT * FROM claims WHERE id=?`).get(id));
}

export function listClaims({ status } = {}) {
  const sql = `
    SELECT c.*, p.name AS patient_name
    FROM claims c
    LEFT JOIN patients p ON p.id = c.patient_id
    ${status ? "WHERE c.status=?" : ""}
    ORDER BY c.consequential DESC, c.created_at ASC
  `;
  const rows = status ? db.prepare(sql).all(status) : db.prepare(sql).all();
  return rows.map(parseClaim);
}

export function getClaim(id) {
  return parseClaim(db.prepare(`SELECT * FROM claims WHERE id=?`).get(id));
}

export function verifyClaim(id, who) {
  const claim = getClaim(id);
  if (!claim || claim.status === "rejected") return null;
  db.prepare(
    `UPDATE claims SET status='verified', epistemic_state='HUMAN_VERIFIED', verified_by=?, verified_at=datetime('now') WHERE id=?`
  ).run(who || "staff", id);
  return getClaim(id);
}

export function rejectClaim(id, who, note) {
  const claim = getClaim(id);
  if (!claim) return null;
  db.prepare(
    `UPDATE claims SET status='rejected', epistemic_state='DISPUTED', verified_by=?, verified_at=datetime('now'), note=? WHERE id=?`
  ).run(who || "staff", note || "", id);
  return getClaim(id);
}

/**
 * A correction is a new claim. The original stays, marked corrected, so the
 * path from interpretation back to evidence still exists.
 */
export function correctClaim(id, who, proposition, display) {
  const claim = getClaim(id);
  if (!claim) return null;
  const replacement = insertClaim({
    ...claim,
    patientId: claim.patient_id,
    fingerprint: null,
    proposition,
    display: display || proposition.display || claim.display,
    supersedes: claim.id,
    evidence: { ...claim.evidence, correctedFrom: claim.id },
    confidence: 1,
  });
  if (!replacement) return null;
  db.prepare(
    `UPDATE claims SET status='corrected', epistemic_state='SUPERSEDED', verified_by=?, verified_at=datetime('now') WHERE id=?`
  ).run(who || "staff", id);
  db.prepare(
    `UPDATE claims SET status='verified', epistemic_state='HUMAN_VERIFIED', verified_by=?, verified_at=datetime('now') WHERE id=?`
  ).run(who || "staff", replacement.id);
  return { original: getClaim(id), replacement: getClaim(replacement.id) };
}

/** Source first, then every transformation, including this claim and what replaced it. */
export function claimLineage(id) {
  const up = db.prepare(`
    WITH RECURSIVE chain AS (
      SELECT * FROM claims WHERE id = ?
      UNION ALL
      SELECT c.* FROM claims c JOIN chain ON c.id = chain.supersedes
    )
    SELECT * FROM chain
  `).all(id);
  const down = db.prepare(`
    WITH RECURSIVE chain AS (
      SELECT * FROM claims WHERE supersedes = ?
      UNION ALL
      SELECT c.* FROM claims c JOIN chain ON c.supersedes = chain.id
    )
    SELECT * FROM chain
  `).all(id);
  return [...up].reverse().concat(down).map(parseClaim);
}

export function recordAudit(spec) {
  const id = uuid();
  db.prepare(`
    INSERT INTO audit (id, claim_id, patient_id, actor, action, detail, authority)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    spec.claimId || null,
    spec.patientId || null,
    spec.actor || "system",
    spec.action,
    spec.detail || "",
    spec.authority ? JSON.stringify(spec.authority) : null
  );
  return db.prepare(`SELECT * FROM audit WHERE id=?`).get(id);
}

export function auditForClaim(claimId) {
  return db.prepare(`SELECT * FROM audit WHERE claim_id=? ORDER BY created_at ASC`).all(claimId);
}

export function upsertVital(row) {
  db.prepare(`
    INSERT INTO vitals_latest (patient_id, measure, value, display, sampled_at, consequential)
    VALUES (?, ?, ?, ?, datetime('now'), ?)
    ON CONFLICT(patient_id, measure) DO UPDATE SET
      value=excluded.value,
      display=excluded.display,
      sampled_at=excluded.sampled_at,
      consequential=excluded.consequential
  `).run(
    row.patientId || row.patient_id,
    row.measure,
    row.value ?? null,
    row.display || "",
    row.consequential ? 1 : 0
  );
}

export function listLatestVitals() {
  return db.prepare(`
    SELECT v.*, p.name AS patient_name, p.room, p.visit_kind, p.department, p.status, p.urgency
    FROM vitals_latest v
    LEFT JOIN patients p ON p.id = v.patient_id
    ORDER BY p.name, v.measure
  `).all();
}

export function vitalsForPatient(patientId) {
  return db.prepare(`SELECT * FROM vitals_latest WHERE patient_id=?`).all(patientId);
}

export function openObservationFor(patientId, measure) {
  const row = db.prepare(`
    SELECT * FROM claims
    WHERE patient_id=? AND kind='observation' AND status='unverified'
      AND json_extract(proposition, '$.measure')=?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(patientId, measure);
  return parseClaim(row);
}

export function retireUnverified(id) {
  db.prepare(`
    UPDATE claims SET status='corrected', epistemic_state='SUPERSEDED'
    WHERE id=? AND status='unverified'
  `).run(id);
}

/** First boot: copy the latest observation claims into the stream so the agent does not re-inbox them. */
export function hydrateVitalsFromClaims() {
  const existing = db.prepare(`SELECT COUNT(*) AS n FROM vitals_latest`).get();
  if (existing?.n) return 0;
  const rows = db.prepare(`
    SELECT patient_id, json_extract(proposition, '$.measure') AS measure,
           json_extract(proposition, '$.value') AS value,
           json_extract(proposition, '$.systolic') AS systolic,
           display, consequential, created_at
    FROM claims
    WHERE kind='observation' AND json_extract(proposition, '$.measure') IS NOT NULL
    ORDER BY created_at ASC
  `).all();
  let n = 0;
  for (const row of rows) {
    if (!row.patient_id || !row.measure) continue;
    upsertVital({
      patientId: row.patient_id,
      measure: row.measure,
      value: row.value ?? row.systolic,
      display: row.display,
      consequential: row.consequential,
    });
    n += 1;
  }
  return n;
}
