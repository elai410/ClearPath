import { useState } from "react";
import { fetchHandoff } from "../api/backend.js";
import Analytics from "../Analytics.jsx";
import { Button, Card } from "../components/ui.jsx";
import CommandCenter from "./CommandCenter.jsx";
import Handoffs from "./Handoffs.jsx";
import { ConstraintCard, ControlCard, PatientPlan, PresenceSplit, Trajectory, Worklist } from "./Planner.jsx";
import { Fold, PageMap } from "./WorkRow.jsx";

const MAP = [
  { id: "next", label: "Do this" },
  { id: "bottlenecks", label: "What's backing up" },
  { id: "overdue", label: "Overdue, by team" },
  { id: "closer", label: "Look closer" },
];

function hours(mins) {
  if (!Number.isFinite(mins)) return "—";
  if (mins < 90) return `${Math.round(mins)}m`;
  return `${(mins / 60).toFixed(1)}h`;
}

export default function ManagerView({ flow, floor, escalations, onRefresh }) {
  const [plan, setPlan] = useState(null);
  const [brief, setBrief] = useState(null);
  const [busy, setBusy] = useState(false);
  const lists = floor?.worklists || [];
  const overdue = escalations?.total || 0;

  return (
    <div className="role-view manager-view">
      <PageMap items={MAP} />
      <p className="role-lead">
        {floor?.constraint?.headline
          || "Visits are running on time."}
      </p>

      {floor && (
        <>
          <div className="kpi-grid kpi-4">
            <div className="kpi"><b>{hours(floor.remainingMinutes)}</b><span>Time left in today&apos;s visits</span></div>
            <div className="kpi"><b>{hours(floor.coordinationMinutes)}</b><span>Of that, wait time</span></div>
            <div className={`kpi ${floor.minutesSaved > 0 ? "alert" : ""}`}>
              <b>{floor.minutesSaved}m</b><span>Could save by changing the order</span>
            </div>
            <div className="kpi"><b>{floor.clockBoundPatients}</b><span>On a timer, not a line</span></div>
          </div>
          <PresenceSplit floor={floor} compact />
        </>
      )}

      <section id="next" className="role-section">
        <p className="kicker">The call</p>
        <h2 className="role-h">Do this — and what&apos;s in the way</h2>
        <div className="layout-2">
          {floor?.control
            ? <ControlCard control={floor.control} onStaged={onRefresh} />
            : <p className="small muted">No recommendation yet.</p>}
          <ConstraintCard constraint={floor?.constraint} />
        </div>
      </section>

      <section id="bottlenecks" className="role-section">
        <CommandCenter flow={flow} onRefresh={onRefresh} showTasks={false} showKpis={false} showPredictions={false} />
      </section>

      <section id="overdue" className="role-section">
        <p className="kicker">Handoffs</p>
        <h2 className="role-h">Overdue work, by the team that owns it</h2>
        <Handoffs data={escalations} onChanged={onRefresh} hideKpis />
      </section>

      <section id="closer" className="role-section closer">
        <p className="kicker">When you have a minute</p>
        <h2 className="role-h">Look closer</h2>
        <div className="fold-stack">
          <Fold id="board" title="Suggested order" hint={lists.length ? `${lists.length} queues` : "None waiting"}>
            {lists.length > 0 ? (
              <>
                {lists.map((list) => (
                  <Worklist
                    key={list.resource}
                    list={list}
                    onOpenPatient={(id, name) => setPlan({ id, name })}
                  />
                ))}
                <p className="small muted" style={{ marginTop: 8 }}>
                  Tightest deadlines first, not who arrived first. Sicker patients still go first.
                </p>
              </>
            ) : (
              <p className="small muted">No queues to reorder right now.</p>
            )}
          </Fold>
          {floor?.trajectory && (
            <Fold id="forecast" title="If nothing changes" hint={floor.minutesSaved > 0 ? `Could save ${floor.minutesSaved}m` : "Small difference"}>
              <Trajectory trajectory={floor.trajectory} />
            </Fold>
          )}
          <Fold id="numbers" title="Today's numbers" hint="Volume, waits, languages">
            <Analytics embedded />
          </Fold>
        </div>
      </section>

      <section id="briefing" className="role-section">
        <p className="kicker">Incoming team</p>
        <h2 className="role-h">Shift notes</h2>
        <Card>
          <Button
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const data = await fetchHandoff();
                setBrief(data.summary);
              } catch { /* keep */ }
              setBusy(false);
            }}
          >
            Write notes for the incoming team
          </Button>
          {overdue > 0 && (
            <p className="small muted" style={{ margin: "8px 0 0" }}>
              {overdue} overdue item{overdue === 1 ? "" : "s"} still sit with a team — worth mentioning.
            </p>
          )}
          {brief && <p style={{ lineHeight: 1.6, whiteSpace: "pre-wrap", marginTop: 12 }}>{brief}</p>}
        </Card>
      </section>

      {plan && (
        <PatientPlan patientId={plan.id} name={plan.name} onClose={() => setPlan(null)} />
      )}
    </div>
  );
}
