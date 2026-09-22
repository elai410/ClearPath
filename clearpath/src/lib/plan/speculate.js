/**
 * Speculative execution for hospital work.
 *
 * Every other high-performance system hides latency by starting work before it
 * is certain that work is needed. Processors do it, build systems do it, query
 * planners do it. Hospitals are the one place that waits for certainty before
 * beginning anything, which is why a patient can sit for forty minutes between
 * "the CT looks surgical" and "surgery has been paged" — the forty minutes were
 * spent acquiring information that was already 70% predictable.
 *
 * The objection to speculating is real: sometimes the work is wasted. So the
 * decision is made as an expected-value calculation rather than a slogan. Start
 * early when the expected minutes saved beat the expected wasted effort, and
 * price wasted effort by how scarce the resource is — a speculative cardiology
 * page costs more than a speculative paperwork start.
 *
 * Nothing here speculates on anything clinical. It pre-positions *capacity*:
 * paging a consultant, warming a bed request, starting prior-auth. The decision
 * to actually treat stays with a human, every time.
 */
import { median } from "./distribution.js";
import { plan } from "./graph.js";
import { RESOURCES } from "./steps.js";

/**
 * What wasted speculation actually costs, in patient-minutes.
 *
 * Both sides of this decision have to be in the same currency or the comparison
 * is meaningless, so waste is priced the same way the benefit is: in minutes of
 * patient delay. Occupying a resource for `m` minutes pushes everything queued
 * behind it by roughly `m / capacity`, and that push only hurts the patients
 * whose critical path runs through the queue.
 *
 * The consequence is that speculation is *contextual*, which is the correct
 * behaviour and not obvious: pre-paging an idle cardiologist is nearly free and
 * usually worth it, while the identical page against a saturated cardiology
 * queue is expensive and usually is not. A fixed scarcity multiplier cannot
 * express that difference; current practice, which has no model at all, cannot
 * either.
 */
export function wasteCost(step, load = {}) {
  const capacity = RESOURCES[step.resource]?.capacity || 4;
  const contention = load[step.resource]?.criticalDepth ?? 0;
  return (median(step.duration) / capacity) * Math.max(1, contention);
}

/**
 * The earliest anchor a speculative step could hang off instead of waiting for
 * its confirming information. Anything already finished is a valid anchor,
 * because starting "now" is exactly what speculating means.
 */
function earliestAnchor(steps) {
  const done = steps.filter((s) => s.state === "done").map((s) => s.id);
  return done.length ? [done[0]] : [];
}

/**
 * How many median minutes the plan would finish earlier if this step started now
 * rather than waiting to be confirmed.
 *
 * Measured by actually re-planning, not estimated. A speculative step that sits
 * off the critical path returns zero here, which is the correct and useful
 * answer: pre-paging that consultant would buy the patient nothing, so don't.
 */
export function savingFromSpeculating(steps, stepId) {
  const baseline = plan(steps);
  const baselineFinish = median(baseline.finish);

  const relaxed = steps.map((s) =>
    s.id === stepId ? { ...s, requires: earliestAnchor(steps) } : s
  );
  const speculative = plan(relaxed);
  return Math.max(0, Math.round(baselineFinish - median(speculative.finish)));
}

/**
 * How averse to wasted work we are. Above 1 means we demand the expected saving
 * to beat the expected waste by a margin before acting. Exposed rather than
 * buried because it is a policy choice a hospital should get to set, not a
 * constant an engineer picked.
 */
export const DEFAULT_AVERSION = 1.2;

export function speculationDecisions(steps, { aversion = DEFAULT_AVERSION, load = {} } = {}) {
  const candidates = steps.filter(
    (s) => s.probability < 1 && s.state === "pending"
  );

  return candidates
    .map((step) => {
      const saving = savingFromSpeculating(steps, step.id);
      const expectedSaving = step.probability * saving;
      const expectedWaste = (1 - step.probability) * wasteCost(step, load);
      const recommend = expectedSaving > expectedWaste * aversion && saving > 0;

      return {
        id: step.id,
        label: step.label,
        resource: step.resource,
        probability: step.probability,
        savingIfNeeded: saving,
        expectedSaving: Math.round(expectedSaving),
        expectedWaste: Math.round(expectedWaste),
        recommend,
        rationale: recommend
          ? `${Math.round(step.probability * 100)}% likely, and starting now takes ${saving} min off the critical path. Expected gain ${Math.round(expectedSaving)} min against ${Math.round(expectedWaste)} min of possibly-wasted ${RESOURCES[step.resource]?.label || step.resource} time.`
          : saving === 0
            ? `Off the critical path — starting early would save nothing, so don't spend the ${RESOURCES[step.resource]?.label || step.resource} time.`
            : `Only ${Math.round(step.probability * 100)}% likely and the expected ${Math.round(expectedSaving)} min saved does not clear ${Math.round(expectedWaste)} min of expected waste.`,
      };
    })
    .sort((a, b) => b.expectedSaving - a.expectedSaving);
}
