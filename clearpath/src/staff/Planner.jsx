import { useCallback, useEffect, useState } from "react";
import { fetchFloorPlan, fetchPatientPlan, stageControlMove } from "../api/backend.js";
import { Badge, Button, Card, Empty, Modal } from "../components/ui.jsx";

function hours(mins) {
  if (mins < 90) return `${mins}m`;
  return `${(mins / 60).toFixed(1)}h`;
}

/**
 * The reframe, stated as plainly as possible: of the time these patients are
 * about to spend in the building, this much needs them to be in the building.
 */
export function PresenceSplit({ floor }) {
  const total = Math.max(1, floor.remainingMinutes);
  const pct = Math.round((floor.presenceMinutes / total) * 100);
  return (
    <Card>
      <p className="kicker">Where the time actually goes</p>
      <h2 style={{ margin: "0 0 4px", fontSize: 22 }}>
        {hours(floor.coordinationMinutes)} of the next {hours(floor.remainingMinutes)} is coordination, not care
      </h2>
      <p className="small muted" style={{ margin: "0 0 14px" }}>
        Across {floor.patients} patients. Only {pct}% of the remaining time needs a patient physically present —
        the rest is waiting on sequence, handoffs, and work that is startable and unstarted.
      </p>
      <div className="split-bar" role="img"
        aria-label={`${pct}% presence, ${100 - pct}% coordination`}>
        <i className="presence" style={{ width: `${pct}%` }} />
        <i className="coordination" style={{ width: `${100 - pct}%` }} />
      </div>
      <div className="row" style={{ marginTop: 10, gap: 18 }}>
        <span className="small"><i className="swatch presence" /> Needs the patient · {hours(floor.presenceMinutes)}</span>
        <span className="small"><i className="swatch coordination" /> Coordination · {hours(floor.coordinationMinutes)}</span>
      </div>
    </Card>
  );
}

export function ConstraintCard({ constraint }) {
  if (!constraint) {
    return (
      <Card>
        <p className="kicker">Constraint</p>
        <h2 style={{ margin: "0 0 6px", fontSize: 22 }}>Nothing is governing throughput</h2>
        <p className="small muted" style={{ margin: 0 }}>
          No queue has a patient&apos;s critical path running through it right now.
        </p>
      </Card>
    );
  }
  const structural = constraint.kind === "structural";
  return (
    <Card className={structural ? "constraint structural" : "constraint resource"}>
      <div className="spread" style={{ marginBottom: 6 }}>
        <p className="kicker" style={{ margin: 0 }}>Constraint</p>
        <Badge tone={structural ? "" : "high"}>
          {structural ? "structural" : `${constraint.utilisationPct}% utilised`}
        </Badge>
      </div>
      <h2 style={{ margin: "0 0 8px", fontSize: 22 }}>{constraint.headline}</h2>
      <p className="small" style={{ margin: "0 0 10px" }}>{constraint.detail}</p>
      <p className="small" style={{ margin: 0 }}>
        <strong>Subordinate everything to this:</strong> {constraint.subordinate}
      </p>
    </Card>
  );
}

/** One resource's queue, in planned order, with what arrival order would have done. */
export function Worklist({ list, onOpenPatient }) {
  const [open, setOpen] = useState(list.saved > 0);
  return (
    <Card className="worklist">
      <button className="worklist-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <div>
          <h3 style={{ margin: 0, fontSize: 17 }}>{list.label}</h3>
          <p className="small muted" style={{ margin: "2px 0 0" }}>
            {list.items.length} queued · {hours(list.totalMinutes)} of work · capacity {list.capacity}
            {list.criticalCount > 0 && ` · ${list.criticalCount} on a critical path`}
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {list.saved > 0 && <Badge tone="high">saves {list.saved}m</Badge>}
          {list.mobile && <Badge>can travel</Badge>}
        </div>
      </button>

      {open && (
        <div style={{ marginTop: 10 }}>
          {list.items.map((item) => {
            const moved = item.position - item.wasPosition;
            return (
              <div className={`plan-row ${item.critical ? "critical" : ""}`} key={item.stepId + item.patientId}>
                <div className="plan-pos">
                  {item.position}
                  {moved !== 0 && (
                    <span className={`moved ${moved < 0 ? "up" : "down"}`}>
                      {moved < 0 ? `▲${-moved}` : `▼${moved}`}
                    </span>
                  )}
                </div>
                <div className="plan-body">
                  <div style={{ fontWeight: 700, fontSize: 14 }}>
                    {item.label}
                    {item.critical && <Badge tone="high">critical</Badge>}
                    {item.needsPatient && <Badge>needs patient</Badge>}
                  </div>
                  <div className="small">
                    {item.patientName} · {item.departmentName || item.department} · {item.minutes}m
                    {" · "}
                    {item.slack > 0 ? `${item.slack}m float` : "no float"}
                  </div>
                  <div className="small muted">{item.reason}</div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => onOpenPatient(item.patientId, item.patientName)}>
                  Plan
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/** One patient's execution plan. */
export function PatientPlan({ patientId, name, onClose }) {
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchPatientPlan(patientId)
      .then((d) => alive && setPlan(d))
      .catch(() => alive && setError(true));
    return () => { alive = false; };
  }, [patientId]);

  return (
    <Modal title={`${name} — execution plan`} onClose={onClose}>
      {error && <p className="small muted">Could not load this plan.</p>}
      {!plan && !error && <p className="small muted">Computing the plan…</p>}
      {plan && (
        <div className="stack" style={{ gap: 16 }}>
          <div>
            <p className="kicker" style={{ margin: 0 }}>{plan.presentation}</p>
            <h3 style={{ margin: "4px 0 0", fontSize: 20 }}>
              Likely done in {hours(plan.forecast.p50)}, confident by {hours(plan.forecast.confident)}
            </h3>
            <p className="small muted" style={{ margin: "4px 0 0" }}>
              Of that, {hours(plan.presenceMinutes)} actually needs the patient present.
            </p>
          </div>

          {plan.clockBound && (
            <div className="plan-note clock">
              <strong>{plan.clockBound.label} — {plan.clockBound.minutes}m.</strong> {plan.clockBound.guidance}
            </div>
          )}

          {plan.blockedBy && (
            <div>
              <p className="kicker">Right now, going home waits on</p>
              <p style={{ margin: 0, fontWeight: 700 }}>{plan.blockedBy.label}</p>
              {plan.blockedBy.why && <p className="small muted" style={{ margin: "2px 0 0" }}>{plan.blockedBy.why}</p>}
            </div>
          )}

          <div>
            <p className="kicker">Critical path — the only chain whose delay moves discharge</p>
            <ol className="crit-path">
              {plan.criticalPath.map((s) => (
                <li key={s.id} className={s.state === "done" ? "done" : ""}>
                  <span>{s.label}</span>
                  <span className="small muted">{s.clock ? "fixed interval" : `${s.minutes}m`}</span>
                </li>
              ))}
            </ol>
          </div>

          {plan.startableNow.length > 0 && (
            <div>
              <p className="kicker">Startable right now, with nothing from the patient</p>
              {plan.startableNow.map((s) => (
                <div key={s.id} className="small" style={{ marginTop: 4 }}>
                  · <strong>{s.label}</strong>
                  {s.why && <span className="muted"> — {s.why}</span>}
                </div>
              ))}
            </div>
          )}

          {plan.speculation.length > 0 && (
            <div>
              <p className="kicker">Start before it is confirmed?</p>
              {plan.speculation.map((s) => (
                <div key={s.id} className={`plan-note ${s.recommend ? "yes" : "no"}`}>
                  <strong>{s.recommend ? "Start now" : "Hold"} — {s.label}</strong>
                  <div className="small" style={{ marginTop: 2 }}>{s.rationale}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

/**
 * The floor played forward under the habit it has now, and under the plan.
 * Latent jams are queues that do not exist yet. Inversions are the specific
 * pair arrival-order gets wrong. Opportunities are work that fits for free.
 */
export function ControlCard({ control, onStaged }) {
  const rec = control.recommended;
  const [busy, setBusy] = useState(false);
  const [staged, setStaged] = useState(false);

  async function stage() {
    if (!rec || busy) return;
    setBusy(true);
    try {
      await stageControlMove();
      setStaged(true);
      onStaged?.();
    } catch {
      /* keep the recommendation visible */
    }
    setBusy(false);
  }

  return (
    <Card className="trajectory">
      <p className="kicker">What the hospital should do next</p>
      <h2 style={{ margin: "0 0 6px", fontSize: 22 }}>
        {rec ? rec.title : "Leave the floor as it is"}
      </h2>
      <p className="small muted" style={{ margin: "0 0 10px" }}>
        ClearPath compared {control.considered} reversible moves against doing nothing.
        Baseline delay {control.baseline.delay} weighted minutes · {control.baseline.queueAt45} tasks on a resource in 45 minutes.
        {control.authority?.reason ? ` ${control.authority.reason}` : ""}
      </p>
      {rec ? (
        <div className={`plan-note ${rec.type === "HOLD" ? "clock" : "yes"}`}>
          <strong>
            {rec.type === "HOLD"
              ? "Hold — a person has to look"
              : `Stage this · predicted save ${rec.minutesSaved}m`}
          </strong>
          <div className="small" style={{ marginTop: 4 }}>{rec.reason}</div>
          <div className="small muted" style={{ marginTop: 4 }}>{rec.authority?.reason}</div>
          <div style={{ marginTop: 10 }}>
            <Button size="sm" onClick={stage} disabled={busy || staged}>
              {staged
                ? "Recorded — reversible, not an order"
                : busy
                  ? "Working…"
                  : rec.type === "HOLD"
                    ? "Record the hold"
                    : "Stage this move"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="plan-note no">
          None of the reversible moves beat the current plan by enough to act.
          A person should still look at the opportunities below, not at another alert.
        </div>
      )}
      {control.needsHuman?.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <p className="kicker">One decision that needs a person</p>
          {control.needsHuman.map((item) => (
            <div key={item.id} className="plan-note clock">
              <strong>{item.title}</strong>
              <div className="small" style={{ marginTop: 2 }}>{item.reason}</div>
            </div>
          ))}
        </div>
      )}
      {control.alternatives?.length > 0 && (
        <p className="small muted" style={{ marginTop: 10 }}>
          Also considered: {control.alternatives.map((a) => `${a.title} (${a.minutesSaved}m)`).join("; ")}.
        </p>
      )}
    </Card>
  );
}

export function Trajectory({ trajectory, authority }) {
  const { latent, opportunities, inversions, checkpoints } = trajectory;
  return (
    <Card className="trajectory">
      <div className="spread" style={{ marginBottom: 8 }}>
        <div>
          <p className="kicker" style={{ margin: 0 }}>If nothing about capacity changes</p>
          <h2 style={{ margin: "2px 0 0", fontSize: 22 }}>
            {trajectory.savedMinutes >= 15
              ? `The plan avoids ${trajectory.savedMinutes} minutes of delay the current order creates`
              : "Reordering will not move this floor"}
          </h2>
        </div>
      </div>
      {authority && (
        <p className="small" style={{ margin: "0 0 12px" }}>
          <span className="ep prediction">Predicted, not verified.</span>{" "}
          <span className="muted">{authority.reason}</span>
        </p>
      )}
      <p className="small muted" style={{ margin: "0 0 12px" }}>
        Same patients, same tasks, same staff. Played forward, arrival order costs {trajectory.currentDelay} weighted
        minutes of delay and the plan costs {trajectory.plannedDelay}, against a hospital with unlimited capacity.
        {trajectory.savedMinutes < 15
          ? " The gap is noise. The delay is in the dependency structure, not in who is first in line."
          : " The gap is real, and it comes only from which eligible task a resource picks up next."}
      </p>

      {checkpoints?.length > 0 && (
        <div className="row" style={{ gap: 16, marginBottom: 12 }}>
          {checkpoints.map((point) => (
            <div key={point.minute} className="small">
              <b>{point.minute === 0 ? "Now" : `+${point.minute}m`}</b>
              <span className="muted"> · {point.queued} tasks on a resource</span>
            </div>
          ))}
        </div>
      )}

      {latent.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <p className="kicker">Will jam, and does not look jammed yet</p>
          {latent.map((item) => (
            <div key={item.resource} className="plan-note clock">
              <strong>{item.label}</strong>
              <div className="small" style={{ marginTop: 2 }}>{item.detail}</div>
            </div>
          ))}
        </div>
      )}

      {inversions.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <p className="kicker">Arrival order gets this pair backwards</p>
          {inversions.slice(0, 3).map((inv) => (
            <div key={`${inv.holder}-${inv.waiting}-${inv.at}`} className="plan-note no">
              <strong>{inv.holderTask}</strong> for {inv.holder} starts at minute {inv.at}, ahead of{" "}
              <strong>{inv.waitingTask}</strong> for {inv.waiting}, which is on a critical path.
            </div>
          ))}
        </div>
      )}

      {opportunities.length > 0 && (
        <div>
          <p className="kicker">Do this because of how the next hours fit</p>
          {opportunities.map((item) => (
            <div key={item.title} className="plan-note yes">
              <strong>{item.title}</strong>
              <div className="small" style={{ marginTop: 2 }}>{item.detail}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function Planner() {
  const [floor, setFloor] = useState(null);
  const [focus, setFocus] = useState(null);

  const load = useCallback(async () => {
    try {
      setFloor(await fetchFloorPlan());
    } catch {
      /* keep the last good plan rather than blanking the screen */
    }
  }, []);

  useEffect(() => {
    load();
    const poll = setInterval(load, 15000);
    return () => clearInterval(poll);
  }, [load]);

  if (!floor) return <p className="muted">Computing the floor plan…</p>;
  if (!floor.patients) {
    return <Empty title="No active patients" body="Plans are built from the live census." />;
  }

  return (
    <div>
      <div className="kpi-grid kpi-4">
        <div className="kpi"><b>{hours(floor.remainingMinutes)}</b><span>Remaining visit time</span></div>
        <div className="kpi"><b>{hours(floor.coordinationMinutes)}</b><span>Of it, coordination</span></div>
        <div className={`kpi ${floor.minutesSaved > 0 ? "alert" : ""}`}>
          <b>{floor.minutesSaved}m</b><span>Recoverable by reordering</span>
        </div>
        <div className="kpi"><b>{floor.clockBoundPatients}</b><span>Clock-bound, not queue-bound</span></div>
      </div>

      <div className="layout-2">
        <PresenceSplit floor={floor} />
        <ConstraintCard constraint={floor.constraint} />
      </div>

      {floor.agent && (
        <p className="small muted" style={{ margin: "0 0 12px" }}>
          Passive agent watching {floor.agent.watching} beds · {floor.agent.silent} quiet · {floor.agent.exceptions} exception{floor.agent.exceptions === 1 ? "" : "s"}.
          Vitals are a stream. They are not a step in the visit.
        </p>
      )}
      {floor.control && <ControlCard control={floor.control} onStaged={load} />}
      {floor.trajectory && <Trajectory trajectory={floor.trajectory} authority={floor.authority} />}

      <p className="kicker" style={{ marginTop: 20 }}>
        Queues in planned order — least float first, not arrival order
      </p>
      {floor.worklists.map((list) => (
        <Worklist
          key={list.resource}
          list={list}
          onOpenPatient={(id, name) => setFocus({ id, name })}
        />
      ))}

      <p className="small muted" style={{ marginTop: 12 }}>
        Ordering is advisory and operational. It never changes a clinical decision, and
        acuity always outranks float.
      </p>

      {focus && (
        <PatientPlan
          patientId={focus.id}
          name={focus.name}
          onClose={() => setFocus(null)}
        />
      )}
    </div>
  );
}
