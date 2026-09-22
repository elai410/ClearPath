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
export function PresenceSplit({ floor, compact }) {
  const total = Math.max(1, floor.remainingMinutes);
  const pct = Math.round((floor.presenceMinutes / total) * 100);
  const bar = (
    <>
      <div className="split-bar" role="img"
        aria-label={`${pct}% with the patient, ${100 - pct}% waiting around`}>
        <i className="presence" style={{ width: `${pct}%` }} />
        <i className="coordination" style={{ width: `${100 - pct}%` }} />
      </div>
      <div className="row" style={{ marginTop: 8, gap: 18 }}>
        <span className="small"><i className="swatch presence" /> Needs them in the room · {hours(floor.presenceMinutes)}</span>
        <span className="small"><i className="swatch coordination" /> Waiting around · {hours(floor.coordinationMinutes)}</span>
      </div>
    </>
  );
  if (compact) {
    return (
      <div className="presence-strip">
        <p className="small muted" style={{ margin: "0 0 8px" }}>
          {hours(floor.coordinationMinutes)} of the next {hours(floor.remainingMinutes)} is waiting around, not being seen
          · {floor.patients} patients
        </p>
        {bar}
      </div>
    );
  }
  return (
    <Card>
      <p className="kicker">Where the time goes</p>
      <h2 style={{ margin: "0 0 4px", fontSize: 22 }}>
        {hours(floor.coordinationMinutes)} of the next {hours(floor.remainingMinutes)} is waiting around, not being seen
      </h2>
      <p className="small muted" style={{ margin: "0 0 14px" }}>
        Across {floor.patients} patients. Only {pct}% of the remaining time actually needs them in the room —
        the rest is waiting on the next step.
      </p>
      {bar}
    </Card>
  );
}

export function ConstraintCard({ constraint }) {
  if (!constraint) {
    return (
      <Card>
        <p className="kicker">What&apos;s in the way</p>
        <h2 style={{ margin: "0 0 6px", fontSize: 22 }}>Nothing&apos;s backing the floor up right now</h2>
        <p className="small muted" style={{ margin: 0 }}>
          Nobody&apos;s visit is stuck on a full queue.
        </p>
      </Card>
    );
  }
  const structural = constraint.kind === "structural";
  return (
    <Card className={structural ? "constraint structural" : "constraint resource"}>
      <div className="spread" style={{ marginBottom: 6 }}>
        <p className="kicker" style={{ margin: 0 }}>What&apos;s in the way</p>
        <Badge tone={structural ? "" : "high"}>
          {structural ? "not a staffing problem" : `${constraint.utilisationPct}% busy`}
        </Badge>
      </div>
      <h2 style={{ margin: "0 0 8px", fontSize: 22 }}>{constraint.headline}</h2>
      <p className="small" style={{ margin: "0 0 10px" }}>{constraint.detail}</p>
      <p className="small" style={{ margin: 0 }}>
        <strong>Work around this first:</strong> {constraint.subordinate}
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
            {list.items.length} waiting · {hours(list.totalMinutes)} of work · {list.capacity} {list.capacity === 1 ? "person" : "people"}
            {list.criticalCount > 0 && ` · ${list.criticalCount} can\u2019t wait`}
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {list.saved > 0 && <Badge tone="high">saves {list.saved}m</Badge>}
          {list.mobile && <Badge>comes to the bedside</Badge>}
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
                    {item.critical && <Badge tone="high">can&apos;t wait</Badge>}
                    {item.needsPatient && <Badge>needs them there</Badge>}
                  </div>
                  <div className="small">
                    {item.patientName} · {item.departmentName || item.department} · {item.minutes}m
                    {" · "}
                    {item.slack > 0 ? `${item.slack}m to spare` : "no time to spare"}
                  </div>
                  <div className="small muted">{item.reason}</div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => onOpenPatient(item.patientId, item.patientName)}>
                  See plan
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
    <Modal title={`${name} — visit plan`} onClose={onClose}>
      {error && <p className="small muted">Could not load this plan.</p>}
      {!plan && !error && <p className="small muted">Loading the plan…</p>}
      {plan && (
        <div className="stack" style={{ gap: 16 }}>
          <div>
            <p className="kicker" style={{ margin: 0 }}>{plan.presentation}</p>
            <h3 style={{ margin: "4px 0 0", fontSize: 20 }}>
              Likely done in {hours(plan.forecast.p50)}, pretty sure by {hours(plan.forecast.confident)}
            </h3>
            <p className="small muted" style={{ margin: "4px 0 0" }}>
              Of that, {hours(plan.presenceMinutes)} actually needs them here.
            </p>
          </div>

          {plan.clockBound && (
            <div className="plan-note clock">
              <strong>{plan.clockBound.label} — {plan.clockBound.minutes}m.</strong> {plan.clockBound.guidance}
            </div>
          )}

          {plan.blockedBy && (
            <div>
              <p className="kicker">What&apos;s holding discharge</p>
              <p style={{ margin: 0, fontWeight: 700 }}>{plan.blockedBy.label}</p>
              {plan.blockedBy.why && <p className="small muted" style={{ margin: "2px 0 0" }}>{plan.blockedBy.why}</p>}
            </div>
          )}

          <div>
            <p className="kicker">The steps that set when they can leave</p>
            <ol className="crit-path">
              {plan.criticalPath.map((s) => (
                <li key={s.id} className={s.state === "done" ? "done" : ""}>
                  <span>{s.label}</span>
                  <span className="small muted">{s.clock ? "required wait" : `${s.minutes}m`}</span>
                </li>
              ))}
            </ol>
          </div>

          {plan.startableNow.length > 0 && (
            <div>
              <p className="kicker">Can start now, without them in the room</p>
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
              <p className="kicker">Start before it&apos;s confirmed?</p>
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
      <p className="kicker">What to do next</p>
      <h2 style={{ margin: "0 0 6px", fontSize: 22 }}>
        {rec ? rec.title : "Leave things as they are"}
      </h2>
      <p className="small muted" style={{ margin: "0 0 10px" }}>
        We looked at {control.considered} {control.considered === 1 ? "option" : "options"} against doing nothing.
        Extra wait right now is about {control.baseline.delay} minutes · {control.baseline.queueAt45} tasks still waiting in 45 minutes.
      </p>
      {rec ? (
        <div className={`plan-note ${rec.type === "HOLD" ? "clock" : "yes"}`}>
          <strong>
            {rec.type === "HOLD"
              ? "Don't discharge yet — someone needs to look"
              : `Queue this · could save ${rec.minutesSaved}m`}
          </strong>
          <div className="small" style={{ marginTop: 4 }}>{rec.reason}</div>
          <div style={{ marginTop: 10 }}>
            <Button size="sm" onClick={stage} disabled={busy || staged}>
              {staged
                ? "Noted — nothing's been ordered"
                : busy
                  ? "Working…"
                  : rec.type === "HOLD"
                    ? "Note: don't discharge yet"
                    : "Queue this"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="plan-note no">
          None of the options beat doing nothing by enough. Check the items below if you want.
        </div>
      )}
      {control.needsHuman?.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <p className="kicker">Needs a person</p>
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
          Also looked at: {control.alternatives.map((a) => `${a.title} (${a.minutesSaved}m)`).join("; ")}.
        </p>
      )}
    </Card>
  );
}

export function Trajectory({ trajectory }) {
  const { latent, opportunities, inversions, checkpoints } = trajectory;
  return (
    <Card className="trajectory">
      <div className="spread" style={{ marginBottom: 8 }}>
        <div>
          <p className="kicker" style={{ margin: 0 }}>If we keep going like this</p>
          <h2 style={{ margin: "2px 0 0", fontSize: 22 }}>
            {trajectory.savedMinutes >= 15
              ? `Seeing people in a different order could save ${trajectory.savedMinutes} minutes`
              : "Changing the order won't help much today"}
          </h2>
        </div>
      </div>
      <p className="small muted" style={{ margin: "0 0 12px" }}>
        Same staff, same patients. Calling people in arrival order costs about {trajectory.currentDelay} extra minutes
        of wait vs {trajectory.plannedDelay} if you take the tightest deadlines first.
        {trajectory.savedMinutes < 15
          ? " The difference is small. The wait is in the steps that haven't started, not who is first in line."
          : " The difference comes from who you call next, not from adding staff."}
      </p>

      {checkpoints?.length > 0 && (
        <div className="row" style={{ gap: 16, marginBottom: 12 }}>
          {checkpoints.map((point) => (
            <div key={point.minute} className="small">
              <b>{point.minute === 0 ? "Now" : `+${point.minute}m`}</b>
              <span className="muted"> · {point.queued} tasks waiting</span>
            </div>
          ))}
        </div>
      )}

      {latent.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <p className="kicker">Likely to back up</p>
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
          <p className="kicker">First-come-first-served has these two backwards</p>
          {inversions.slice(0, 3).map((inv) => (
            <div key={`${inv.holder}-${inv.waiting}-${inv.at}`} className="plan-note no">
              <strong>{inv.holderTask}</strong> for {inv.holder} starts at minute {inv.at}, ahead of{" "}
              <strong>{inv.waitingTask}</strong> for {inv.waiting}, which can&apos;t wait.
            </div>
          ))}
        </div>
      )}

      {opportunities.length > 0 && (
        <div>
          <p className="kicker">Worth doing now</p>
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

  if (!floor) return <p className="muted">Loading the floor plan…</p>;
  if (!floor.patients) {
    return <Empty title="No active patients" body="Plans are built from who is in the hospital right now." />;
  }

  return (
    <div>
      <div className="kpi-grid kpi-4">
        <div className="kpi"><b>{hours(floor.remainingMinutes)}</b><span>Time left in visits</span></div>
        <div className="kpi"><b>{hours(floor.coordinationMinutes)}</b><span>Of that, waiting around</span></div>
        <div className={`kpi ${floor.minutesSaved > 0 ? "alert" : ""}`}>
          <b>{floor.minutesSaved}m</b><span>Minutes you could save by changing the order</span>
        </div>
        <div className="kpi"><b>{floor.clockBoundPatients}</b><span>On a timer, not a line</span></div>
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
        Queues — tightest deadlines first, not who arrived first
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
