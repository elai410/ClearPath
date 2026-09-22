import { useState } from "react";
import { fetchHandoff } from "../api/backend.js";
import Analytics from "../Analytics.jsx";
import { Button, Card } from "../components/ui.jsx";
import CommandCenter from "./CommandCenter.jsx";
import Handoffs from "./Handoffs.jsx";
import { ConstraintCard, ControlCard, PatientPlan, PresenceSplit, Trajectory, Worklist } from "./Planner.jsx";
import { FindPerson } from "./WorkRow.jsx";

function hours(mins) {
  if (!Number.isFinite(mins)) return "—";
  if (mins < 90) return `${Math.round(mins)}m`;
  return `${(mins / 60).toFixed(1)}h`;
}

export default function ManagerView({ flow, floor, escalations, onRefresh }) {
  const [plan, setPlan] = useState(null);
  const [brief, setBrief] = useState(null);
  const [busy, setBusy] = useState(false);
  const patients = flow?.patients || [];

  return (
    <div className="role-view">
      <p className="role-lead">
        {floor?.constraint?.headline
          || "The floor is inside expected windows."}
      </p>

      {floor && (
        <div className="kpi-grid kpi-4">
          <div className="kpi"><b>{hours(floor.remainingMinutes)}</b><span>Remaining visit time</span></div>
          <div className="kpi"><b>{hours(floor.coordinationMinutes)}</b><span>Of it, coordination</span></div>
          <div className={`kpi ${floor.minutesSaved > 0 ? "alert" : ""}`}>
            <b>{floor.minutesSaved}m</b><span>Recoverable by reordering</span>
          </div>
          <div className="kpi"><b>{floor.clockBoundPatients}</b><span>Clock-bound, not queue-bound</span></div>
        </div>
      )}

      {floor && (
        <div className="layout-2">
          <PresenceSplit floor={floor} />
          <ConstraintCard constraint={floor.constraint} />
        </div>
      )}

      {floor?.control && <ControlCard control={floor.control} onStaged={onRefresh} />}
      {floor?.trajectory && <Trajectory trajectory={floor.trajectory} authority={floor.authority} />}

      {floor?.worklists?.length > 0 && (
        <section className="role-section">
          <p className="kicker">Queues in planned order</p>
          <h2 className="role-h">Least float first, not arrival order</h2>
          {floor.worklists.map((list) => (
            <Worklist
              key={list.resource}
              list={list}
              onOpenPatient={(id, name) => setPlan({ id, name })}
            />
          ))}
          <p className="small muted" style={{ marginTop: 8 }}>
            Ordering is advisory. It never changes a clinical decision, and acuity always outranks float.
          </p>
        </section>
      )}

      <section className="role-section">
        <p className="kicker">Live flow</p>
        <h2 className="role-h">Bottlenecks, lines, what is likely next</h2>
        <CommandCenter flow={flow} onRefresh={onRefresh} showTasks={false} showKpis={false} />
      </section>

      <section className="role-section">
        <p className="kicker">Handoffs</p>
        <h2 className="role-h">Overdue work, by the team that owns it</h2>
        <Handoffs data={escalations} onChanged={onRefresh} />
      </section>

      <section className="role-section">
        <p className="kicker">Volume, waits, languages</p>
        <h2 className="role-h">What the shift looks like from above</h2>
        <Analytics embedded />
      </section>

      <section className="role-section">
        <p className="kicker">Incoming team</p>
        <h2 className="role-h">Shift briefing</h2>
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
            Write the incoming team's briefing
          </Button>
          {brief && <p style={{ lineHeight: 1.6, whiteSpace: "pre-wrap", marginTop: 12 }}>{brief}</p>}
        </Card>
      </section>

      <FindPerson patients={patients} onRefresh={onRefresh} />

      {plan && (
        <PatientPlan patientId={plan.id} name={plan.name} onClose={() => setPlan(null)} />
      )}
    </div>
  );
}
