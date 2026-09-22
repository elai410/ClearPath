import { callPatient, advancePatient, prepareDischarge, escalateBlocker } from "../api/backend.js";
import { Badge, Button, Card, Empty } from "../components/ui.jsx";

export default function CommandCenter({ flow, onRefresh, onOpenPatient, showTasks = true, showKpis = true, showPredictions = true }) {
  if (!flow) return <p className="muted">Loading the floor…</p>;
  const { kpis, bottlenecks, queues, predictions, tasks } = flow;
  const maxWait = Math.max(...queues.map((q) => q.avgWait), 1);

  async function runTask(task) {
    try {
      if (task.kind === "call") await callPatient(task.patientId);
      if (task.kind === "advance") await advancePatient(task.patientId);
      if (task.kind === "prepare-discharge") await prepareDischarge(task.patientId);
      if (task.kind === "escalate" && task.blockerId) await escalateBlocker(task.blockerId);
      onRefresh();
    } catch {
      /* keep going */
    }
  }

  return (
    <div>
      {showKpis && (
        <div className="kpi-grid">
          <div className="kpi"><b>{kpis.active}</b><span>In hospital</span></div>
          <div className="kpi"><b>{kpis.waiting}</b><span>In line</span></div>
          <div className={`kpi ${kpis.stuck ? "alert" : ""}`}><b>{kpis.stuck}</b><span>Past expected wait</span></div>
          <div className="kpi"><b>{kpis.overdueBlockers}</b><span>Overdue work</span></div>
          <div className="kpi"><b>{kpis.readyToAdvance}</b><span>Ready to move</span></div>
          <div className="kpi"><b>{kpis.avgWait}m</b><span>Avg line wait</span></div>
        </div>
      )}

      <div className="layout-2">
        <Card>
          <p className="kicker">What&apos;s backing up</p>
          <h2 style={{ margin: "0 0 8px", fontSize: 20 }}>What&apos;s actually delaying care</h2>
          {bottlenecks.length === 0 && <Empty title="Nothing's backing up" body="Lines and waits look normal." />}
          {bottlenecks.map((b) => (
            <div className="bn" key={b.id}>
              <div className="spread">
                <span className={`severity ${b.severity}`}>{b.severity}</span>
                <Badge>{b.count}</Badge>
              </div>
              <h3>{b.title}</h3>
              <p className="small muted" style={{ margin: "0 0 6px" }}>{b.detail}</p>
              <p className="small" style={{ margin: 0 }}><strong>Do this:</strong> {b.action}</p>
            </div>
          ))}
        </Card>

        {showTasks ? (
          <Card>
            <p className="kicker">Do next</p>
            <h2 style={{ margin: "0 0 8px", fontSize: 20 }}>Best next moves</h2>
            {tasks.length === 0 && <p className="small muted">Nothing needs intervention right now.</p>}
            {tasks.map((t) => (
              <div className="task" key={t.id}>
                <div className={`prio p${Math.min(t.priority, 3)}`}>{t.priority}</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{t.name}</div>
                  <div className="small">{t.title}</div>
                  <div className="small muted">{t.reason}</div>
                </div>
                <div className="stack" style={{ gap: 6 }}>
                  {["call", "advance", "prepare-discharge", "escalate"].includes(t.kind) ? (
                    <Button size="sm" onClick={() => runTask(t)}>Do it</Button>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => onOpenPatient?.(t.patientId)}>View</Button>
                  )}
                </div>
              </div>
            ))}
          </Card>
        ) : (
          <Card>
            <p className="kicker">Queues</p>
            <h2 style={{ margin: "0 0 12px", fontSize: 20 }}>Where lines are forming</h2>
            {queues.map((q) => (
              <div className="queue-row" key={q.department}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{q.name}</div>
                  <div className="small muted">{q.waiting} waiting · {q.stuck} delayed · {q.high} high</div>
                </div>
                <div className={`meter ${q.congestion}`} style={{ width: 120 }} title={`${q.avgWait} min`}>
                  <i style={{ width: `${Math.max(8, (q.avgWait / maxWait) * 100)}%` }} />
                </div>
                <span className="small">{q.avgWait}m</span>
              </div>
            ))}
          </Card>
        )}
      </div>

      {showTasks && (
        <div className="layout-2">
          <Card>
            <p className="kicker">Queues</p>
            <h2 style={{ margin: "0 0 12px", fontSize: 20 }}>Where lines are forming</h2>
            {queues.map((q) => (
              <div className="queue-row" key={q.department}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{q.name}</div>
                  <div className="small muted">{q.waiting} waiting · {q.stuck} delayed · {q.high} high</div>
                </div>
                <div className={`meter ${q.congestion}`} style={{ width: 120 }} title={`${q.avgWait} min`}>
                  <i style={{ width: `${Math.max(8, (q.avgWait / maxWait) * 100)}%` }} />
                </div>
                <span className="small">{q.avgWait}m</span>
              </div>
            ))}
          </Card>
          {showPredictions && (
            <Card>
              <p className="kicker">Looking ahead</p>
              <h2 style={{ margin: "0 0 12px", fontSize: 20 }}>What&apos;s likely next</h2>
              {predictions.length === 0 && <p className="small muted">Nothing strong to call from the current floor.</p>}
              {predictions.map((p) => (
                <div className="bn" key={p.id}>
                  <span className="severity info">{p.confidence}</span>
                  <h3>{p.title}</h3>
                  <p className="small muted" style={{ margin: 0 }}>{p.detail}</p>
                </div>
              ))}
              <p className="small muted" style={{ marginTop: 12 }}>
                This is about the floor, not a diagnosis. It updates with who&apos;s here.
              </p>
            </Card>
          )}
        </div>
      )}

      {!showTasks && showPredictions && (
        <Card>
          <p className="kicker">Looking ahead</p>
          <h2 style={{ margin: "0 0 12px", fontSize: 20 }}>What&apos;s likely next</h2>
          {predictions.length === 0 && <p className="small muted">Nothing strong to call from the current floor.</p>}
          {predictions.map((p) => (
            <div className="bn" key={p.id}>
              <span className="severity info">{p.confidence}</span>
              <h3>{p.title}</h3>
              <p className="small muted" style={{ margin: 0 }}>{p.detail}</p>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
