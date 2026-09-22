/**
 * The planner's public surface.
 *
 * One idea, stated once: a visit is a dependency graph with slack in it, and
 * almost everything useful — what to expedite, what to start early, what is
 * actually holding the floor up, what to promise the patient — falls out of
 * knowing where that slack is.
 */
import { forecast, median } from "./distribution.js";
import { plan as solve } from "./graph.js";
import { compilePlan } from "./compile.js";
import { speculationDecisions } from "./speculate.js";
import { governingConstraint, worklists } from "./schedule.js";
import { project } from "./simulate.js";

export * from "./distribution.js";
export * from "./graph.js";
export * from "./steps.js";
export * from "./compile.js";
export * from "./speculate.js";
export * from "./schedule.js";
export * from "./simulate.js";
export { controlLoop } from "./control.js";

/**
 * The full picture for one patient.
 *
 * `blockedBy` answers the question every patient asks and no hospital system can
 * currently answer: not "what stage am I in" but "what single thing is my going
 * home actually waiting on right now".
 */
export function patientPlan(patient, blockers = [], { load = {} } = {}) {
  const compiled = compilePlan(patient, blockers);
  const solved = solve(compiled.steps);
  // Speculation is priced against live contention, so the same pre-page is
  // advised on a quiet floor and declined on a saturated one.
  const speculation = speculationDecisions(compiled.steps, { load });

  const open = solved.steps.filter((s) => s.state !== "done");
  const running = open.filter((s) => s.state === "running");
  const clockBound = solved.criticalPath.filter((s) => s.clock);

  // The free lunch: work the hospital owes this patient that needs nothing from
  // the patient, has float, and nobody has started.
  const startableNow = open.filter(
    (s) => s.state === "pending" && !s.needsPatient && s.earliestStart <= 1
  );

  const blockedBy = solved.criticalPath.find((s) => s.state !== "done") || null;

  return {
    presentation: compiled.presentation,
    visitKind: compiled.visitKind,
    bundles: compiled.bundles,
    modifiers: compiled.modifiers,
    steps: solved.steps,
    criticalPath: solved.criticalPath.map((s) => ({
      id: s.id, label: s.label, minutes: Math.round(median(s.duration)),
      state: s.state, clock: s.clock, resource: s.resource,
    })),
    blockedBy: blockedBy && {
      id: blockedBy.id,
      label: blockedBy.label,
      resource: blockedBy.resource,
      clock: blockedBy.clock,
      why: blockedBy.why,
    },
    forecast: forecast(solved.finish),
    // Split the remaining time into the part that genuinely needs the patient
    // and the part that is the hospital's own coordination. The second number is
    // usually the larger one, and it is the one nobody measures.
    presenceMinutes: solved.presenceMinutes,
    offPathMinutes: solved.offPathMinutes,
    /*
      A clock-bound critical path is the most counter-intuitive and most useful
      thing the planner can say. It means the visit is gated by biology, every
      resource on the floor is irrelevant to this patient's discharge time, and
      expediting anything for them is pure waste. The correct move is the
      opposite of urgency: use the interval to clear every other dependency so
      the moment the clock expires nothing else is outstanding.
    */
    clockBound: clockBound.length > 0 && {
      label: clockBound[0].label,
      minutes: Math.round(median(clockBound[0].duration)),
      guidance: "This is a required waiting period, not a line. Other tests won't make it go faster.",
    },
    runningCount: running.length,
    startableNow: startableNow.map((s) => ({
      id: s.id, label: s.label, resource: s.resource, slack: s.slack, why: s.why,
    })),
    speculation,
  };
}

/**
 * The picture across every patient: reordered worklists and the one resource
 * that is actually governing throughput.
 */
export function floorPlan(patients, blockersByPatient = {}) {
  const entries = patients
    .filter((p) => p.status !== "discharged")
    .map((patient) => ({
      patient,
      plan: solve(compilePlan(patient, blockersByPatient[patient.id] || []).steps),
    }));

  const lists = worklists(entries);
  const constraint = governingConstraint(lists);

  /*
    The floor-level version of the reframe, and the number this whole system
    exists to expose: how much of the time patients are about to spend here
    genuinely requires them to be here.

    `coordinationMinutes` is the remainder — waiting on sequence, on handoffs, on
    work that is startable and unstarted. It is consistently the larger share,
    it is invisible to every current dashboard because nothing decomposes a visit
    into presence and non-presence work, and unlike clinical time it is
    addressable purely by scheduling.
  */
  const totalRemaining = entries.reduce((t, e) => t + median(e.plan.finish), 0);
  const presence = entries.reduce((t, e) => t + e.plan.presenceMinutes, 0);

  return {
    generatedAt: new Date().toISOString(),
    worklists: lists,
    constraint,
    load: resourceLoad(lists),
    // Same staff, same work, same shift — purely the ordering.
    minutesSaved: lists.reduce((t, l) => t + l.saved, 0),
    patients: entries.length,
    remainingMinutes: Math.round(totalRemaining),
    presenceMinutes: Math.round(presence),
    coordinationMinutes: Math.round(Math.max(0, totalRemaining - presence)),
    clockBoundPatients: entries.filter((e) => e.plan.criticalPath.some((s) => s.clock)).length,
    // The same census, played forward. This is what the queues become, not what they are.
    trajectory: project(entries),
  };
}

/** How contended each resource is, for pricing speculation against reality. */
export function resourceLoad(lists) {
  const load = {};
  for (const list of lists) {
    load[list.resource] = {
      criticalDepth: list.criticalCount,
      queuedMinutes: list.totalMinutes,
    };
  }
  return load;
}
