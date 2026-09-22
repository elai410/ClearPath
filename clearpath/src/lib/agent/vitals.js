/**
 * A passive vitals agent.
 *
 * Hospitals currently collect vitals as a scheduled task: a person walks to
 * the bed, takes a set, writes it down, and the visit waits on that round.
 * That is backwards. The measurements already exist on a monitor. The expensive
 * part is a human noticing that they changed in a way that matters.
 *
 * This agent watches. It does not interview, it does not page for a stable
 * 98% saturation, and it does not treat a reading as a fact. It keeps a
 * current picture of each watched bed and only speaks when:
 *
 *   - a watched bed has no picture yet and the first reading is consequential
 *   - a value moves enough that a person should see the delta
 *   - a value crosses into or out of the consequential band
 *
 * Silence is the product. Ordinary values stay on the stream. They do not
 * become work, they do not become a note, and they do not block the plan.
 *
 * Authority never rises above observe-and-surface. A low SpO2 here is a claim
 * for a person, not an order, not a diagnosis, and not a reason the system
 * may discharge or refuse discharge on its own.
 */
import { captureUtterance, consequentialVital } from "../evidence.js";

const WATCHED_KINDS = new Set(["emergency", "obstetric", "behavioral"]);
const WATCHED_DEPTS = new Set(["emergency", "pediatric", "rabies", "winchester"]);

const THRESHOLD = {
  spo2: 2,
  pulse: 8,
  sbp: 12,
  dbp: 10,
  temp: 0.3,
  rr: 3,
};

export function shouldWatch(patient = {}) {
  if (!patient || patient.status === "discharged") return false;
  const kind = String(patient.visit_kind || "").toLowerCase();
  if (WATCHED_KINDS.has(kind)) return true;
  if (WATCHED_DEPTS.has(patient.department)) return true;
  if (patient.urgency === "high") return true;
  return false;
}

export function profileFor(patient = {}) {
  const text = `${patient.situation || ""} ${patient.summary || ""} ${patient.reason || ""} ${patient.visit_kind || ""}`;
  if (/chest|cardiac|troponin|acs/i.test(text)) {
    return { spo2: 89, pulse: 92, sbp: 118, dbp: 76, temp: 36.7, rr: 18 };
  }
  if (/fever|seizure|convul/i.test(text)) {
    return { spo2: 97, pulse: 118, sbp: 108, dbp: 68, temp: 39.4, rr: 24 };
  }
  if (/head|concussion|accident|trauma|dizzy/i.test(text)) {
    return { spo2: 98, pulse: 96, sbp: 132, dbp: 82, temp: 36.8, rr: 16 };
  }
  if (/pregnan|trimester/i.test(text)) {
    return { spo2: 98, pulse: 88, sbp: 122, dbp: 74, temp: 36.6, rr: 18 };
  }
  if (/bite|rabies|bat/i.test(text)) {
    return { spo2: 99, pulse: 78, sbp: 124, dbp: 80, temp: 36.9, rr: 16 };
  }
  if (/psych|sad|isolated|pensamientos/i.test(text)) {
    return { spo2: 99, pulse: 74, sbp: 118, dbp: 76, temp: 36.5, rr: 14 };
  }
  return { spo2: 98, pulse: 72, sbp: 118, dbp: 76, temp: 36.6, rr: 16 };
}

function roundMeasure(measure, value) {
  if (measure === "temp") return Math.round(value * 10) / 10;
  return Math.round(value);
}

function displayOf(measure, value, extra = {}) {
  if (measure === "spo2") return `${value}%`;
  if (measure === "pulse") return `${value} bpm`;
  if (measure === "temp") return `${value} °C`;
  if (measure === "rr") return `${value} / min`;
  if (measure === "bp") return `${extra.systolic}/${extra.diastolic} mmHg`;
  if (measure === "sbp" || measure === "dbp") return `${value}`;
  return String(value);
}

function hash(text) {
  let h = 2166136261;
  for (const ch of String(text)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

function reading(measure, value, extra = {}) {
  const v = roundMeasure(measure, value);
  const proposition = measure === "bp"
    ? { measure: "bp", systolic: extra.systolic, diastolic: extra.diastolic, display: displayOf("bp", v, extra) }
    : { measure, value: v, display: displayOf(measure, v) };
  const consequential = measure === "bp"
    ? consequentialVital({ measure: "sbp", value: extra.systolic }) || consequentialVital({ measure: "dbp", value: extra.diastolic })
    : consequentialVital({ measure, value: v });
  return { measure, value: v, consequential, proposition, display: proposition.display };
}

/**
 * One sample from the bedside monitor. Deterministic in (patient, tick) so a
 * test can replay it, and so a demo does not depend on wall-clock luck.
 *
 * Tick 3 on a head-trauma presentation is scripted to a tachycardic pulse.
 * That is the demo of "the agent speaks only when the stream changes".
 */
export function sampleMonitors(patient, { tick = 0, previous = {} } = {}) {
  const profile = profileFor(patient);
  const seed = hash(`${patient.id || patient.name || "bed"}:${tick}`);
  const jitter = (measure, scale) => {
    const shift = ((seed >> (measure.charCodeAt(0) % 12)) & 7) - 3;
    return shift * scale;
  };

  const spo2 = previous.spo2?.value ?? profile.spo2;
  const pulseBase = previous.pulse?.value ?? profile.pulse;
  const traumaTachy = tick === 3 && /head|concussion|accident|trauma|dizzy/i.test(`${patient.situation || ""} ${patient.reason || ""}`);
  const pulse = traumaTachy ? 138 : pulseBase + jitter("pulse", 0);
  const sbp = previous.sbp?.value ?? profile.sbp;
  const dbp = previous.dbp?.value ?? profile.dbp;
  const temp = previous.temp?.value ?? profile.temp;
  const rr = previous.rr?.value ?? profile.rr;

  return [
    reading("spo2", spo2 + jitter("spo2", 0)),
    reading("pulse", pulse),
    reading("bp", sbp, { systolic: roundMeasure("sbp", sbp), diastolic: roundMeasure("dbp", dbp) }),
    reading("temp", temp + jitter("temp", 0)),
    reading("rr", rr + jitter("rr", 0)),
  ];
}

export function shouldEmit(previous, next) {
  if (!next) return { emit: false, reason: "empty" };
  if (!previous) {
    return next.consequential
      ? { emit: true, reason: "baseline-consequential" }
      : { emit: false, reason: "baseline-quiet" };
  }
  const was = Boolean(previous.consequential);
  const now = Boolean(next.consequential);
  if (was !== now) return { emit: true, reason: now ? "crossed" : "recovered" };
  const delta = Math.abs((next.value ?? 0) - (previous.value ?? 0));
  const need = THRESHOLD[next.measure] ?? 1;
  if (delta >= need) return { emit: true, reason: "changed" };
  return { emit: false, reason: "stable" };
}

export function claimFromReading(patient, next, reason) {
  return {
    patientId: patient.id,
    patientName: patient.name,
    fingerprint: `${patient.id}:monitor:${next.measure}:${next.display}`,
    kind: "observation",
    layer: "observation",
    display: next.display,
    proposition: next.proposition,
    consequential: Boolean(next.consequential),
    clinical: false,
    reversible: false,
    confidence: 0.78,
    emitReason: reason,
    evidence: {
      source: "monitor",
      quote: `Monitor frame: ${next.measure === "bp" ? next.display : `${next.measure} ${next.display}`}`,
      speaker: "passive-agent",
      room: patient.room || null,
      synthetic: true,
      agent: true,
    },
  };
}

/**
 * One pass over one patient. `previous` is the last known snapshot keyed by
 * measure, including values that were never inboxed.
 */
export function tickPatient(patient, { tick = 0, previous = {} } = {}) {
  if (!shouldWatch(patient)) {
    return { watching: false, snapshot: [], events: [], quiet: true };
  }
  const snapshot = sampleMonitors(patient, { tick, previous });
  const events = [];
  for (const next of snapshot) {
    const prev = previous[next.measure] || (next.measure === "bp" ? previous.bp : null);
    const decision = shouldEmit(prev, next);
    if (decision.emit) events.push(claimFromReading(patient, next, decision.reason));
  }
  return {
    watching: true,
    snapshot,
    events,
    quiet: events.length === 0,
    exception: snapshot.some((r) => r.consequential),
  };
}

export function tickFloor(patients = [], { tick = 0, previousByPatient = {} } = {}) {
  const beds = [];
  const events = [];
  for (const patient of patients) {
    const previous = previousByPatient[patient.id] || {};
    const result = tickPatient(patient, { tick, previous });
    beds.push({
      patientId: patient.id,
      name: patient.name,
      watching: result.watching,
      quiet: result.quiet,
      exception: Boolean(result.exception),
      snapshot: result.snapshot,
    });
    events.push(...result.events);
  }
  return {
    tick,
    watching: beds.filter((b) => b.watching).length,
    silent: beds.filter((b) => b.watching && b.quiet && !b.exception).length,
    exceptions: beds.filter((b) => b.exception).length,
    beds,
    events,
  };
}

/**
 * Holds: unverified consequential vitals that must stop departure work.
 * This is operational, not clinical — the system refuses to stage going-home
 * work against an unreviewed low saturation. It does not treat the saturation.
 */
export function vitalsHolds(claims = []) {
  const holds = [];
  const seen = new Set();
  for (const claim of claims) {
    if (claim.kind !== "observation") continue;
    if (claim.status && claim.status !== "unverified") continue;
    if (!claim.consequential) continue;
    const patientId = claim.patientId || claim.patient_id;
    if (!patientId || seen.has(patientId)) continue;
    seen.add(patientId);
    holds.push({
      patientId,
      patientName: claim.patientName || claim.patient_name || "This patient",
      display: claim.display,
      measure: claim.proposition?.measure,
      title: `Hold departure for ${claim.patientName || claim.patient_name || "this patient"}`,
      reason: `${claim.display} is captured and not verified. Going-home work waits. This is not a diagnosis and not a treatment.`,
    });
  }
  return holds;
}

/** Overheard speech, not a prompted vitals round. Same capture rules, different source. */
export function listenAmbient(text = "") {
  return captureUtterance(text).map((claim) => ({
    ...claim,
    evidence: { ...claim.evidence, source: claim.evidence?.source || "spoken", speaker: "ambient", agent: true },
  }));
}

export function snapshotMap(rows = []) {
  const byPatient = {};
  for (const row of rows) {
    const id = row.patient_id || row.patientId;
    if (!id) continue;
    byPatient[id] = byPatient[id] || {};
    byPatient[id][row.measure] = {
      measure: row.measure,
      value: row.value,
      display: row.display,
      consequential: Boolean(row.consequential),
    };
  }
  return byPatient;
}
