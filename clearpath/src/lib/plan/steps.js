/**
 * The step library: what hospital work actually consists of.
 *
 * Two modelling decisions in here do most of the work.
 *
 * ── A lab is not one task ──
 *
 * Hospitals track "labs" as a single 45-minute blocker. It isn't one thing: it
 * is a 3-minute draw that needs the patient, then 40 minutes of analysis that
 * does not, then a 2-minute read that needs a physician and not the patient.
 * Collapsing those three into one opaque box is what hides the most valuable
 * fact in the building — that the patient is free for 42 of those 45 minutes.
 * Split apart, the planner can put the CT, the paperwork, the PT eval or the
 * interpreter call into that gap. Fused together, it can only wait.
 *
 * ── Clock constraints are not resource constraints ──
 *
 * Serial troponins are three hours apart because of cardiac biology, not because
 * the lab is busy. Expediting anything cannot move that gap. A planner that
 * cannot tell the two apart will burn the shift expediting a scanner to save a
 * patient zero minutes, which is most of what "expediting" currently is.
 */
import { duration, fixed } from "./distribution.js";

/**
 * Pooled resources. `mobile` means the capability can come to the patient,
 * which turns "bring the machine to bed 7" from a favour someone calls in into
 * a scheduling option the planner can cost out.
 */
export const RESOURCES = {
  nurse:        { label: "Nursing",              capacity: 6, mobile: true },
  attending:    { label: "Attending physician",  capacity: 3, mobile: true },
  resident:     { label: "Resident",             capacity: 4, mobile: true },
  phlebotomy:   { label: "Phlebotomy",           capacity: 3, mobile: true },
  lab:          { label: "Laboratory",           capacity: 4, mobile: false },
  ecg:          { label: "ECG",                  capacity: 3, mobile: true },
  xray:         { label: "X-ray",                capacity: 2, mobile: true },
  ct:           { label: "CT",                   capacity: 1, mobile: false },
  ultrasound:   { label: "Ultrasound",           capacity: 2, mobile: true },
  radiologist:  { label: "Radiology read",       capacity: 2, mobile: false },
  pharmacy:     { label: "Pharmacy",             capacity: 2, mobile: false },
  transport:    { label: "Transport",            capacity: 3, mobile: false },
  interpreter:  { label: "Interpreter",          capacity: 2, mobile: true },
  cardiology:   { label: "Cardiology",           capacity: 1, mobile: true },
  psychiatry:   { label: "Psychiatry",           capacity: 1, mobile: true },
  surgery:      { label: "Surgery",              capacity: 1, mobile: true },
  physio:       { label: "Physical therapy",     capacity: 2, mobile: true },
  socialwork:   { label: "Social work",          capacity: 1, mobile: true },
  registration: { label: "Registration",         capacity: 3, mobile: true },
  bed:          { label: "Bed management",       capacity: 2, mobile: false },
  evs:          { label: "Environmental svcs",   capacity: 3, mobile: false },
  external:     { label: "Outside the hospital", capacity: 99, mobile: true },
};

/** `presence` is how much of the patient's own body the step consumes. */
function step(id, label, opts) {
  return {
    id,
    label,
    goal: opts.goal,
    requires: opts.requires || [],
    resource: opts.resource || null,
    presence: opts.presence || "none",
    duration: opts.fixed ? fixed(opts.fixed) : duration(opts.p50, opts.p90),
    probability: opts.probability ?? 1,
    clock: Boolean(opts.clock),
    gatesDischarge: Boolean(opts.gatesDischarge),
    why: opts.why || "",
    state: "pending",
  };
}

/**
 * A diagnostic specimen, decomposed. This is the shape that exposes the gap:
 * only `draw` wants the patient.
 */
function specimen(prefix, label, goal, { after = [], analysisP50 = 40, analysisP90 = 95, drawP50 = 3 } = {}) {
  return [
    step(`${prefix}-draw`, `${label}: draw`, {
      goal, requires: after, resource: "phlebotomy", presence: "required",
      p50: drawP50, p90: drawP50 * 3,
      why: "They need to be here for the draw.",
    }),
    step(`${prefix}-run`, `${label}: analysis`, {
      goal, requires: [`${prefix}-draw`], resource: "lab", presence: "none",
      p50: analysisP50, p90: analysisP90,
      why: "This runs in the lab. They don't need to wait in the room.",
    }),
    step(`${prefix}-read`, `${label}: review`, {
      goal, requires: [`${prefix}-run`], resource: "attending", presence: "none",
      p50: 6, p90: 25,
      why: "A clinician has to actually look at the result.",
    }),
  ];
}

/** An imaging study, decomposed the same way: acquisition needs the patient, the read does not. */
function imaging(prefix, label, goal, resource, { after = [], acquireP50 = 15, acquireP90 = 40, readP50 = 25, readP90 = 70 } = {}) {
  return [
    step(`${prefix}-acquire`, `${label}: scan`, {
      goal, requires: after, resource, presence: "required",
      p50: acquireP50, p90: acquireP90,
      why: "They have to be at the scanner.",
    }),
    step(`${prefix}-read`, `${label}: read`, {
      goal, requires: [`${prefix}-acquire`], resource: "radiologist", presence: "none",
      p50: readP50, p90: readP90,
      why: "Radiology reads this. They don't need to stay in the department.",
    }),
  ];
}

/**
 * Work every visit needs, built backwards from leaving rather than forwards from
 * arriving. `ride-home` is the clearest example of why: it takes 45 minutes of
 * somebody else's driving, it is discovered at the moment of discharge, and it
 * is knowable at minute zero. In this graph the backward pass pulls it to the
 * front on its own.
 */
function universalSteps() {
  return [
    step("arrive", "Arrival", { goal: "access", presence: "required", fixed: 1 }),
    step("triage", "Triage assessment", {
      goal: "access", requires: ["arrive"], resource: "nurse", presence: "required",
      p50: 6, p90: 15,
      why: "Sets urgency and opens everything downstream.",
    }),
    step("register", "Registration", {
      goal: "access", requires: ["arrive"], resource: "registration", presence: "brief",
      p50: 7, p90: 20,
      why: "This can run in the background while care continues.",
    }),
    step("provider-eval", "Provider evaluation", {
      goal: "diagnosis", requires: ["triage"], resource: "attending", presence: "required",
      p50: 20, p90: 50,
      why: "The decision point that generates most of the rest of the plan.",
    }),
    step("dispo-decision", "Disposition decision", {
      goal: "disposition", resource: "attending", presence: "none",
      p50: 10, p90: 30,
      why: "Home or admitted. Everything downstream branches here.",
    }),
    step("ride-home", "Arrange ride home", {
      goal: "departure", resource: "external", presence: "none",
      p50: 45, p90: 120, gatesDischarge: true,
      why: "Rides take about 45 minutes. Ask at the start of the visit, not at the end.",
    }),
    step("prescriptions", "Discharge medications", {
      goal: "departure", requires: ["dispo-decision"], resource: "pharmacy", presence: "none",
      p50: 25, p90: 70, gatesDischarge: true,
    }),
    step("instructions", "Discharge instructions", {
      goal: "departure", requires: ["dispo-decision"], resource: "nurse", presence: "brief",
      p50: 12, p90: 30, gatesDischarge: true,
    }),
    step("signoff", "Attending sign-off", {
      goal: "departure", requires: ["dispo-decision"], resource: "attending", presence: "none",
      p50: 8, p90: 35, gatesDischarge: true,
    }),
    step("depart", "Patient leaves", {
      goal: "departure",
      requires: ["prescriptions", "instructions", "signoff", "ride-home"],
      presence: "required", fixed: 2,
    }),
  ];
}

/**
 * Presentation-specific work, keyed by the clinical concepts the triage router
 * already extracts. Each bundle returns steps plus the extra edges that wire it
 * into the universal graph.
 */
export const BUNDLES = {
  chest_pain: () => ({
    label: "Chest pain / ACS rule-out",
    steps: [
      step("iv", "IV access", {
        goal: "acs", requires: ["triage"], resource: "nurse", presence: "required",
        p50: 8, p90: 20,
      }),
      step("ecg", "ECG", {
        goal: "acs", requires: ["triage"], resource: "ecg", presence: "required",
        p50: 7, p90: 15,
        why: "The machine comes to the bedside, so no transport.",
      }),
      ...specimen("trop1", "Troponin (first)", "acs", { after: ["iv"], analysisP50: 40, analysisP90: 90 }),
      step("trop-interval", "Mandatory 3-hour interval", {
        goal: "acs", requires: ["trop1-read"], presence: "none",
        fixed: 180, clock: true,
        why: "This is a required wait. Calling them sooner won't shorten it.",
      }),
      ...specimen("trop2", "Troponin (second)", "acs", { after: ["trop-interval"], analysisP50: 40, analysisP90: 90 }),
      step("cards-consult", "Cardiology consult", {
        goal: "acs", requires: ["trop1-read"], resource: "cardiology", presence: "brief",
        p50: 40, p90: 120, probability: 0.45,
        why: "Needed in under half of these visits. Giving cardiology a heads-up costs almost nothing.",
      }),
    ],
    edges: [["trop2-read", "dispo-decision"], ["ecg", "provider-eval"]],
  }),

  breathing: () => ({
    label: "Shortness of breath",
    steps: [
      step("iv", "IV access", { goal: "resp", requires: ["triage"], resource: "nurse", presence: "required", p50: 8, p90: 20 }),
      step("ecg", "ECG", { goal: "resp", requires: ["triage"], resource: "ecg", presence: "required", p50: 7, p90: 15 }),
      ...specimen("bloods", "Blood panel", "resp", { after: ["iv"] }),
      ...imaging("cxr", "Chest X-ray", "resp", "xray", { after: ["triage"], acquireP50: 12, readP50: 20 }),
    ],
    edges: [["cxr-read", "dispo-decision"], ["bloods-read", "dispo-decision"]],
  }),

  abdominal: () => ({
    label: "Abdominal pain",
    steps: [
      step("iv", "IV access", { goal: "abdo", requires: ["triage"], resource: "nurse", presence: "required", p50: 8, p90: 20 }),
      ...specimen("bloods", "Blood panel", "abdo", { after: ["iv"] }),
      ...imaging("ct", "CT abdomen", "abdo", "ct", { after: ["provider-eval"], acquireP50: 20, acquireP90: 55, readP50: 35, readP90: 95 }),
      step("surg-consult", "Surgical consult", {
        goal: "abdo", requires: ["ct-read"], resource: "surgery", presence: "brief",
        p50: 45, p90: 130, probability: 0.3,
        why: "Speculative: pre-notify surgery while the CT is still reading.",
      }),
    ],
    edges: [["ct-read", "dispo-decision"], ["bloods-read", "dispo-decision"]],
  }),

  fracture: () => ({
    label: "Suspected fracture",
    steps: [
      ...imaging("xr", "X-ray", "ortho", "xray", { after: ["triage"], acquireP50: 12, acquireP90: 30, readP50: 18, readP90: 50 }),
      step("splint", "Splint / immobilise", {
        goal: "ortho", requires: ["xr-read"], resource: "nurse", presence: "required", p50: 20, p90: 45,
      }),
      step("ortho-followup", "Orthopaedic follow-up booking", {
        goal: "ortho", requires: ["xr-read"], resource: "external", presence: "none",
        p50: 20, p90: 60, gatesDischarge: true,
        why: "Booked before leaving, or it becomes a phone call the patient has to chase.",
      }),
    ],
    edges: [["splint", "dispo-decision"]],
  }),

  fever: () => ({
    label: "Fever / possible infection",
    steps: [
      step("iv", "IV access", { goal: "infection", requires: ["triage"], resource: "nurse", presence: "required", p50: 8, p90: 20 }),
      ...specimen("cultures", "Blood cultures", "infection", { after: ["iv"], analysisP50: 55, analysisP90: 140 }),
      step("abx", "First antibiotic dose", {
        goal: "infection", requires: ["cultures-draw", "provider-eval"], resource: "pharmacy", presence: "brief",
        p50: 25, p90: 60,
        why: "Only needs the draw done, not the result. Waiting on cultures here costs hours for nothing.",
      }),
    ],
    edges: [["abx", "dispo-decision"], ["cultures-read", "dispo-decision"]],
  }),

  behavioral: () => ({
    label: "Behavioural health",
    steps: [
      step("psych-consult", "Psychiatric evaluation", {
        goal: "behavioral", requires: ["provider-eval"], resource: "psychiatry", presence: "required",
        p50: 55, p90: 160,
      }),
      step("safety-plan", "Safety plan + placement", {
        goal: "behavioral", requires: ["psych-consult"], resource: "socialwork", presence: "brief",
        p50: 70, p90: 240, gatesDischarge: true,
        why: "Placement is the real bottleneck in these visits, and it is almost never started early.",
      }),
    ],
    edges: [["safety-plan", "dispo-decision"]],
  }),

  animal_bite: () => ({
    label: "Animal bite / rabies prophylaxis",
    steps: [
      step("wound-care", "Wound irrigation", {
        goal: "bite", requires: ["triage"], resource: "nurse", presence: "required", p50: 20, p90: 45,
      }),
      step("rig", "Rabies immunoglobulin", {
        goal: "bite", requires: ["provider-eval"], resource: "pharmacy", presence: "brief",
        p50: 45, p90: 130,
        why: "Pharmacy has to prepare a weight-based dose. Predictable from the triage note alone.",
      }),
    ],
    edges: [["rig", "dispo-decision"], ["wound-care", "dispo-decision"]],
  }),

  preop: () => ({
    label: "Pre-admission testing",
    steps: [
      ...specimen("bloods", "Pre-op labs", "clearance", { after: ["arrive"] }),
      step("ecg", "ECG", {
        goal: "clearance", requires: ["arrive"], resource: "ecg", presence: "required",
        p50: 7, p90: 15,
        why: "The machine comes to the chair. There is no reason this waits on registration.",
      }),
      step("consent", "Surgical consent packet", {
        goal: "clearance", requires: ["register"], resource: "registration", presence: "brief",
        p50: 15, p90: 40,
      }),
    ],
    edges: [["bloods-read", "clearance"], ["ecg", "clearance"], ["consent", "clearance"]],
  }),

  scheduled_mri: () => ({
    label: "Scheduled MRI",
    steps: [
      step("to-scanner", "Transport to MRI", {
        goal: "imaging", requires: ["arrive"], resource: "transport", presence: "required",
        p50: 12, p90: 30,
      }),
      ...imaging("study", "MRI", "imaging", "ct", {
        after: ["to-scanner"], acquireP50: 35, acquireP90: 70, readP50: 40, readP90: 110,
      }),
    ],
    edges: [["study-acquire", "depart"]],
  }),

  mammo: () => ({
    label: "Screening mammography",
    steps: [
      step("to-scanner", "Transport to imaging", {
        goal: "imaging", requires: ["arrive"], resource: "transport", presence: "required",
        p50: 12, p90: 30,
      }),
      ...imaging("study", "Mammogram", "imaging", "xray", {
        after: ["to-scanner"], acquireP50: 18, acquireP90: 40, readP50: 30, readP90: 90,
      }),
    ],
    edges: [["study-acquire", "depart"]],
  }),

  pulmonary: () => ({
    label: "Pulmonary function test",
    steps: [
      step("pft", "Pulmonary function test", {
        goal: "clinic", requires: ["arrive"], resource: "nurse", presence: "required",
        p50: 25, p90: 50,
      }),
      step("ecg", "ECG at the chair", {
        goal: "clinic", requires: ["arrive"], resource: "ecg", presence: "required",
        p50: 7, p90: 15,
        why: "Mobile. There is no reason a PFT patient walks to another department for this.",
      }),
    ],
    edges: [["pft", "depart"], ["ecg", "depart"]],
  }),

  vision: () => ({
    label: "Ophthalmology visit",
    steps: [
      step("slot", "Exam room ready", {
        goal: "clinic", requires: ["arrive"], resource: "nurse", presence: "none",
        p50: 8, p90: 20,
        why: "The room is ready. The remaining work is walking.",
      }),
    ],
    edges: [["slot", "depart"]],
  }),

  obstetric: () => ({
    label: "Third-trimester evaluation",
    steps: [
      step("monitor", "Fetal monitoring", {
        goal: "ob", requires: ["triage"], resource: "nurse", presence: "required",
        p50: 25, p90: 50,
      }),
      step("ob-eval", "Obstetric evaluation", {
        goal: "ob", requires: ["monitor"], resource: "attending", presence: "required",
        p50: 20, p90: 45,
      }),
    ],
    edges: [["ob-eval", "dispo-decision"]],
  }),

  head_trauma: () => ({
    label: "Head trauma",
    steps: [
      ...imaging("ct", "Head CT", "neuro", "ct", {
        after: ["triage"], acquireP50: 18, acquireP90: 45, readP50: 25, readP90: 70,
      }),
    ],
    edges: [["ct-read", "dispo-decision"]],
  }),
};

/** Work that is not clinical but still gates leaving. */
export const MODIFIERS = {
  interpreter: () => ({
    steps: [
      step("interpreter", "Interpreter at bedside", {
        goal: "access", requires: ["triage"], resource: "interpreter", presence: "brief",
        p50: 12, p90: 45,
        why: "Mobile and cheap to start. Late is the expensive way to do this.",
      }),
    ],
    edges: [["interpreter", "provider-eval"]],
  }),
  admitted: () => ({
    steps: [
      step("bed-request", "Inpatient bed", {
        goal: "admission", requires: ["dispo-decision"], resource: "bed", presence: "none",
        p50: 55, p90: 180, gatesDischarge: true,
      }),
      step("turnover", "Room turnover", {
        goal: "admission", requires: ["bed-request"], resource: "evs", presence: "none",
        p50: 35, p90: 90, gatesDischarge: true,
      }),
      step("to-ward", "Transport to ward", {
        goal: "admission", requires: ["turnover"], resource: "transport", presence: "required",
        p50: 18, p90: 55, gatesDischarge: true,
      }),
    ],
    edges: [["to-ward", "depart"]],
  }),
  mobility: () => ({
    steps: [
      step("pt-eval", "Physical therapy evaluation", {
        goal: "departure", requires: ["provider-eval"], resource: "physio", presence: "required",
        p50: 40, p90: 150, gatesDischarge: true,
        why: "A classic silent discharge blocker: three hours of lead time, requested at hour six.",
      }),
    ],
    edges: [["pt-eval", "dispo-decision"]],
  }),
};

function clinicSpine() {
  return [
    step("arrive", "Arrival", { goal: "access", presence: "required", fixed: 1 }),
    step("register", "Registration", {
      goal: "access", requires: ["arrive"], resource: "registration", presence: "brief",
      p50: 7, p90: 18,
      why: "Does not need to block the study, and usually does.",
    }),
    step("depart", "Patient leaves", {
      goal: "departure", requires: ["arrive"],
      presence: "required", fixed: 2,
      why: "The patient leaves after the study is acquired. The read happens later, without them.",
    }),
  ];
}

function preopSpine() {
  return [
    step("arrive", "Arrival", { goal: "access", presence: "required", fixed: 1 }),
    step("register", "Registration", {
      goal: "access", requires: ["arrive"], resource: "registration", presence: "brief",
      p50: 8, p90: 20,
    }),
    step("clearance", "Cleared for surgery", {
      goal: "clearance", resource: "attending", presence: "none",
      p50: 10, p90: 25,
      why: "The output of this visit is a clearance, not a discharge.",
    }),
    step("depart", "Patient leaves", {
      goal: "departure", requires: ["clearance"], presence: "required", fixed: 2,
    }),
  ];
}

function spineFor(kind = "emergency") {
  if (kind === "preop") return preopSpine();
  if (kind === "clinic" || kind === "imaging") return clinicSpine();
  return universalSteps();
}

export { step, specimen, imaging, universalSteps, spineFor };
