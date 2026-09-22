/**
 * The hospital as one decision, not a pile of departments.
 *
 * The twin already starts eligible work at t=0, so "mark this step running"
 * does not move the simulation. The useful question is different: what critical
 * path work has nobody started, and is FIFO still the policy. Those are the
 * moves a person can actually make.
 */
import { compilePlan, visitKind } from "./compile.js";
import { median } from "./distribution.js";
import { plan as solve } from "./graph.js";
import { project } from "./simulate.js";
import { gate } from "../evidence.js";

const HORIZON = 90;
const PREPARE = () => gate({
  kind: "recommendation",
  reversible: true,
  clinical: false,
  status: "verified",
});

function entriesFor(patients, blockersByPatient) {
  return patients
    .filter((p) => p.status !== "discharged")
    .map((patient) => ({
      patient,
      plan: solve(compilePlan(patient, blockersByPatient[patient.id] || []).steps),
    }));
}

function startStep(entries, patientId, stepId) {
  return entries.map((entry) => {
    if (entry.patient.id !== patientId) return entry;
    return {
      ...entry,
      plan: {
        ...entry.plan,
        steps: entry.plan.steps.map((s) =>
          s.id === stepId && s.state === "pending" ? { ...s, state: "running", elapsed: 0 } : s
        ),
      },
    };
  });
}

/**
 * Candidate operational moves. Each one is reversible and none of them is a
 * diagnosis, an order, or a discharge.
 */
export function generateInterventions(entries) {
  const found = [];
  const seen = new Set();

  for (const { patient, plan } of entries) {
    for (const step of plan.steps) {
      if (step.state !== "pending" || step.needsPatient) continue;
      if (step.clock) continue;
      if ((step.probability ?? 1) < 1) continue;
      if (step.earliestStart > 0) continue;
      const kind = visitKind(patient);
      if (kind !== "emergency" && (step.goal === "departure" || step.id === "ride-home" || step.id === "prescriptions")) continue;
      if (kind === "preop" && step.id === "ride-home") continue;
      const key = `start:${patient.id}:${step.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({
        id: key,
        type: "START_EARLY",
        title: `Start ${step.label.toLowerCase()} for ${patient.name}`,
        reason: `${step.label} needs nobody at the bedside and is already eligible. Starting it now is prefetch, not a clinical decision.`,
        patientId: patient.id,
        patientName: patient.name,
        stepId: step.id,
        resource: step.resource,
        apply: (current) => startStep(current, patient.id, step.id),
        reversible: true,
        clinical: false,
      });
    }
  }

  return found.slice(0, 8);
}

/**
 * Search the operational space. Baseline is the hospital as it actually runs
 * (FIFO, work unstarted). The recommendation is the reversible move a person
 * can make without placing an order.
 */
export function controlLoop(patients, blockersByPatient = {}, { holds = [] } = {}) {
  const baselineEntries = entriesFor(patients, blockersByPatient);
  const baseline = project(baselineEntries);
  const authority = PREPARE();
  const candidates = [];
  const heldIds = new Set(holds.map((h) => h.patientId));

  for (const hold of holds) {
    candidates.push({
      id: `hold:${hold.patientId}`,
      type: "HOLD",
      title: hold.title,
      reason: hold.reason,
      patientId: hold.patientId,
      patientName: hold.patientName,
      predictedDelay: baseline.plannedDelay,
      baselineDelay: baseline.currentDelay,
      minutesSaved: 0,
      queueAt45: baseline.checkpoints?.find((c) => c.minute === 45)?.queued ?? null,
      authority,
      selected: false,
    });
  }

  if ((baseline.savedMinutes || 0) >= 15) {
    candidates.push({
      id: "reorder",
      type: "REORDER",
      title: "Stop running queues in arrival order",
      reason: `Same staff, same work. Least-slack-first recovers ${baseline.savedMinutes} minutes of weighted delay. That is not a staffing request.`,
      patientId: null,
      patientName: null,
      predictedDelay: baseline.plannedDelay,
      baselineDelay: baseline.currentDelay,
      minutesSaved: baseline.savedMinutes,
      queueAt45: baseline.checkpoints?.find((c) => c.minute === 45)?.queued ?? null,
      authority,
      selected: false,
    });
  }

  for (const { patient, plan } of baselineEntries) {
    const kind = visitKind(patient);
    const held = heldIds.has(patient.id);
    for (const step of plan.steps) {
      if (step.state !== "pending" || step.needsPatient || !step.critical) continue;
      if (step.clock) continue;
      if (step.earliestStart > 0) continue;
      if ((step.probability ?? 1) < 1) continue;
      if (kind !== "emergency" && (step.goal === "departure" || step.id === "ride-home")) continue;
      if (held && (step.goal === "departure" || step.id === "ride-home" || step.id === "prescriptions" || step.id === "signoff" || step.id === "depart")) continue;
      const minutes = Math.max(1, Math.round(median(step.duration)));
      candidates.push({
        id: `start:${patient.id}:${step.id}`,
        type: "START_CRITICAL",
        title: `Start ${step.label.toLowerCase()} for ${patient.name}`,
        reason: step.why || `${step.label} is on the critical path and needs nobody at the bedside. The visit is waiting on work nobody has started.`,
        patientId: patient.id,
        patientName: patient.name,
        predictedDelay: baseline.plannedDelay,
        baselineDelay: baseline.currentDelay,
        minutesSaved: minutes,
        queueAt45: baseline.checkpoints?.find((c) => c.minute === 45)?.queued ?? null,
        authority,
        selected: false,
      });
    }
  }

  candidates.sort((a, b) => {
    if (a.type === "HOLD" && b.type !== "HOLD") return -1;
    if (b.type === "HOLD" && a.type !== "HOLD") return 1;
    return b.minutesSaved - a.minutesSaved;
  });
  const best = candidates.find((c) => c.type === "HOLD" && c.authority.prepare)
    || candidates.find((c) => c.minutesSaved >= 8 && c.authority.prepare)
    || null;
  if (best) best.selected = true;

  return {
    horizon: HORIZON,
    baseline: {
      delay: baseline.plannedDelay,
      queueNow: baseline.checkpoints?.[0]?.queued || 0,
      queueAt45: baseline.checkpoints?.[1]?.queued || 0,
    },
    recommended: best,
    alternatives: candidates.filter((c) => c !== best).slice(0, 3),
    needsHuman: [],
    considered: candidates.length,
    authority: {
      level: 2,
      name: "prepare",
      execute: false,
      reason: "ClearPath may stage reversible operational work. It may not place an order, discharge a patient, or change treatment.",
    },
  };
}
