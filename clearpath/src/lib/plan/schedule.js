/**
 * Hospital-wide scheduling, replacing per-department first-come-first-served.
 *
 * Every department currently runs its own queue in arrival order, and each one
 * is locally reasonable. The result is globally poor for a well-understood
 * reason: FIFO is blind to what is waiting *behind* each request. A two-minute
 * read that eight hours of discharge depends on sits behind a routine study that
 * nobody is waiting on, because the routine study arrived first.
 *
 * The fix is not "work faster" or "add a priority flag". It is to order each
 * queue by slack — how long this piece of work can wait before it starts pushing
 * a patient's discharge — which is a number the plan graph already computes.
 * Least-slack-first is the classic scheduling answer and it happens to be the
 * clinically defensible one too: do the thing closest to breaking its promise.
 *
 * Fairness is handled explicitly rather than accidentally. FIFO looks fair and
 * is not; it simply distributes harm in arrival order. Here, clinical acuity buys
 * an explicit, named, tunable amount of queue credit, so the tradeoff is written
 * down where a hospital can argue with it.
 */
import { median } from "./distribution.js";
import { RESOURCES } from "./steps.js";

/**
 * Minutes of queue credit clinical acuity buys.
 *
 * A high-urgency patient with an hour of slack is treated as equivalent to a
 * low-urgency patient with none. That is a real, contestable policy statement,
 * which is why it is a named constant and not an inline number.
 */
export const URGENCY_CREDIT = { high: 60, medium: 20, low: 0 };

/** How much a minute of delay to this patient counts in the objective. */
export const URGENCY_WEIGHT = { high: 3, medium: 1.5, low: 1 };

/**
 * Work that could start right now: pending, with every dependency finished.
 * Also carries the slack and criticality the plan computed, which is the
 * information the receiving department has never had.
 */
export function readySteps(entries) {
  const items = [];
  for (const { patient, plan: p } of entries) {
    const byId = new Map(p.steps.map((s) => [s.id, s]));
    for (const step of p.steps) {
      if (step.state !== "pending" || !step.resource) continue;
      const deps = (step.requires || []).filter((d) => byId.has(d));
      if (!deps.every((d) => byId.get(d).state === "done")) continue;
      items.push({
        stepId: step.id,
        label: step.label,
        resource: step.resource,
        patientId: patient.id,
        patientName: patient.name,
        urgency: patient.urgency || "medium",
        department: patient.department,
        minutes: Math.round(median(step.duration)),
        slack: step.slack,
        critical: step.critical,
        needsPatient: step.needsPatient,
        arrivedAt: patient.checked_in_at,
        why: step.why,
      });
    }
  }
  return items;
}

/** Lower sorts first. Slack, discounted by what acuity buys. */
export function priorityScore(item) {
  return item.slack - (URGENCY_CREDIT[item.urgency] ?? 0);
}

/**
 * Simulate a queue on `capacity` parallel servers and return each item's
 * completion time in minutes from now.
 */
function completionTimes(order, capacity) {
  const free = new Array(Math.max(1, capacity)).fill(0);
  return order.map((item) => {
    let earliest = 0;
    for (let i = 1; i < free.length; i += 1) if (free[i] < free[earliest]) earliest = i;
    const done = free[earliest] + item.minutes;
    free[earliest] = done;
    return done;
  });
}

/**
 * Total weighted patient delay for an ordering — the thing worth minimising.
 *
 * Delay only counts once it eats through that step's slack, because finishing an
 * item with ninety minutes of float in forty minutes delays nobody. This is why
 * the objective rewards reordering rather than just "going faster": the same
 * total work, differently ordered, produces different patient delay.
 */
export function queueCost(order, capacity) {
  const finish = completionTimes(order, capacity);
  return Math.round(
    order.reduce((total, item, i) => {
      const overrun = Math.max(0, finish[i] - Math.max(0, item.slack));
      return total + overrun * (URGENCY_WEIGHT[item.urgency] ?? 1);
    }, 0)
  );
}

function fifoOrder(items) {
  return [...items].sort((a, b) => String(a.arrivedAt).localeCompare(String(b.arrivedAt)));
}

function plannedOrder(items) {
  return [...items].sort(
    (a, b) => priorityScore(a) - priorityScore(b) || a.minutes - b.minutes
  );
}

function reasonFor(item, position) {
  if (item.critical) {
    return `On ${item.patientName}'s critical path — every minute here is a minute of their stay.`;
  }
  if (item.slack <= 15) return `Only ${item.slack} min of float left before it starts pushing discharge.`;
  if ((URGENCY_CREDIT[item.urgency] ?? 0) > 0 && position < 3) {
    return `${item.urgency} acuity, ${item.slack} min float — moved up on clinical priority.`;
  }
  return `${item.slack} min of float. Safe to run after the items above.`;
}

/**
 * Per-resource worklists, each with the counterfactual attached.
 *
 * The `saved` figure is the point of the whole exercise: it is the same work, the
 * same staff and the same shift, reordered — so it is the one number that says
 * whether the planner is earning its keep.
 */
export function worklists(entries) {
  const items = readySteps(entries);
  const byResource = new Map();
  for (const item of items) {
    if (!byResource.has(item.resource)) byResource.set(item.resource, []);
    byResource.get(item.resource).push(item);
  }

  const lists = [];
  for (const [resource, group] of byResource) {
    const meta = RESOURCES[resource] || { label: resource, capacity: 2 };
    const planned = plannedOrder(group);
    const fifo = fifoOrder(group);
    const plannedCost = queueCost(planned, meta.capacity);
    const fifoCost = queueCost(fifo, meta.capacity);

    // Where an item would have sat under arrival order, so the change is
    // auditable rather than an opaque reshuffle.
    const fifoIndex = new Map(fifo.map((it, i) => [it.stepId + it.patientId, i]));

    lists.push({
      resource,
      label: meta.label,
      capacity: meta.capacity,
      mobile: meta.mobile,
      totalMinutes: group.reduce((t, i) => t + i.minutes, 0),
      criticalCount: group.filter((i) => i.critical).length,
      items: planned.map((item, i) => ({
        ...item,
        position: i + 1,
        wasPosition: (fifoIndex.get(item.stepId + item.patientId) ?? i) + 1,
        reason: reasonFor(item, i),
      })),
      cost: plannedCost,
      fifoCost,
      saved: Math.max(0, fifoCost - plannedCost),
    });
  }

  return lists.sort((a, b) => b.saved - a.saved || b.criticalCount - a.criticalCount);
}

/**
 * The governing constraint, in the Theory of Constraints sense.
 *
 * At any moment one resource sets the throughput of the whole system, and every
 * other local optimisation is noise. Hospitals improve everywhere at once, which
 * is arithmetically the same as improving nowhere. Naming the constraint is what
 * makes the interesting instruction possible: subordinate everything else to it,
 * and above all never let it idle.
 *
 * A resource only qualifies if somebody's critical path runs through it. A fully
 * saturated queue that no patient is waiting on is not a constraint, it is just
 * busy — and that distinction is exactly what utilisation dashboards miss.
 */
/**
 * Utilisation at which a queue genuinely governs throughput.
 *
 * Below this, the busiest resource is not the constraint — and saying otherwise
 * is the most expensive mistake this function could make, because it sends a
 * hospital hiring into a department that has spare capacity. When nothing is
 * saturated the floor is bound by its dependency structure instead: clock
 * intervals, serial chains and work nobody has started. Those need reordering
 * and earlier starts, not more staff. The two diagnoses have opposite remedies,
 * so they must not share a label.
 */
export const SATURATION = 0.8;

export function governingConstraint(lists, horizonMinutes = 120) {
  const scored = lists
    .filter((l) => l.criticalCount > 0)
    .map((l) => ({
      resource: l.resource,
      label: l.label,
      demandMinutes: l.totalMinutes,
      capacityMinutes: l.capacity * horizonMinutes,
      utilisation: l.totalMinutes / (l.capacity * horizonMinutes),
      criticalCount: l.criticalCount,
      mobile: l.mobile,
    }))
    .sort((a, b) => b.utilisation - a.utilisation || b.criticalCount - a.criticalCount);

  const top = scored[0];
  if (!top) return null;

  const list = lists.find((l) => l.resource === top.resource);
  const offPath = list?.items.filter((i) => !i.critical) || [];
  const common = {
    ...top,
    utilisationPct: Math.round(top.utilisation * 100),
    overCapacity: top.demandMinutes > top.capacityMinutes,
    alternatives: scored.slice(1, 3),
  };

  if (top.utilisation < SATURATION) {
    const waiting = scored.reduce((t, r) => t + r.criticalCount, 0);
    return {
      ...common,
      kind: "structural",
      headline: "No resource is the bottleneck — the dependency structure is",
      detail: `The busiest queue, ${top.label}, is only at ${Math.round(top.utilisation * 100)}% of capacity. ${waiting} critical task${waiting === 1 ? " sits" : "s sit"} in queues that are not full, so people are waiting on sequence and on work nobody has started, not on capacity.`,
      subordinate: "Adding staff will not speed this floor up. The wins are reordering the queues below and starting the off-path work that is already startable.",
    };
  }

  return {
    ...common,
    kind: "resource",
    headline: `${top.label} is setting the pace for the whole floor`,
    detail: `${Math.round(top.demandMinutes)} min of queued work against ${top.capacityMinutes} min of capacity in the next ${Math.round(horizonMinutes / 60)}h, and ${top.criticalCount} critical task${top.criticalCount === 1 ? "" : "s"} sit in this queue.`,
    subordinate: offPath.length
      ? `Move the ${offPath.length} item${offPath.length === 1 ? "" : "s"} with float off ${top.label} or run them later. Protecting this queue is worth more than any other improvement on the floor right now.`
      : `Every item queued here is on someone's critical path. Adding capacity here is the only thing that speeds the floor up; nothing else will.`,
  };
}
