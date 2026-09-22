/**
 * A hospital already running as a graph, not a waiting-room snapshot.
 *
 * Each person here is a situation the old operating model mishandles:
 * a visit gated by a clock, a discharge that should have started at arrival,
 * an interpreter requested late, work that needs the patient fused with work
 * that does not. The seed writes patients, blockers, evidence, and intents
 * so every surface — plan, inbox, handoffs, companion — has something true
 * to show.
 */
import { v4 as uuid } from "uuid";
import { writeFileSync, mkdirSync } from "node:fs";
import { db, migrate, addEvent, createBlocker, insertClaim } from "./db.js";
import { BLOCKER_TYPES, inferBlockersFromSituation, STATUS_TO_STAGE } from "./src/lib/journey.js";
import { visitKind } from "./src/lib/plan/compile.js";

migrate();

db.prepare(`DELETE FROM audit`).run();
db.prepare(`DELETE FROM claims`).run();
db.prepare(`DELETE FROM escalations`).run();
db.prepare(`DELETE FROM events`).run();
db.prepare(`DELETE FROM blockers`).run();
db.prepare(`DELETE FROM patients`).run();

const people = [
  {
    name: "James Carter",
    situation: "Severe chest pain radiating to my left arm, started 20 minutes ago",
    summary: "ACS rule-out. Troponin interval is the clock. Expediting a scanner cannot move it.",
    department: "emergency",
    room: "South Pavilion",
    floor: "1",
    urgency: "high",
    reason: "Chest pain with arm radiation — possible cardiac emergency",
    language: "en",
    sentiment: "scared",
    sentimentNote: "Came in alone and is visibly frightened",
    status: "in_progress",
    minutesAgo: 28,
    assigned_to: "Dr. Patel",
    visit_kind: "emergency",
    extraBlockers: [
      { type: "lab", title: "Troponin (first)", detail: "Drawn. Analysis running. The second set is gated by a 3-hour interval, not by the lab.", offset: 22 },
      { type: "imaging", title: "ECG", detail: "Tracing done. Cardiology has not been paged.", offset: 24, can_parallel: 1 },
    ],
    evidence: [
      { kind: "observation", display: "SpO2 89%", proposition: { measure: "spo2", value: 89, display: "89%" }, quote: "Monitor frame: SpO2 89%", source: "monitor", consequential: true, confidence: 0.62 },
      { kind: "observation", display: "118/76 mmHg", proposition: { measure: "bp", systolic: 118, diastolic: 76, display: "118/76 mmHg" }, quote: "Blood pressure 118 over 76", source: "spoken" },
      { kind: "intent", display: "Let's get a CT", proposition: { text: "Get a CT" }, quote: "Let's get a CT.", source: "spoken", reversible: true },
    ],
  },
  {
    name: "David Kim",
    situation: "I was in a car accident, my head hurts and I'm dizzy",
    summary: "Head CT is the rate limiter. Transport is already done. The read, not the scan, will hold discharge.",
    department: "emergency",
    room: "South Pavilion",
    floor: "1",
    urgency: "high",
    reason: "Head trauma from car accident — concussion evaluation",
    language: "en",
    sentiment: "confused",
    sentimentNote: "Appears disoriented; may have concussion",
    status: "pending_test",
    minutesAgo: 40,
    visit_kind: "emergency",
    extraBlockers: [
      { type: "imaging", title: "Head CT", detail: "On the table. Radiology has not started the read.", offset: 12 },
    ],
    evidence: [
      { kind: "observation", display: "Pulse 96 bpm", proposition: { measure: "pulse", value: 96, display: "96 bpm" }, quote: "Pulse 96", source: "spoken" },
    ],
  },
  {
    name: "Priya Nair",
    situation: "I think I'm ready to go home but nobody has brought the paperwork",
    summary: "Clinically ready. Discharge started at the end of the visit instead of at arrival. Ride and pharmacy still unstarted.",
    department: "emergency",
    room: "South Pavilion",
    floor: "1",
    urgency: "low",
    reason: "Disposition ready — discharge stalled on paperwork",
    language: "en",
    sentiment: "anxious",
    sentimentNote: "Child at home. Sitting in a wheelchair by the door.",
    status: "pending_signature",
    minutesAgo: 95,
    visit_kind: "emergency",
    extraBlockers: [
      { type: "signature", title: "Attending discharge sign-off", detail: "Note is written. Signature pending 28 min.", offset: 28 },
      { type: "pharmacy", title: "Prescriptions to-go", detail: "Can fill while the signature waits.", offset: 20, can_parallel: 1 },
    ],
    evidence: [
      { kind: "intent", display: "Discharge after the labs", proposition: { text: "Discharge after labs" }, quote: "We can probably discharge after the labs.", source: "spoken", reversible: true },
    ],
  },
  {
    name: "Rosa Delgado",
    situation: "Mi hija tiene fiebre muy alta y convulsiones",
    summary: "Child with fever and seizures. Interpreter requested at the door, still not at bedside. That delay is fully predictable from language at check-in.",
    department: "pediatric",
    room: "Children's Hospital",
    floor: "1",
    urgency: "high",
    reason: "Child with high fever and seizures",
    language: "es",
    sentiment: "distressed",
    sentimentNote: "Mother is speaking only Spanish",
    status: "waiting",
    minutesAgo: 16,
    visit_kind: "emergency",
    extraBlockers: [
      { type: "interpreter", title: "Spanish interpreter", detail: "Requested at arrival. Still not at bedside.", offset: 15 },
    ],
    evidence: [
      { kind: "observation", display: "Temp 39.4 °C", proposition: { measure: "temp", value: 39.4, display: "39.4 °C" }, quote: "Temperature 39.4", source: "spoken", consequential: true },
    ],
  },
  {
    name: "Fatima Al-Hassan",
    situation: "أنا حامل في الشهر الثامن وأشعر بآلام في البطن",
    summary: "Third trimester pain. Bed is the constraint, not the evaluation. Arabic, traveling without a partner.",
    department: "pediatric",
    room: "Children's Hospital",
    floor: "4",
    urgency: "medium",
    reason: "Third-trimester abdominal pain",
    language: "ar",
    sentiment: "scared",
    sentimentNote: "Traveling without partner",
    status: "in_progress",
    minutesAgo: 22,
    visit_kind: "obstetric",
    extraBlockers: [
      { type: "bed", title: "Labor & delivery bed", detail: "Evaluation can continue in a monitored obstetric bed, which is not assigned.", offset: 18 },
      { type: "interpreter", title: "Arabic interpreter", detail: "ClearPath can show updates in Arabic. Clinical conversation still needs a person.", offset: 20, can_parallel: 1 },
    ],
  },
  {
    name: "Maria Santos",
    situation: "Dog bite on my hand, the dog was a stray and I don't know if it was vaccinated",
    summary: "Rabies prophylaxis. Pharmacy is preparing a weight-based dose that was knowable from the triage note.",
    department: "rabies",
    room: "Room A3",
    floor: "1",
    urgency: "medium",
    reason: "Stray dog bite — rabies vaccine assessment",
    language: "en",
    sentiment: "anxious",
    sentimentNote: "Worried about rabies",
    status: "waiting",
    minutesAgo: 14,
    visit_kind: "emergency",
    extraBlockers: [
      { type: "pharmacy", title: "Rabies immunoglobulin", detail: "Weight-based dose. Pharmacy started late because nobody pre-alerted them.", offset: 8 },
    ],
  },
  {
    name: "Michael Torres",
    situation: "bat flew into my house last night and scratched my arm while I was trying to get it out",
    summary: "Same clinic, same pharmacy, same dose type as Maria Santos. Two visits, one prep if anyone notices.",
    department: "rabies",
    room: "Room A3",
    floor: "1",
    urgency: "medium",
    reason: "Bat scratch — rabies post-exposure evaluation",
    language: "en",
    sentiment: "anxious",
    sentimentNote: "Read about rabies online",
    status: "waiting",
    minutesAgo: 8,
    visit_kind: "emergency",
  },
  {
    name: "Amara Okafor",
    situation: "I have been having severe abdominal pain for two days, no appetite",
    summary: "CT abdomen is still reading. Surgical consult is 30% likely. Disposition waits on the read, not the consult.",
    department: "dana",
    room: "Dana Building",
    floor: "1",
    urgency: "medium",
    reason: "Severe abdominal pain for 2 days",
    language: "en",
    sentiment: "in-pain",
    sentimentNote: "Holding stomach",
    status: "pending_test",
    minutesAgo: 55,
    visit_kind: "emergency",
    extraBlockers: [
      { type: "imaging", title: "CT abdomen", detail: "Acquisition done. Read outstanding.", offset: 18 },
      { type: "lab", title: "Blood panel", detail: "Drawn. Analysis running in parallel with the read.", offset: 40, can_parallel: 1 },
    ],
    evidence: [
      { kind: "intent", display: "I'll call surgery", proposition: { text: "Call surgery" }, quote: "I'll call surgery if the CT looks surgical.", source: "spoken", reversible: true },
    ],
  },
  {
    name: "Thomas Greene",
    situation: "I fell off a ladder and my wrist is swollen and painful, can't move it. I use a walker at home.",
    summary: "Likely fracture. X-ray in progress. PT eval is the silent discharge blocker — three hours of lead time, usually requested at hour six.",
    department: "ypb",
    room: "Yale Physicians",
    floor: "1",
    urgency: "medium",
    reason: "Wrist injury from fall — possible fracture",
    language: "en",
    sentiment: "calm",
    sentimentNote: "Family present. Uses a walker at home.",
    status: "pending_test",
    minutesAgo: 32,
    visit_kind: "emergency",
    extraBlockers: [
      { type: "imaging", title: "Wrist X-ray", detail: "Film taken. Ortho follow-up not booked.", offset: 14 },
    ],
  },
  {
    name: "Wei Zhang",
    situation: "我需要做MRI检查，医生已经开了单子",
    summary: "MRI referral. Calm. Language is Mandarin. Interpreter not yet requested because nobody looked at the language field.",
    department: "clinicbldg",
    room: "Clinic Building",
    floor: "1",
    urgency: "low",
    reason: "MRI referral from primary care",
    language: "zh",
    sentiment: "calm",
    sentimentNote: "Paperwork ready",
    status: "waiting",
    minutesAgo: 7,
    visit_kind: "imaging",
  },
  {
    name: "Carlos Mendez",
    situation: "Necesito ver a un psiquiatra, he tenido pensamientos muy difíciles",
    summary: "Psychiatric evaluation. Placement is the real bottleneck, and it has not started. Should not wait in a public queue.",
    department: "winchester",
    room: "Winchester Building",
    floor: "1",
    urgency: "medium",
    reason: "Psychiatric evaluation — difficult thoughts",
    language: "es",
    sentiment: "anxious",
    sentimentNote: "Withdrawn. Needs a quiet handoff.",
    status: "waiting",
    minutesAgo: 19,
    visit_kind: "behavioral",
    extraBlockers: [
      { type: "consult", title: "Psychiatry evaluation", detail: "Specialist not yet assigned.", offset: 12 },
      { type: "interpreter", title: "Spanish interpreter", detail: "Clinical conversation cannot start without one.", offset: 18, can_parallel: 1 },
    ],
  },
  {
    name: "Anna Kowalski",
    situation: "I have been feeling very sad and isolated for months, my family made me come",
    summary: "In evaluation. Safety plan and placement can start before disposition is decided. They have not.",
    department: "winchester",
    room: "Winchester Building",
    floor: "1",
    urgency: "medium",
    reason: "Depression evaluation",
    language: "en",
    sentiment: "distressed",
    sentimentNote: "Family is in the waiting area",
    status: "in_progress",
    minutesAgo: 48,
    visit_kind: "behavioral",
    extraBlockers: [
      { type: "consult", title: "Psychiatry evaluation", detail: "With the psychiatrist now.", offset: 20 },
    ],
  },
  {
    name: "Samuel Osei",
    situation: "Je dois faire une mammographie de routine",
    summary: "Routine imaging. Waiting on transport between pavilions — a 15-minute job treated as a department.",
    department: "north",
    room: "North Pavilion",
    floor: "1",
    urgency: "low",
    reason: "Routine mammography screening",
    language: "fr",
    sentiment: "calm",
    sentimentNote: "Language recorded as French; Haitian Creole is the closer supported match.",
    status: "pending_transport",
    minutesAgo: 22,
    visit_kind: "imaging",
    extraBlockers: [
      { type: "transport", title: "Transport to North Pavilion", detail: "Destination is ready. The patient is not moving.", offset: 18 },
    ],
  },
  {
    name: "Helen Park",
    situation: "I've had blurry vision for a week and my optometrist said to come here",
    summary: "Called. Room is ready. Nothing is actually pending except the walk.",
    department: "dana",
    room: "Dana Building",
    floor: "2",
    urgency: "low",
    reason: "Vision changes — ophthalmology referral",
    language: "en",
    sentiment: "calm",
    sentimentNote: "Brought a referral letter",
    status: "called",
    minutesAgo: 12,
    visit_kind: "clinic",
  },
  {
    name: "Linda Hoffman",
    situation: "I need a pulmonary function test, my doctor referred me. I get short of breath climbing stairs.",
    summary: "Routine PFT. Short wait. ECG can run at the chair if anyone sends the machine.",
    department: "fitkin",
    room: "Fitkin Building",
    floor: "2",
    urgency: "low",
    reason: "Routine pulmonary function test",
    language: "en",
    sentiment: "calm",
    sentimentNote: "Relaxed, routine appointment",
    status: "waiting",
    minutesAgo: 9,
    visit_kind: "clinic",
  },
  {
    name: "Ibrahim Hassan",
    situation: "I need to get my pre-admission testing done before my surgery next week",
    summary: "Pre-op. Labs can be drawn while registration finishes. They are waiting in sequence instead.",
    department: "triage",
    room: "East Pavilion",
    floor: "1",
    urgency: "low",
    reason: "Pre-admission testing for scheduled surgery",
    language: "en",
    sentiment: "calm",
    sentimentNote: "Has paperwork. Surgery is in six days.",
    status: "waiting",
    minutesAgo: 34,
    visit_kind: "preop",
    extraBlockers: [
      { type: "documentation", title: "Pre-operative paperwork", detail: "Consent packet incomplete.", offset: 30, can_parallel: 1 },
      { type: "lab", title: "Pre-op labs", detail: "Can be drawn while registration finishes. Has not been.", offset: 20, can_parallel: 1 },
    ],
  },
];

const insert = db.prepare(`
  INSERT INTO patients (
    id, name, situation, summary, department, room, floor,
    urgency, reason, phone, language, sentiment, sentimentNote,
    queue_position, status, stage, share_token, assigned_to, visit_kind,
    checked_in_at, last_updated_at
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?,
    datetime('now', ? || ' minutes'), datetime('now', ? || ' minutes')
  )
`);

const counts = {};
let evidenceCount = 0;
const demo = [];

for (const p of people) {
  const id = uuid();
  const token = uuid().slice(0, 8);
  const kind = p.visit_kind || visitKind(p);
  counts[p.department] = (counts[p.department] || 0) + 1;
  const offset = `-${p.minutesAgo}`;
  const stage = STATUS_TO_STAGE[p.status] || "waiting";

  insert.run(
    id, p.name, p.situation, p.summary,
    p.department, p.room, p.floor,
    p.urgency, p.reason,
    "", p.language, p.sentiment, p.sentimentNote,
    counts[p.department], p.status, stage, token, p.assigned_to || null, kind,
    offset, offset
  );

  addEvent(id, "checkin", "Checked in", p.reason);
  if (p.status !== "waiting") addEvent(id, "status", `Now ${p.status.replaceAll("_", " ")}`);

  const specs = p.extraBlockers || inferBlockersFromSituation({ ...p, id });
  for (const spec of specs) {
    const meta = BLOCKER_TYPES[spec.type] || {};
    const blocker = createBlocker(id, {
      type: spec.type,
      title: spec.title,
      detail: spec.detail,
      owner_role: spec.owner_role || meta.owner,
      eta_minutes: spec.eta_minutes || meta.typicalMins,
      can_parallel: spec.can_parallel === 0 ? 0 : 1,
    });
    if (spec.offset) {
      db.prepare(`UPDATE blockers SET created_at=datetime('now', ? || ' minutes') WHERE id=?`)
        .run(`-${spec.offset}`, blocker.id);
    }
  }

  for (const claim of p.evidence || []) {
    insertClaim({
      patientId: id,
      fingerprint: `${id}:${claim.display}`,
      kind: claim.kind,
      layer: claim.kind === "intent" ? "interpretation" : "observation",
      display: claim.display,
      proposition: claim.proposition,
      evidence: { source: claim.source, quote: claim.quote, speaker: "bedside", room: p.room, synthetic: true },
      confidence: claim.confidence ?? 0.7,
      consequential: Boolean(claim.consequential),
      reversible: Boolean(claim.reversible),
    });
    evidenceCount += 1;
  }

  demo.push({
    name: p.name,
    visitKind: kind,
    status: p.status,
    language: p.language,
    follow: `/follow/${token}`,
    situation: p.situation,
    demonstrates: p.summary,
    capture: (p.evidence || []).map((c) => c.quote).filter(Boolean),
  });
}

const usage = {
  generatedAt: new Date().toISOString(),
  howToLook: {
    staff: "http://localhost:5173/dashboard",
    operate: "Open Operate. The first card is the next reversible move, or an instruction to leave the floor alone.",
    evidence: "Open Evidence. SpO2 89% on James Carter is consequential and unverified. Batch confirm does not include it.",
    companion: "Any follow URL below is a caregiver view of the same plan, without the medical story.",
  },
  sampleRequests: {
    spokenRound: "Pulse 72. SpO2 98%. Blood pressure 118 over 76. Temperature 36.6. Respiratory rate 16.",
    capture: "POST /api/evidence/capture { patientId, text, speaker: 'nurse' }",
    stageMove: "POST /api/control/stage  — stages the recommended reversible move; refused if it is clinical",
    patientPlan: "GET /api/patients/:id/plan",
    floor: "GET /api/floor",
  },
  patients: demo,
};

mkdirSync("examples", { recursive: true });
writeFileSync("examples/demo.json", JSON.stringify(usage, null, 2));

console.log(`Seeded ${people.length} patients, ${evidenceCount} evidence claims`);
for (const [dept, n] of Object.entries(counts)) console.log(`  ${dept}: ${n}`);
console.log("Wrote examples/demo.json");
for (const row of demo.slice(0, 6)) {
  console.log(`  ${row.name} [${row.visitKind}] ${row.follow}`);
}
