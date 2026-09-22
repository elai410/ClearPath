const API = "/api";
export const WS_URL = `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.hostname}:3010`;

async function req(path, opts) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json", ...(opts?.headers || {}) },
    ...opts,
  });
  if (!res.ok) {
    const err = new Error(`Request failed: ${path}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export const converse = (messages) => req("/converse", { method: "POST", body: JSON.stringify({ messages }) });
export const checkinPatient = (payload) => req("/checkin", { method: "POST", body: JSON.stringify(payload) });
export const fetchPatient = (id) => req(`/patient/${id}`);
export const fetchJourney = (id) => req(`/journey/${id}`);
export const fetchFollow = (token) => req(`/follow/${token}`);
export const fetchAllPatients = () => req("/patients");
export const fetchFlow = () => req("/flow");
export const fetchAnalytics = () => req("/analytics");
export const callNext = (department) => req(`/call-next/${department}`, { method: "POST" });
export const callPatient = (id) => req(`/call/${id}`, { method: "POST" });
export const dischargePatient = (id, instructions) =>
  req(`/discharge/${id}`, { method: "POST", body: JSON.stringify({ instructions }) });
export const movePatient = (id, department, room, floor, reason) =>
  req(`/move/${id}`, { method: "POST", body: JSON.stringify({ department, room, floor, reason }) });
export const updateStatus = (id, status) =>
  req(`/update-status/${id}`, { method: "POST", body: JSON.stringify({ status }) });
export const advancePatient = (id) => req(`/advance/${id}`, { method: "POST" });
export const prepareDischarge = (id) => req(`/prepare-discharge/${id}`, { method: "POST" });
export const resolveBlocker = (id) => req(`/blockers/${id}/resolve`, { method: "POST" });
export const escalateBlocker = (id) => req(`/blockers/${id}/escalate`, { method: "POST" });
export const addBlocker = (payload) => req("/blockers", { method: "POST", body: JSON.stringify(payload) });
export const fetchHandoff = () => req("/handoff-summary");
export const fetchFloorPlan = () => req("/floor");
export const stageControlMove = () => req("/control/stage", { method: "POST" });
export const fetchPatientPlan = (id) => req(`/patients/${id}/plan`);
export const fetchEscalations = () => req("/escalations");
export const fetchEvidence = () => req("/evidence");
export const fetchAgent = () => req("/agent");
export const tickAgent = (tick) => req("/agent/tick", { method: "POST", body: JSON.stringify({ tick }) });
export const listenAmbient = (patientId, text) =>
  req("/agent/listen", { method: "POST", body: JSON.stringify({ patientId, text }) });
export const fetchLineage = (id) => req(`/evidence/${id}/lineage`);
export const fetchPatients = () => req("/patients");
export const captureEvidence = (patientId, text, speaker) =>
  req("/evidence/capture", { method: "POST", body: JSON.stringify({ patientId, text, speaker }) });
export const verifyEvidence = (id, by) =>
  req(`/evidence/${id}/verify`, { method: "POST", body: JSON.stringify({ by }) });
export const rejectEvidence = (id, by, note) =>
  req(`/evidence/${id}/reject`, { method: "POST", body: JSON.stringify({ by, note }) });
export const correctEvidence = (id, proposition, display, by) =>
  req(`/evidence/${id}/correct`, { method: "POST", body: JSON.stringify({ proposition, display, by }) });
export const verifyEvidenceBatch = (ids, by) =>
  req("/evidence/verify-batch", { method: "POST", body: JSON.stringify({ ids, by }) });
export const ackEscalation = (id, by) =>
  req(`/escalations/${id}/ack`, { method: "POST", body: JSON.stringify({ by }) });
export const sweepEscalations = () => req("/escalations/sweep", { method: "POST" });
export const setLanguage = (id, language) =>
  req(`/patients/${id}/language`, { method: "POST", body: JSON.stringify({ language }) });
export const requestInterpreter = (id, language) =>
  req(`/patients/${id}/interpreter`, { method: "POST", body: JSON.stringify({ language }) });
export const aiExplain = (id) => req(`/ai/explain/${id}`, { method: "POST" });
export const aiBrief = (id) => req(`/ai/brief/${id}`, { method: "POST" });
export const aiDischargeDraft = (id, notes) =>
  req(`/ai/discharge-draft/${id}`, { method: "POST", body: JSON.stringify({ notes }) });
export const aiFollowup = (situation, instructions, language) =>
  req("/ai/followup", { method: "POST", body: JSON.stringify({ situation, instructions, language }) });
export const aiConcierge = (id, question) =>
  req(`/ai/concierge/${id}`, { method: "POST", body: JSON.stringify({ question }) });

export const STATUS_LABELS = {
  waiting: "Waiting",
  in_progress: "With care team",
  pending_test: "Testing",
  pending_signature: "Awaiting sign-off",
  pending_transport: "Transport",
  pending_bed: "Waiting for a room",
  called: "Called",
  discharged: "Discharged",
};

export { DEPT_ROOM } from "../constants.js";
