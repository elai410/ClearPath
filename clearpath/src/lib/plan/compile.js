/**
 * Turn a real patient row into an execution plan.
 *
 * This is the bridge between the shipped data model (a status enum plus a flat
 * list of blockers) and the graph. It has to be forgiving: the existing rows
 * carry less information than the planner wants, so everything here degrades to
 * a coarser-but-still-useful plan rather than refusing to produce one.
 *
 * The direction of translation matters. We are not deriving a plan *from* the
 * blockers — the plan comes from the presentation, which is what a clinician
 * would predict on hearing the story. Blockers only tell us which parts of that
 * predicted plan have already been started or finished. That inversion is the
 * whole point: it lets the system know about work nobody has ordered yet.
 */
import { conceptsIn } from "../triage-terms.js";
import { waitMinutes, STAGE_ORDER, currentStage } from "../journey.js";
import { BUNDLES, MODIFIERS, spineFor } from "./steps.js";

/** Which step a legacy blocker type is evidence about. */
const BLOCKER_TO_STEPS = {
  lab:           ["trop1-run", "bloods-run", "cultures-run", "trop2-run"],
  imaging:       ["ct-acquire", "cxr-acquire", "xr-acquire", "study-acquire"],
  consult:       ["cards-consult", "psych-consult", "surg-consult", "ob-eval"],
  pharmacy:      ["prescriptions", "rig", "abx"],
  bed:           ["bed-request"],
  signature:     ["signoff", "clearance"],
  documentation: ["instructions", "consent"],
  transport:     ["to-ward", "to-scanner"],
  interpreter:   ["interpreter"],
  registration:  ["register"],
  room_turnover: ["turnover"],
};

const STAGE_COMPLETIONS = [
  { from: "intake",         done: ["arrive"] },
  { from: "waiting",        done: ["arrive", "triage"] },
  { from: "evaluation",     done: ["arrive", "triage", "register"] },
  { from: "testing",        done: ["arrive", "triage", "register", "provider-eval"] },
  { from: "discharge_prep", done: ["arrive", "triage", "register", "provider-eval", "dispo-decision"] },
];

function applyEdges(steps, edges) {
  const byId = new Map(steps.map((s) => [s.id, s]));
  for (const [from, to] of edges) {
    const target = byId.get(to);
    if (!target || !byId.has(from)) continue;
    if (!target.requires.includes(from)) target.requires = [...target.requires, from];
  }
}

const KINDS = new Set(["emergency", "preop", "clinic", "imaging", "obstetric", "behavioral"]);

/**
 * What kind of stay this is. The graph is different because the output is
 * different: a discharge, a surgical clearance, a completed study, a placement.
 */
export function visitKind(patient = {}) {
  const explicit = String(patient.visit_kind || "").toLowerCase();
  if (KINDS.has(explicit)) return explicit;

  const text = `${patient.situation || ""} ${patient.summary || ""} ${patient.reason || ""}`;
  const concepts = conceptsIn(text);
  const t = text.toLowerCase();
  const dept = patient.department;

  if (/pre-?admission|pre-?op|pre-surgical|surgery next/.test(t)) return "preop";
  if (concepts.has("pregnancy")) return "obstetric";
  if (dept === "winchester" || concepts.has("behavioral")) return "behavioral";
  if (dept === "fitkin" || (dept === "dana" && concepts.has("vision")) || concepts.has("vision") || concepts.has("pulmonary")) {
    return "clinic";
  }
  if (dept === "clinicbldg" || dept === "north") return "imaging";
  if (dept === "emergency" || dept === "rabies" || dept === "pediatric" || dept === "ypb") return "emergency";
  return "emergency";
}

/**
 * Which clinical bundles this presentation calls for.
 * Reuses the multilingual concept extraction already used for triage routing, so
 * a plan is built the same way regardless of the language the patient used.
 */
export function bundlesFor(patient) {
  const kind = visitKind(patient);
  const text = `${patient.situation || ""} ${patient.summary || ""} ${patient.reason || ""}`;
  const concepts = conceptsIn(text);

  if (kind === "preop") return ["preop"];
  if (kind === "imaging") {
    if (concepts.has("oncology") || /mammo/i.test(text)) return ["mammo"];
    return ["scheduled_mri"];
  }
  if (kind === "clinic") {
    if (concepts.has("vision")) return ["vision"];
    return ["pulmonary"];
  }
  if (kind === "obstetric") return ["obstetric"];
  if (kind === "behavioral") return ["behavioral"];

  const chosen = [];
  for (const name of Object.keys(BUNDLES)) {
    if (concepts.has(name)) chosen.push(name);
  }
  if (!chosen.length) {
    if (patient.status === "pending_signature") return [];
    if (concepts.has("stroke") || concepts.has("seizure")) chosen.push("breathing");
    else if (/\b(head|concussion|accident|trauma|dizzy|car crash)\b/i.test(text)) chosen.push("head_trauma");
  }
  return chosen.slice(0, 2);
}

function modifiersFor(patient, blockers, kind) {
  const mods = [];
  if ((patient.language || "en") !== "en" && patient.language !== "English") mods.push("interpreter");
  const admitLike = kind === "emergency" || kind === "obstetric" || kind === "behavioral";
  if (admitLike && (patient.status === "pending_bed" || blockers.some((b) => b.type === "bed"))) {
    mods.push("admitted");
  }
  const text = `${patient.situation || ""} ${patient.summary || ""}`.toLowerCase();
  if (kind === "emergency" && /\b(fell|fall|walker|cane|unsteady|elderly|hip|weak)\b/.test(text)) {
    mods.push("mobility");
  }
  return mods;
}

/**
 * Build the plan. Returns steps with `state` and `elapsed` filled in from what
 * has actually happened, ready to hand to `plan()`.
 */
export function compilePlan(patient, blockers = []) {
  const kind = visitKind(patient);
  const bundleNames = bundlesFor(patient);
  const modNames = modifiersFor(patient, blockers, kind);

  const steps = [...spineFor(kind)];
  const edges = [];
  const labels = [];

  for (const name of bundleNames) {
    const bundle = BUNDLES[name]();
    labels.push(bundle.label);
    steps.push(...bundle.steps.filter((s) => !steps.some((e) => e.id === s.id)));
    edges.push(...(bundle.edges || []));
  }
  for (const name of modNames) {
    const mod = MODIFIERS[name]();
    steps.push(...mod.steps.filter((s) => !steps.some((e) => e.id === s.id)));
    edges.push(...(mod.edges || []));
  }
  applyEdges(steps, edges);

  const byId = new Map(steps.map((s) => [s.id, s]));
  if (byId.has("interpreter") && !byId.has("triage")) {
    byId.get("interpreter").requires = ["arrive"];
  }
  if (byId.has("interpreter") && !byId.has("provider-eval") && byId.has("register")) {
    applyEdges(steps, [["interpreter", "register"]]);
  }
  const markDone = (id, agoMinutes) => {
    const s = byId.get(id);
    if (!s || s.state === "done") return;
    s.state = "done";
    s.agoMinutes = agoMinutes;
  };
  const markRunning = (id, elapsed) => {
    const s = byId.get(id);
    if (!s || s.state === "done") return;
    s.state = "running";
    s.elapsed = elapsed;
  };

  // Stage is the coarse signal: everything structurally before the current stage
  // must have happened, whether or not anyone recorded it.
  const stage = currentStage(patient);
  const stageIdx = STAGE_ORDER.indexOf(stage);
  const arrivedAgo = waitMinutes(patient.checked_in_at);
  for (const rule of STAGE_COMPLETIONS) {
    if (stageIdx >= STAGE_ORDER.indexOf(rule.from)) {
      for (const id of rule.done) markDone(id, arrivedAgo);
    }
  }

  // Blockers are the precise signal, and they override the stage inference.
  for (const blocker of blockers) {
    const candidates = BLOCKER_TO_STEPS[blocker.type] || [];
    const target = candidates.find((id) => byId.has(id));
    if (!target) continue;
    const elapsed = waitMinutes(blocker.created_at);
    if (blocker.status === "resolved") {
      markDone(target, waitMinutes(blocker.resolved_at || blocker.updated_at));
    } else {
      markRunning(target, elapsed);
      const walk = (id) => {
        const node = byId.get(id);
        if (!node) return;
        for (const dep of node.requires || []) {
          markDone(dep, elapsed);
          walk(dep);
        }
      };
      walk(target);
    }
  }

  if (patient.status === "discharged") {
    for (const s of steps) if (s.state !== "done") markDone(s.id, 0);
  }

  return {
    steps,
    presentation: labels.join(" + ") || "General assessment",
    bundles: bundleNames,
    modifiers: modNames,
    visitKind: kind,
  };
}
