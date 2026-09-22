/**
 * A digital twin of the next few hours, small enough to run on every refresh.
 *
 * The plan graph schedules each patient as if the hospital were otherwise
 * empty. That is the right model for "what does this visit depend on" and the
 * wrong model for "what happens when sixteen of those visits share one scanner".
 * This file is the correction: it plays the floor forward under two policies and
 * reads off the things a snapshot cannot see.
 *
 * ── Latent bottlenecks ──
 * A queue can be empty now and jammed in forty minutes, because the work that
 * will fill it has not become ready yet. It is still upstream, inside someone
 * else's task. Spotting that before the work arrives is the difference between
 * moving a patient and apologising to one.
 *
 * ── Priority inversion ──
 * Arrival order will start a long, low-stakes job while a short job that gates
 * someone's discharge sits eligible behind it. Naming that pair is more useful
 * than another utilisation percentage, because it is a specific decision.
 *
 * ── The interval as free surface ──
 * A mandatory wait (serial troponin, a culture, a consult en route) does not
 * need the patient. Anything that does need them can run inside it at zero cost
 * to the stay. The twin finds those intervals and the work that fits.
 *
 * Nothing here decides treatment. It orders work the hospital already intends
 * to do, and shows the consequence of the ordering.
 */
import { median } from "./distribution.js";
import { URGENCY_WEIGHT, priorityScore } from "./schedule.js";
import { RESOURCES } from "./steps.js";

const HORIZON = 180;
const SAMPLE_AT = [0, 45, 90];

function capacityOf(resource, override) {
  if (override != null) return override;
  return RESOURCES[resource]?.capacity || 1;
}

/**
 * One runnable unit of work, detached from the plan objects so the simulator
 * can be tested without a database or a compiler.
 */
export function jobsFromPlans(entries) {
  const jobs = [];
  for (const { patient, plan } of entries) {
    for (const step of plan.steps) {
      if (step.state === "done" || step.state === "skipped") continue;
      const minutes = Math.max(1, Math.round(median(step.duration)));
      jobs.push({
        key: `${patient.id}:${step.id}`,
        patientId: patient.id,
        patientName: patient.name,
        urgency: patient.urgency || "medium",
        arrivedAt: String(patient.checked_in_at || ""),
        stepId: step.id,
        label: step.label,
        resource: step.resource || null,
        needsPatient: Boolean(step.needsPatient),
        requires: (step.requires || []).map((d) => `${patient.id}:${d}`),
        minutes: step.state === "running"
          ? Math.max(1, Math.round(step.earliestFinish > 0 ? step.earliestFinish : minutes))
          : minutes,
        slack: step.slack ?? 0,
        critical: Boolean(step.critical),
        clock: Boolean(step.clock),
        probability: step.probability ?? 1,
        running: step.state === "running",
      });
    }
  }
  const present = new Set(jobs.map((j) => j.key));
  for (const job of jobs) job.requires = job.requires.filter((k) => present.has(k));
  return jobs;
}

function cloneJobs(jobs) {
  return jobs.map((j) => ({
    ...j,
    requires: [...j.requires],
    start: null,
    finish: null,
    done: false,
  }));
}

/**
 * Play `jobs` forward.
 *
 * `policy` picks one job from those eligible at the current instant. Resources
 * are multi-server; the patient is a single server. A job with neither still
 * occupies time — that is how a biological interval blocks its successors
 * without blocking the person.
 */
export function simulate(jobs, policy, { capacityOverride = null, horizon = HORIZON } = {}) {
  const pending = new Map(cloneJobs(jobs).map((j) => [j.key, j]));
  const servers = new Map();
  const patientFree = new Map();
  const inversions = [];
  const samples = SAMPLE_AT.filter((t) => t <= horizon).map((t) => ({ t, depth: {} }));

  const slots = (resource) => {
    if (!servers.has(resource)) {
      servers.set(resource, Array(capacityOf(resource, capacityOverride)).fill(0));
    }
    return servers.get(resource);
  };

  const occupy = (resource, until) => {
    const free = slots(resource);
    let best = 0;
    for (let i = 1; i < free.length; i += 1) if (free[i] < free[best]) best = i;
    free[best] = until;
  };

  const earliestServer = (resource) => Math.min(...slots(resource));

  for (const job of pending.values()) {
    if (!job.running) continue;
    job.start = 0;
    job.finish = job.minutes;
    if (job.resource) occupy(job.resource, job.finish);
    if (job.needsPatient) patientFree.set(job.patientId, job.finish);
  }

  const markDone = (now) => {
    for (const job of pending.values()) {
      if (!job.done && job.finish != null && job.finish <= now) job.done = true;
    }
  };

  const depsDone = (job, now) => job.requires.every((k) => {
    const dep = pending.get(k);
    return dep && dep.finish != null && dep.finish <= now;
  });

  const eligible = (now) => [...pending.values()].filter((job) => {
    if (job.start != null) return false;
    if (!depsDone(job, now)) return false;
    if (job.needsPatient && (patientFree.get(job.patientId) || 0) > now) return false;
    if (job.resource && earliestServer(job.resource) > now) return false;
    return true;
  });

  // Work that has arrived at a resource and not finished: running plus waiting.
  // Queue length alone misses a saturated server with an empty waiting room.
  const loadAt = (now) => {
    const load = {};
    for (const job of pending.values()) {
      if (!job.resource) continue;
      const arrived = job.start != null ? job.start <= now : depsDone(job, now);
      const unfinished = job.finish == null || job.finish > now;
      if (arrived && unfinished) load[job.resource] = (load[job.resource] || 0) + 1;
    }
    return load;
  };

  const recordSample = (now) => {
    const slot = samples.find((s) => s.t === now && !s.recorded);
    if (!slot) return;
    slot.load = loadAt(now);
    slot.recorded = true;
  };

  let now = 0;
  markDone(now);
  recordSample(now);

  let guard = 0;
  while (guard < 5000) {
    guard += 1;
    const open = [...pending.values()].filter((j) => !j.done);
    if (!open.length || now > horizon * 4) break;

    const ready = eligible(now);
    if (!ready.length) {
      let next = Infinity;
      for (const free of servers.values()) {
        for (const t of free) if (t > now && t < next) next = t;
      }
      for (const t of patientFree.values()) if (t > now && t < next) next = t;
      for (const job of pending.values()) {
        if (job.finish != null && job.finish > now && job.finish < next) next = job.finish;
      }
      if (!Number.isFinite(next)) break;
      // Land on sample times we would otherwise jump over, so a queue that
      // exists at minute 45 is visible even if the next job event is minute 70.
      const crossed = samples.find((s) => !s.recorded && s.t > now && s.t <= next);
      now = crossed ? crossed.t : next;
      markDone(now);
      recordSample(now);
      continue;
    }

    const chosen = policy(ready);
    const sameResource = ready.filter((j) => j.resource && j.resource === chosen.resource);
    const jumped = sameResource.find((j) =>
      j !== chosen && j.patientId !== chosen.patientId && j.critical && !chosen.critical
    );
    if (jumped) {
      inversions.push({
        resource: chosen.resource,
        holder: chosen.patientName,
        holderTask: chosen.label,
        holderMinutes: chosen.minutes,
        waiting: jumped.patientName,
        waitingTask: jumped.label,
        at: Math.round(now),
      });
    }

    chosen.start = now;
    chosen.finish = now + chosen.minutes;
    if (chosen.resource) occupy(chosen.resource, chosen.finish);
    if (chosen.needsPatient) {
      patientFree.set(chosen.patientId, Math.max(patientFree.get(chosen.patientId) || 0, chosen.finish));
    }
    if (chosen.finish <= now) {
      chosen.done = true;
    }
  }

  const finishes = {};
  for (const job of pending.values()) {
    if (job.finish == null) continue;
    finishes[job.patientId] = Math.max(finishes[job.patientId] || 0, job.finish);
  }

  return {
    jobs: [...pending.values()],
    finishes,
    inversions,
    samples,
    complete: [...pending.values()].every((j) => j.done || j.finish != null),
  };
}

export function fifoPolicy(ready) {
  return [...ready].sort(
    (a, b) => String(a.arrivedAt).localeCompare(String(b.arrivedAt)) || a.minutes - b.minutes
  )[0];
}

export function slackPolicy(ready) {
  return [...ready].sort(
    (a, b) => priorityScore(a) - priorityScore(b) || a.minutes - b.minutes
  )[0];
}

function weightedDelay(finishes, urgencyOf, baseline) {
  let total = 0;
  for (const [id, fin] of Object.entries(finishes)) {
    const delay = Math.max(0, fin - (baseline[id] ?? fin));
    total += delay * (URGENCY_WEIGHT[urgencyOf[id]] ?? 1);
  }
  return Math.round(total);
}

function urgencyMap(jobs) {
  const map = {};
  for (const job of jobs) map[job.patientId] = job.urgency;
  return map;
}

/**
 * A bottleneck that is not visible yet: the queue is inside capacity now, and
 * crosses it once upstream work lands.
 */
function latentBottlenecks(planned) {
  const resources = new Set(planned.jobs.map((j) => j.resource).filter(Boolean));
  const out = [];
  for (const resource of resources) {
    const cap = capacityOf(resource);
    const nowLoad = planned.samples.find((s) => s.t === 0)?.load?.[resource] || 0;
    let peak = nowLoad;
    let peakAt = 0;
    for (const sample of planned.samples) {
      const load = sample.load?.[resource] || 0;
      if (load > peak) {
        peak = load;
        peakAt = sample.t;
      }
    }
    if (nowLoad <= cap && peak > cap) {
      const meta = RESOURCES[resource];
      out.push({
        resource,
        label: meta?.label || resource,
        depthNow: nowLoad,
        peak,
        capacity: cap,
        atMinute: peakAt,
        detail: `${meta?.label || resource} is handling ${nowLoad} now and will have ${peak} in progress or waiting by minute ${peakAt}, against ${cap} ${cap === 1 ? "server" : "servers"}. That work has not reached the queue yet.`,
      });
    }
  }
  return out.sort((a, b) => b.peak - b.capacity - (a.peak - a.capacity));
}

/**
 * Useful actions, not failures. Each one is a specific thing to do because of
 * how the next few hours fit together.
 */
function opportunities(planned) {
  const found = [];
  const byPatient = new Map();
  for (const job of planned.jobs) {
    if (!byPatient.has(job.patientId)) byPatient.set(job.patientId, []);
    byPatient.get(job.patientId).push(job);
  }

  for (const jobs of byPatient.values()) {
    const clocks = jobs.filter((j) => j.clock && j.start != null && j.minutes >= 45);
    for (const clock of clocks) {
      const inside = jobs.filter((j) =>
        j.needsPatient && j.start != null && j.start >= clock.start && j.finish <= clock.finish
      );
      if (!inside.length) continue;
      const speculative = inside.filter((j) => j.probability < 1);
      found.push({
        kind: "interval",
        title: `Use ${jobs[0].patientName}'s ${clock.minutes}m wait`,
        detail: speculative.length
          ? `${speculative.map((j) => j.label).join(", ")} can happen during the ${clock.label.toLowerCase()} if it is actually ordered. It adds nothing to the stay, and it should not be started on speculation alone.`
          : `${inside.map((j) => j.label).join(", ")} fit inside the ${clock.label.toLowerCase()} and add nothing to the stay.`,
      });
    }
  }

  // Group by the task, not the department. Three blood draws are one round.
  // Eleven mixed nursing tasks are not, and calling them one would be a lie.
  const mobile = new Map();
  for (const job of planned.jobs) {
    if (!job.resource || job.start == null || !job.needsPatient) continue;
    if (!RESOURCES[job.resource]?.mobile) continue;
    const key = `${job.resource}:${job.stepId}`;
    if (!mobile.has(key)) mobile.set(key, []);
    mobile.get(key).push(job);
  }
  for (const [key, jobs] of mobile) {
    const resource = key.slice(0, key.indexOf(":"));
    const ordered = [...jobs].sort((a, b) => a.start - b.start);
    let window = [ordered[0]];
    const flush = () => {
      if (window.length >= 3) {
        const names = [...new Set(window.map((j) => j.patientName))];
        found.push({
          kind: "round",
          title: `${window.length} patients can share one ${window[0].label}`,
          detail: `${RESOURCES[resource]?.label || resource} can see ${names.slice(0, 4).join(", ")} within ${Math.round(window.at(-1).start - window[0].start)} minutes of each other, instead of walking to each of them separately.`,
        });
      }
    };
    for (let i = 1; i < ordered.length; i += 1) {
      if (ordered[i].start - window[0].start <= 20) window.push(ordered[i]);
      else {
        flush();
        window = [ordered[i]];
      }
    }
    flush();
  }

  return found.slice(0, 6);
}

/**
 * The question the rest of the product cannot ask: if the floor keeps its
 * current habit, and if it follows the plan, what does each one cost by the
 * time the work is done?
 */
export function project(entries) {
  const jobs = jobsFromPlans(entries);
  if (!jobs.length) {
    return {
      horizon: HORIZON,
      savedMinutes: 0,
      plannedDelay: 0,
      currentDelay: 0,
      latent: [],
      opportunities: [],
      inversions: [],
      checkpoints: [],
    };
  }

  const urgencyOf = urgencyMap(jobs);
  const uncontended = simulate(jobs, slackPolicy, { capacityOverride: 99 });
  const planned = simulate(jobs, slackPolicy);
  const current = simulate(jobs, fifoPolicy);

  const plannedDelay = weightedDelay(planned.finishes, urgencyOf, uncontended.finishes);
  const currentDelay = weightedDelay(current.finishes, urgencyOf, uncontended.finishes);

  const checkpoints = SAMPLE_AT.map((t) => {
    const load = planned.samples.find((s) => s.t === t)?.load || {};
    const queued = Object.values(load).reduce((sum, n) => sum + n, 0);
    return { minute: t, queued };
  });

  return {
    horizon: HORIZON,
    savedMinutes: Math.max(0, currentDelay - plannedDelay),
    plannedDelay,
    currentDelay,
    latent: latentBottlenecks(planned),
    opportunities: opportunities(planned),
    inversions: current.inversions.slice(0, 5),
    checkpoints,
  };
}
