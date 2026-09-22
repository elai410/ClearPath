/** Shared patient-flow intelligence used by the API and the UI. */
import { translator, normalizeLanguage, detectLanguage } from "./i18n/index.js";
import { conceptsIn } from "./triage-terms.js";

export const STAGES = [
  { id: "arrival",        label: "Arrival",         patient: "You've arrived",              staff: "Arrived" },
  { id: "intake",         label: "Intake",          patient: "Telling us what's going on", staff: "Intake" },
  { id: "registration",   label: "Registration",    patient: "Confirming your visit",      staff: "Registration" },
  { id: "wayfinding",     label: "On the way",      patient: "Heading to your destination", staff: "Wayfinding" },
  { id: "waiting",        label: "Waiting",         patient: "Waiting to be seen",         staff: "Waiting" },
  { id: "evaluation",     label: "Evaluation",      patient: "With your care team",        staff: "Evaluation" },
  { id: "testing",        label: "Testing",         patient: "Tests in progress",          staff: "Testing" },
  { id: "results",        label: "Results",         patient: "Waiting for results",        staff: "Results" },
  { id: "treatment",      label: "Treatment",       patient: "Receiving care",             staff: "Treatment" },
  { id: "observation",    label: "Observation",     patient: "Being monitored",            staff: "Observation" },
  { id: "discharge_prep", label: "Going-home prep", patient: "Getting ready to go home",   staff: "Discharge prep" },
  { id: "discharge",      label: "Discharge",       patient: "You're going home",          staff: "Discharged" },
  { id: "followup",       label: "Follow-up",       patient: "After your visit",           staff: "Follow-up" },
];

export const STAGE_ORDER = STAGES.map((s) => s.id);

export const STATUS_TO_STAGE = {
  waiting: "waiting",
  called: "evaluation",
  in_progress: "evaluation",
  pending_test: "testing",
  pending_signature: "discharge_prep",
  pending_transport: "wayfinding",
  pending_bed: "waiting",
  discharged: "discharge",
};

export const STAGE_TO_STATUS = {
  waiting: "waiting",
  evaluation: "in_progress",
  testing: "pending_test",
  results: "pending_test",
  treatment: "in_progress",
  observation: "in_progress",
  discharge_prep: "pending_signature",
  wayfinding: "pending_transport",
  discharge: "discharged",
};

export const BLOCKER_TYPES = {
  lab:            { label: "Lab results",          owner: "Laboratory",              typicalMins: 45, department: "lab" },
  imaging:        { label: "Imaging",              owner: "Radiology",               typicalMins: 50, department: "radiology" },
  consult:        { label: "Specialist consult",   owner: "Consulting physician",    typicalMins: 40, department: "consults" },
  transport:      { label: "Transport",            owner: "Patient transport",       typicalMins: 15, department: "transport" },
  bed:            { label: "Bed / room",           owner: "Bed management",          typicalMins: 40, department: "beds" },
  signature:      { label: "Provider sign-off",    owner: "Attending physician",     typicalMins: 20, department: "physicians" },
  documentation:  { label: "Documentation",        owner: "Nursing / HIM",           typicalMins: 15, department: "nursing" },
  pharmacy:       { label: "Medications",          owner: "Pharmacy",                typicalMins: 25, department: "pharmacy" },
  room_turnover:  { label: "Room turnover",        owner: "Environmental services",  typicalMins: 30, department: "evs" },
  registration:   { label: "Missing information",  owner: "Admitting",               typicalMins: 10, department: "admitting" },
  interpreter:    { label: "Interpreter",          owner: "Language services",       typicalMins: 12, department: "language" },
};

export const STUCK_THRESHOLDS = {
  waiting: 25,
  in_progress: 55,
  pending_test: 40,
  pending_signature: 18,
  pending_transport: 12,
  pending_bed: 35,
  called: 12,
};

export const URGENCY_RANK = { high: 0, medium: 1, low: 2 };

/**
 * Who gets told, and when, once a dependency runs past its typical window.
 *
 * `at` is a multiple of the blocker's own typical duration rather than a fixed
 * number of minutes, because "late" means something different for transport
 * (15 min) than for imaging (50 min). Each rung widens the circle instead of
 * re-pinging the team that has already missed its window.
 */
export const ESCALATION_LADDER = [
  { level: 1, at: 1.0, audience: (b) => b.owner_role || "the owning team", label: "Owner notified" },
  { level: 2, at: 2.0, audience: () => "Charge nurse", label: "Charge nurse" },
  { level: 3, at: 3.0, audience: () => "Patient flow lead", label: "Flow lead" },
];

/** High-urgency patients climb the ladder faster; low-urgency ones slower. */
const URGENCY_PACE = { high: 0.6, medium: 1, low: 1.4 };

export function typicalMinutesFor(blocker) {
  return blocker.eta_minutes || BLOCKER_TYPES[blocker.type]?.typicalMins || 30;
}

/**
 * The highest rung this blocker has earned, or 0 for "still within its window".
 * Pure so the sweep can be tested without a clock or a database.
 */
export function dueEscalationLevel(blocker, elapsedMinutes = waitMinutes(blocker.created_at)) {
  if (!blocker || blocker.status === "resolved") return 0;
  const pace = URGENCY_PACE[blocker.urgency] ?? 1;
  const window = typicalMinutesFor(blocker) * pace;
  let due = 0;
  for (const rung of ESCALATION_LADDER) {
    if (elapsedMinutes >= window * rung.at) due = rung.level;
  }
  return due;
}

export function escalationRung(level) {
  return ESCALATION_LADDER.find((r) => r.level === level) || ESCALATION_LADDER[0];
}

export function stageById(id) {
  return STAGES.find((s) => s.id === id) || STAGES[4];
}

export function stageIndex(id) {
  const i = STAGE_ORDER.indexOf(id);
  return i < 0 ? 4 : i;
}

export function parseTime(value) {
  if (!value) return Date.now();
  const raw = String(value);
  const iso = /Z$|[+-]\d{2}:\d{2}$/.test(raw) ? raw : `${raw}Z`;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? Date.now() : t;
}

export function waitMinutes(value) {
  return Math.max(0, Math.floor((Date.now() - parseTime(value)) / 60000));
}

export function formatWait(mins, lang = "en") {
  const tr = translator(lang);
  if (mins < 1) return tr("wait.justNow");
  if (mins === 1) return tr("wait.oneMin");
  if (mins < 60) return tr("wait.mins", { n: mins });
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? tr("wait.hoursMins", { h, m }) : tr("wait.hours", { h });
}

/** Blocker label/owner in the patient's language, falling back to the seed row. */
export function blockerLabel(type, lang = "en", fallback = "") {
  if (!BLOCKER_TYPES[type]) return fallback || type;
  return translator(lang)(`blocker.${type}.label`);
}

export function blockerOwner(type, lang = "en", fallback = "") {
  if (!BLOCKER_TYPES[type]) return fallback || "";
  return translator(lang)(`blocker.${type}.owner`);
}

export function currentStage(patient) {
  if (patient.stage && STAGE_ORDER.includes(patient.stage)) return patient.stage;
  return STATUS_TO_STAGE[patient.status] || "waiting";
}

export function openBlockers(blockers = []) {
  return blockers.filter((b) => b.status !== "resolved");
}

export function criticalBlocker(blockers = []) {
  const open = openBlockers(blockers);
  if (!open.length) return null;
  return [...open].sort((a, b) => waitMinutes(b.created_at) - waitMinutes(a.created_at))[0];
}

export function isOverdue(blocker) {
  const typical = BLOCKER_TYPES[blocker.type]?.typicalMins || 30;
  return waitMinutes(blocker.created_at) >= typical;
}

export function isStuck(patient, blockers = []) {
  const mins = waitMinutes(patient.last_updated_at || patient.checked_in_at);
  const threshold = STUCK_THRESHOLDS[patient.status] || 30;
  const overdue = openBlockers(blockers).some(isOverdue);
  return mins >= threshold || overdue;
}

export function nextStageId(patient, blockers = []) {
  const stage = currentStage(patient);
  const open = openBlockers(blockers);
  if (stage === "testing" && open.some((b) => b.type === "lab" || b.type === "imaging")) return "results";
  if (stage === "evaluation" && open.some((b) => b.type === "lab" || b.type === "imaging")) return "testing";
  const i = stageIndex(stage);
  return STAGE_ORDER[Math.min(i + 1, STAGE_ORDER.length - 1)];
}

export function parallelOpportunities(patient, blockers = []) {
  const stage = currentStage(patient);
  const open = openBlockers(blockers);
  const types = new Set(open.map((b) => b.type));
  const ideas = [];

  if (["evaluation", "testing", "treatment", "observation"].includes(stage)) {
    if (!types.has("documentation") && patient.status !== "discharged") {
      ideas.push({
        id: "start-discharge",
        title: "Start discharge paperwork now",
        detail: "Going-home prep can happen while care continues. Starting it now usually saves 15–25 minutes at the end.",
      });
    }
    if (!types.has("pharmacy") && (patient.urgency === "medium" || patient.urgency === "high")) {
      ideas.push({
        id: "pre-pharmacy",
        title: "Pre-alert pharmacy",
        detail: "Medications can be queued before the visit ends so the patient is not waiting at discharge.",
      });
    }
  }

  if (open.length >= 2) {
    ideas.push({
      id: "parallel-open",
      title: "These waits can run at the same time",
      detail: open.map((b) => BLOCKER_TYPES[b.type]?.label || b.title).join(" · "),
    });
  }

  if (stage === "waiting" && patient.urgency === "high") {
    ideas.push({
      id: "pull-forward",
      title: "Pull this patient forward",
      detail: "High-urgency patients should not wait behind a standard queue. Call them next even if they are not first.",
    });
  }

  return ideas;
}

export function predictedRemaining(patient, blockers = []) {
  const open = openBlockers(blockers);
  const blockerEta = open.reduce((sum, b) => {
    const typical = BLOCKER_TYPES[b.type]?.typicalMins || 25;
    const elapsed = waitMinutes(b.created_at);
    return sum + Math.max(8, typical - elapsed);
  }, 0);
  const stage = currentStage(patient);
  const stagePad = {
    waiting: Math.max(8, (patient.queue_position || 1) * 7),
    evaluation: 18,
    testing: 12,
    results: 10,
    treatment: 20,
    observation: 25,
    discharge_prep: 12,
    wayfinding: 8,
  }[stage] || 15;
  const remaining = Math.max(stagePad, Math.round(blockerEta * 0.65 + stagePad * 0.5));
  return Math.min(120, remaining);
}

/** Stages whose copy exists in the string catalog under `stage.<id>.*`. */
const EXPLAINED_STAGES = new Set([
  "waiting", "evaluation", "testing", "results",
  "treatment", "observation", "discharge_prep", "wayfinding",
]);

export function explainWait(patient, blockers = [], deptName = "the care area", lang) {
  const code = normalizeLanguage(lang || patient.language);
  const tr = translator(code);
  const stage = currentStage(patient);
  const mins = waitMinutes(patient.last_updated_at || patient.checked_in_at);
  const primary = criticalBlocker(blockers);
  const unusual = isStuck(patient, blockers);

  if (patient.status === "discharged") {
    return {
      headline: tr("stage.discharged.headline"),
      why: tr("stage.discharged.why"),
      next: tr("stage.discharged.next"),
      youDo: tr("stage.discharged.youDo"),
      waitingFor: null,
      owner: null,
      unusual: false,
      waitMinutes: mins,
      lang: code,
    };
  }

  if (primary) {
    const meta = BLOCKER_TYPES[primary.type];
    const typical = meta?.typicalMins || primary.eta_minutes || 30;
    const label = blockerLabel(primary.type, code, primary.title);
    const owner = primary.owner_name || blockerOwner(primary.type, code, primary.owner_role);
    const elapsed = waitMinutes(primary.created_at);
    const overdue = elapsed >= typical;
    return {
      headline: tr(overdue ? "blocker.headline.overdue" : "blocker.headline", { what: label.toLowerCase() }),
      why: tr(overdue ? "blocker.why.overdue" : "blocker.why", {
        owner,
        elapsed: formatWait(elapsed, code),
        typical,
      }),
      next: tr("blocker.next", { nextStage: localizedStageLabel(nextStageId(patient, blockers), code).toLowerCase() }),
      youDo: tr(primary.type === "registration" ? "blocker.youDo.registration" : "blocker.youDo"),
      waitingFor: label,
      owner,
      unusual: overdue || unusual,
      waitMinutes: elapsed,
      lang: code,
    };
  }

  const key = EXPLAINED_STAGES.has(stage) ? stage : "default";
  const transporting = patient.status === "pending_transport";

  let headline = tr(`stage.${key}.headline`);
  if (key === "waiting" && patient.queue_position) {
    headline = tr("stage.waiting.headline.position", { n: patient.queue_position });
  }

  let why = tr(`stage.${key}.why`, { dept: deptName });
  if (key === "wayfinding" && transporting) why = tr("stage.wayfinding.why.transport");

  let waitingFor = null;
  if (key === "wayfinding") {
    waitingFor = tr(transporting ? "stage.wayfinding.waitingFor.transport" : "stage.wayfinding.waitingFor");
  } else if (!["evaluation", "treatment"].includes(key)) {
    waitingFor = tr(`stage.${key}.waitingFor`);
  }

  let owner = deptName;
  if (key === "wayfinding") {
    owner = transporting ? blockerOwner("transport", code) : deptName;
  } else if (key !== "default") {
    owner = tr(`stage.${key}.owner`, { dept: deptName });
  }

  return {
    headline,
    why,
    next: tr(`stage.${key}.next`),
    youDo: tr(`stage.${key}.youDo`),
    waitingFor,
    owner,
    unusual,
    waitMinutes: mins,
    lang: code,
  };
}

/** Timeline group label in the patient's language; staff copy stays English. */
function localizedStageLabel(stageId, lang) {
  const group = TIMELINE_GROUPS.find((g) => g.ids.includes(stageId));
  return group ? translator(lang)(`timeline.${group.id}`) : stageById(stageId).label;
}

export function recommendedAction(patient, blockers = []) {
  const mins = waitMinutes(patient.last_updated_at || patient.checked_in_at);
  const open = openBlockers(blockers);
  const primary = criticalBlocker(blockers);
  const stage = currentStage(patient);
  const unusual = isStuck(patient, blockers);

  if (patient.status === "waiting" && patient.urgency === "high") {
    return {
      id: "call-now",
      kind: "call",
      label: "Call this patient now",
      reason: `High urgency, waiting ${formatWait(mins)}. Do not leave them behind a standard queue.`,
      priority: 1,
    };
  }

  if (primary && isOverdue(primary)) {
    return {
      id: "escalate-blocker",
      kind: "escalate",
      label: `Escalate ${BLOCKER_TYPES[primary.type]?.label || primary.title}`,
      reason: `${primary.owner_role || BLOCKER_TYPES[primary.type]?.owner} has held this for ${formatWait(waitMinutes(primary.created_at))} — past the usual window.`,
      priority: 1,
      blockerId: primary.id,
    };
  }

  if (!open.length && ["pending_test", "pending_signature", "pending_transport", "pending_bed", "called"].includes(patient.status)) {
    return {
      id: "advance",
      kind: "advance",
      label: "Advance — dependencies are clear",
      reason: "Nothing is actually pending. This patient is blocked only because the status was not updated.",
      priority: 2,
    };
  }

  if (["evaluation", "testing", "in_progress", "pending_test"].includes(patient.status) && mins >= 20 && !open.some((b) => b.type === "documentation")) {
    return {
      id: "prep-discharge",
      kind: "prepare-discharge",
      label: "Start going-home prep in parallel",
      reason: "Care is underway. Paperwork and pharmacy can start now instead of after the last clinical step.",
      priority: 3,
    };
  }

  if (patient.status === "waiting") {
    return {
      id: "call-next",
      kind: "call",
      label: "Call when a slot opens",
      reason: `Position ${patient.queue_position || "—"} · waiting ${formatWait(mins)}.`,
      priority: patient.urgency === "medium" ? 3 : 4,
    };
  }

  if (stage === "discharge_prep") {
    return {
      id: "finish-discharge",
      kind: "discharge",
      label: "Complete discharge",
      reason: "Patient is in going-home prep. Confirm instructions and release them.",
      priority: 2,
    };
  }

  if (unusual) {
    return {
      id: "review",
      kind: "review",
      label: "Review this patient",
      reason: `Status has been ${patient.status.replaceAll("_", " ")} for ${formatWait(mins)}.`,
      priority: 2,
    };
  }

  return {
    id: "monitor",
    kind: "monitor",
    label: "On track",
    reason: "Waits are within the expected window.",
    priority: 5,
  };
}

export function patientQuestions(patient, blockers = [], lang) {
  const code = normalizeLanguage(lang || patient.language);
  const tr = translator(code);
  const stage = currentStage(patient);
  const primary = criticalBlocker(blockers);
  const qs = [];
  if (stage === "waiting") {
    qs.push(tr("q.turn"));
    qs.push(tr("q.stepOut"));
  }
  if (primary) {
    qs.push(tr("q.howLong", { what: blockerLabel(primary.type, code, primary.title).toLowerCase() }));
    qs.push(tr("q.after"));
  }
  if (["evaluation", "treatment"].includes(stage)) {
    qs.push(tr("q.cause"));
    qs.push(tr("q.watchFor"));
  }
  if (stage === "testing" || stage === "results") {
    qs.push(tr("q.whichResults"));
  }
  if (stage === "discharge_prep" || stage === "discharge") {
    qs.push(tr("q.comeBack"));
    qs.push(tr("q.followUp"));
    qs.push(tr("q.meds"));
  }
  qs.push(tr("q.speedUp"));
  return [...new Set(qs)].slice(0, 4);
}

export function whileYouWait(patient, blockers = [], lang) {
  const code = normalizeLanguage(lang || patient.language);
  const tr = translator(code);
  const items = [];
  const open = openBlockers(blockers);
  if (open.some((b) => b.can_parallel)) items.push(tr("wyw.parallel"));
  if (currentStage(patient) === "waiting") items.push(tr("wyw.restroom"));
  if (code !== "en") items.push(tr("wyw.interpreter"));
  items.push(tr("wyw.questions"));
  return items.slice(0, 3);
}

export const TIMELINE_GROUPS = [
  { id: "intake", label: "Check-in", ids: ["arrival", "intake", "registration", "wayfinding"] },
  { id: "waiting", label: "Waiting", ids: ["waiting"] },
  { id: "evaluation", label: "Care", ids: ["evaluation", "treatment", "observation"] },
  { id: "testing", label: "Tests", ids: ["testing", "results"] },
  { id: "discharge", label: "Home", ids: ["discharge_prep", "discharge", "followup"] },
];

export function timeline(patient, lang) {
  const tr = translator(lang || patient.language);
  const stage = currentStage(patient);
  const groups = TIMELINE_GROUPS;
  const last = groups.length - 1;
  const currentGroup = groups.findIndex((g) => g.ids.includes(stage));
  return groups.map((g, i) => {
    let state = "later";
    if (patient.status === "discharged") state = i === last ? "now" : "done";
    else if (i < currentGroup) state = "done";
    else if (i === currentGroup) state = "now";
    else if (i === currentGroup + 1) state = "next";
    const label = tr(`timeline.${g.id}`);
    return { id: g.id, label, patient: label, staff: g.label, state };
  });
}

export function enrichPatient(patient, blockers = [], extras = {}) {
  const deptName = extras.deptName || patient.department;
  const lang = normalizeLanguage(extras.lang || patient.language);
  const tr = translator(lang);
  const wait = waitMinutes(patient.checked_in_at);
  const sinceUpdate = waitMinutes(patient.last_updated_at || patient.checked_in_at);
  const stage = currentStage(patient);
  const blockersAnnotated = blockers.map((b) => ({
    ...b,
    wait_minutes: waitMinutes(b.created_at),
    overdue: b.status !== "resolved" && isOverdue(b),
    typical_minutes: BLOCKER_TYPES[b.type]?.typicalMins || 30,
    // Staff always read English; `type_label_local` is what the patient sees.
    type_label: BLOCKER_TYPES[b.type]?.label || b.title,
    type_label_local: blockerLabel(b.type, lang, b.title),
    owner_label_local: b.owner_name || blockerOwner(b.type, lang, b.owner_role),
  }));
  const now = explainWait(patient, blockers, deptName, lang);
  const action = recommendedAction(patient, blockers);
  return {
    ...patient,
    stage,
    stage_label: stageById(stage).staff,
    wait_minutes: wait,
    since_update_minutes: sinceUpdate,
    is_stuck: isStuck(patient, blockers),
    predicted_remaining: predictedRemaining(patient, blockers),
    blockers: blockersAnnotated,
    open_blocker_count: openBlockers(blockers).length,
    now,
    action,
    parallel: parallelOpportunities(patient, blockers),
    questions: patientQuestions(patient, blockers, lang),
    while_you_wait: whileYouWait(patient, blockers, lang),
    timeline: timeline(patient, lang),
    next_stage: stageById(nextStageId(patient, blockers)),
    locale: {
      lang,
      dir: tr.dir,
      label: tr.label,
      native: tr.native,
      // When coverage is partial the UI offers a human interpreter instead of
      // implying the translation is complete.
      fullyTranslated: tr.full,
      coverage: Math.round(tr.coverage * 100),
    },
  };
}

function queueGrowth(patients, department) {
  const inDept = patients.filter((p) => p.department === department && p.status !== "discharged");
  const waiting = inDept.filter((p) => p.status === "waiting");
  const recent = inDept.filter((p) => waitMinutes(p.checked_in_at) <= 30).length;
  const older = waiting.filter((p) => waitMinutes(p.checked_in_at) > 20).length;
  if (waiting.length >= 3 && older >= 2) return "critical";
  if (waiting.length >= 2 || recent >= 2) return "forming";
  return "steady";
}

export function computeFlow(patients, blockersByPatient = {}, deptNames = {}) {
  const active = patients.filter((p) => p.status !== "discharged");
  const enriched = active.map((p) => enrichPatient(p, blockersByPatient[p.id] || [], { deptName: deptNames[p.department] }));

  const stuck = enriched.filter((p) => p.is_stuck);
  const waiting = enriched.filter((p) => p.status === "waiting");
  const ready = enriched.filter((p) => p.action.kind === "advance");
  const dischargeReady = enriched.filter((p) =>
    ["discharge_prep", "discharge"].includes(p.stage) || p.action.kind === "discharge" || p.action.kind === "prepare-discharge"
  );

  const blockerBag = [];
  Object.values(blockersByPatient).forEach((list) => blockerBag.push(...openBlockers(list)));

  const byType = {};
  blockerBag.forEach((b) => {
    byType[b.type] = byType[b.type] || [];
    byType[b.type].push(b);
  });

  const bottlenecks = [];

  Object.entries(byType).forEach(([type, list]) => {
    const overdue = list.filter(isOverdue);
    if (list.length >= 2 || overdue.length) {
      const meta = BLOCKER_TYPES[type];
      const avg = Math.round(list.reduce((s, b) => s + waitMinutes(b.created_at), 0) / list.length);
      bottlenecks.push({
        id: `blocker-${type}`,
        severity: overdue.length ? "critical" : list.length >= 3 ? "watch" : "info",
        title: `${meta?.label || type} is holding ${list.length} patient${list.length === 1 ? "" : "s"}`,
        detail: `Average pending ${avg} min · typical ${meta?.typicalMins || 30} min. Owner: ${meta?.owner || "unassigned"}.`,
        owner: meta?.owner,
        count: list.length,
        action: overdue.length
          ? `Escalate ${overdue.length} overdue ${meta?.label.toLowerCase() || type} request${overdue.length === 1 ? "" : "s"}.`
          : `Start the next ${meta?.label.toLowerCase() || type} now so this queue does not grow.`,
        type,
      });
    }
  });

  const depts = [...new Set(active.map((p) => p.department))];
  const queues = depts.map((department) => {
    const inDept = enriched.filter((p) => p.department === department);
    const waiters = inDept.filter((p) => p.status === "waiting");
    const avgWait = waiters.length
      ? Math.round(waiters.reduce((s, p) => s + p.wait_minutes, 0) / waiters.length)
      : inDept.length
        ? Math.round(inDept.reduce((s, p) => s + p.wait_minutes, 0) / inDept.length)
        : 0;
    const congestion = queueGrowth(active, department);
    if (congestion !== "steady" || waiters.length >= 2) {
      bottlenecks.push({
        id: `queue-${department}`,
        severity: congestion === "critical" ? "critical" : "watch",
        title: `${deptNames[department] || department} queue is ${congestion === "critical" ? "backed up" : "forming"}`,
        detail: `${waiters.length} waiting · avg ${avgWait} min · ${inDept.filter((p) => p.urgency === "high").length} high urgency.`,
        owner: deptNames[department] || department,
        count: waiters.length,
        action: inDept.some((p) => p.urgency === "high" && p.status === "waiting")
          ? "Call the high-urgency patient next, not the person who has been waiting longest."
          : "Open another slot or move a ready patient downstream.",
        type: "queue",
        department,
      });
    }
    return {
      department,
      name: deptNames[department] || department,
      total: inDept.length,
      waiting: waiters.length,
      stuck: inDept.filter((p) => p.is_stuck).length,
      high: inDept.filter((p) => p.urgency === "high").length,
      avgWait,
      congestion,
    };
  }).sort((a, b) => b.waiting - a.waiting || b.avgWait - a.avgWait);

  const hour = new Date().getHours();
  const predictions = [];
  const ed = queues.find((q) => q.department === "emergency");
  if (ed && ed.waiting >= 2) {
    predictions.push({
      id: "ed-wait",
      confidence: "likely",
      title: "Adult Emergency waits will keep rising this hour",
      detail: `There are already ${ed.waiting} people in line (avg ${ed.avgWait} min). Arrivals typically increase late morning and early evening.`,
    });
  }
  if ((byType.lab?.length || 0) + (byType.imaging?.length || 0) >= 3) {
    predictions.push({
      id: "diagnostics",
      confidence: "likely",
      title: "Diagnostics will become the hospital-wide bottleneck",
      detail: "Several visits are paused on labs or imaging. Downstream discharge and bed assignment will stall until results move.",
    });
  }
  if (dischargeReady.length >= 2) {
    predictions.push({
      id: "discharge-cluster",
      confidence: "expected",
      title: "A cluster of discharges can free capacity",
      detail: `${dischargeReady.length} patients are close to leaving. Clearing pharmacy and signatures now is the fastest way to open rooms.`,
    });
  }
  if (hour >= 14 && hour <= 18) {
    predictions.push({
      id: "afternoon-surge",
      confidence: "seasonal",
      title: "Afternoon crowding window",
      detail: "This time of day usually stacks ED arrivals with delayed morning tests. Pull discharge-ready patients first.",
    });
  }

  const tasks = enriched
    .filter((p) => p.action.kind !== "monitor")
    .map((p) => ({
      id: `${p.id}-${p.action.id}`,
      patientId: p.id,
      name: p.name,
      department: p.department,
      urgency: p.urgency,
      priority: p.action.priority + (p.urgency === "high" ? -1 : 0),
      kind: p.action.kind,
      title: p.action.label,
      reason: p.action.reason,
      wait: p.wait_minutes,
      blockerId: p.action.blockerId,
    }))
    .sort((a, b) => a.priority - b.priority || b.wait - a.wait)
    .slice(0, 10);

  bottlenecks.sort((a, b) => {
    const rank = { critical: 0, watch: 1, info: 2 };
    return (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3);
  });

  const avgWait = waiting.length
    ? Math.round(waiting.reduce((s, p) => s + p.wait_minutes, 0) / waiting.length)
    : 0;

  return {
    generatedAt: new Date().toISOString(),
    kpis: {
      active: active.length,
      waiting: waiting.length,
      stuck: stuck.length,
      readyToAdvance: ready.length,
      dischargeReady: dischargeReady.length,
      avgWait,
      highUrgency: active.filter((p) => p.urgency === "high").length,
      overdueBlockers: blockerBag.filter(isOverdue).length,
    },
    bottlenecks: bottlenecks.slice(0, 8),
    queues,
    predictions: predictions.slice(0, 4),
    tasks,
    readyToAdvance: ready,
    dischargeOpportunities: dischargeReady,
    patients: enriched,
  };
}

export function inferBlockersFromSituation(patient) {
  const text = `${patient.situation || ""} ${patient.reason || ""} ${patient.summary || ""}`.toLowerCase();
  const out = [];

  const add = (type, title, detail, extra = {}) => {
    if (out.some((b) => b.type === type)) return;
    out.push({ type, title, detail, ...extra });
  };

  if (/\b(chest pain|cardiac|heart attack|troponin|arm radiation)\b/.test(text)) {
    add("lab", "Troponin / blood work", "Cardiac labs are needed before the team can safely decide next steps.", { can_parallel: 1 });
    add("imaging", "ECG / chest imaging", "Heart tracing and imaging can run at the same time as labs.", { can_parallel: 1 });
  }
  if (/\b(mri|pet scan|ct scan|x-ray|xray|imaging|radiolog)\b/.test(text)) {
    add("imaging", "Imaging study", "The visit cannot advance until imaging is complete and read.", { can_parallel: 1 });
  }
  if (/\b(fever|seizure|blood work|troponin)\b/.test(text) || /\babdominal pain\b/.test(text)) {
    add("lab", "Laboratory studies", "Blood work is often the hidden wait inside an otherwise short visit.", { can_parallel: 1 });
  }
  if (/fracture|wrist|ladder|orthopedic|swollen/.test(text)) {
    add("imaging", "X-ray", "A film is needed before the orthopedic plan is clear.", { can_parallel: 1 });
  }
  if (/rabies|bite|bat|scratch|stray/.test(text) || patient.department === "rabies") {
    add("pharmacy", "Rabies vaccine / immunoglobulin", "Pharmacy has to prepare the dose before treatment can start.", { can_parallel: 0 });
  }
  if (/pregnan|labor|maternity/.test(text)) {
    add("bed", "Labor & delivery / obstetric bed", "A monitored bed is required before the evaluation can continue in the right unit.", { can_parallel: 0 });
  }
  if (/pre-admission|preadmission|surgery next/.test(text)) {
    add("documentation", "Pre-operative paperwork", "Missing consents or history will delay the scheduled procedure.", { can_parallel: 1 });
    add("lab", "Pre-op labs", "Required labs can be drawn while registration finishes.", { can_parallel: 1 });
  }
  if (/psych|sad|isolated|pensamientos|difficult thoughts/.test(text) || patient.department === "winchester") {
    add("consult", "Psychiatry evaluation", "A specialist needs to see the patient before disposition is decided.", { can_parallel: 0 });
  }
  const lang = normalizeLanguage(patient.language);
  if (lang !== "en") {
    const tr = translator(lang);
    // Raise this at check-in rather than when a clinician hits the language
    // barrier: a late interpreter request is one of the most expensive delays
    // in the whole journey, and it is fully predictable from intake.
    add(
      "interpreter",
      `Interpreter — ${tr.label}`,
      tr.full
        ? `Patient prefers ${tr.label}. ClearPath can show updates in ${tr.label}, but clinical conversation still needs an interpreter.`
        : `Patient prefers ${tr.label}. ClearPath has only partial ${tr.label} coverage, so live updates may appear in English. An interpreter is required.`,
      { can_parallel: 1 }
    );
  }
  if (patient.status === "pending_transport") {
    add("transport", "Patient transport", "The next department is ready only after the patient physically arrives.", { can_parallel: 0 });
  }
  if (patient.status === "pending_bed") {
    add("bed", "Inpatient or procedure bed", "Care is paused until a room is assigned and turned over.", { can_parallel: 0 });
  }
  if (patient.status === "pending_signature") {
    add("signature", "Attending sign-off", "Discharge or procedure cannot complete without a provider signature.", { can_parallel: 0 });
  }
  if (patient.status === "pending_test" && !out.some((b) => b.type === "lab" || b.type === "imaging")) {
    add("lab", "Pending diagnostic result", "The care team is waiting on a test before they can decide.", { can_parallel: 1 });
  }
  return out;
}

/**
 * Deterministic triage routing over clinical concepts rather than English
 * keywords, so a patient describing the same symptom in Spanish, Haitian
 * Creole, Arabic, Chinese, Portuguese or Russian lands in the same department
 * with the same urgency. Red flags are checked before anything else: a child
 * with a seizure is an emergency first and a paediatric case second.
 */
export function keywordRoute(situation = "", lang) {
  const found = conceptsIn(situation);
  const has = (...names) => names.some((n) => found.has(n));
  const tr = translator(lang || detectLanguage(situation));

  // The routing explanation is the first sentence a patient reads after
  // describing their symptom, so it is resolved in their language here rather
  // than left for the caller to translate after the fact.
  const out = (department, urgency, reasonKey) => ({
    department,
    urgency,
    reasonKey,
    reason: tr(reasonKey),
    matched: [...found],
  });

  const RED_FLAGS = ["chest_pain", "breathing", "stroke", "unconscious", "bleeding", "seizure"];
  if (has(...RED_FLAGS)) {
    return has("child")
      ? out("pediatric", "high", "route.pediatric.urgent")
      : out("emergency", "high", "route.emergency");
  }

  if (has("child", "pregnancy")) {
    return out("pediatric", has("fever", "pregnancy") ? "high" : "medium", "route.pediatric");
  }
  if (has("animal_bite")) return out("rabies", "medium", "route.rabies");
  if (has("imaging")) return out("clinicbldg", "low", "route.clinicbldg");
  if (has("behavioral")) return out("winchester", "medium", "route.winchester");
  if (has("fracture", "surgery")) return out("ypb", "medium", "route.ypb");
  if (has("oncology")) return out("north", "low", "route.north");
  if (has("pulmonary")) return out("fitkin", "low", "route.fitkin");
  if (has("abdominal", "vision", "diabetes")) {
    return out("dana", has("fever") ? "medium" : "low", "route.dana");
  }
  if (has("fever")) return out("triage", "medium", "route.triage.fever");
  if (has("nonmedical")) return out("atrium", "low", "route.atrium");
  return out("triage", "low", "route.triage");
}
