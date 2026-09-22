import { useEffect, useState } from "react";
import { fetchAnalytics } from "./api/backend.js";
import { DEPT_COLORS, DEPT_NAMES } from "./constants.js";
import { Card } from "./components/ui.jsx";

const URGENCY = {
  high: { color: "var(--danger)", label: "High" },
  medium: { color: "var(--warn)", label: "Medium" },
  low: { color: "var(--sage)", label: "Low" },
};

function StatCard({ value, label, sub, alert }) {
  return (
    <div className={`kpi ${alert ? "alert" : ""}`}>
      <b>{value}</b>
      <span>{label}{sub ? ` · ${sub}` : ""}</span>
    </div>
  );
}

function BarChart({ data, color }) {
  if (!data) return <div className="empty">No data yet</div>;
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="bar-chart">
      {Array.from({ length: 24 }, (_, i) => {
        const hour = String(i).padStart(2, "0");
        const found = data.find((d) => d.hour === hour);
        const count = found ? found.count : 0;
        const height = Math.max(4, (count / max) * 96);
        return (
          <div key={hour} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div
              title={`${hour}:00 · ${count}`}
              style={{
                width: "100%",
                height,
                background: count > 0 ? color : "var(--bg-2)",
                borderRadius: "4px 4px 0 0",
              }}
            />
            {i % 6 === 0 && <span className="small muted">{hour}</span>}
          </div>
        );
      })}
    </div>
  );
}

export default function Analytics({ embedded }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let on = true;
    async function load() {
      try {
        const d = await fetchAnalytics();
        if (on) setData(d);
      } catch { /* keep */ }
      if (on) setLoading(false);
    }
    load();
    const t = setInterval(load, 15000);
    return () => { on = false; clearInterval(t); };
  }, []);

  if (loading) return <p className="muted">Loading insights…</p>;
  if (!data) return <p className="muted">Could not load insights. Is the server running?</p>;

  const maxWait = Math.max(...(data.avgWaitByDept || []).map((d) => d.avg_wait_minutes || 0), 1);
  const totalUrgency = (data.urgencyBreakdown || []).reduce((s, u) => s + u.count, 0);
  const openBlockers = (data.blockerBreakdown || []).filter((b) => b.status !== "resolved");

  return (
    <div className="stack" style={{ gap: 16 }}>
      {!embedded && (
        <header className="staff-top" style={{ marginBottom: 0 }}>
          <div>
            <p className="page-kicker">ClearPath</p>
            <h1 className="page-title">Flow insights</h1>
          </div>
        </header>
      )}

      <div className="kpi-grid">
        <StatCard value={data.totalToday} label="Patients today" />
        <StatCard value={data.currentlyWaiting} label="Currently in line" />
        <StatCard value={data.discharged} label="Discharged" />
        <StatCard value={data.kpis?.stuck ?? 0} label="Delayed now" alert={data.kpis?.stuck > 0} />
        <StatCard value={data.kpis?.overdueBlockers ?? 0} label="Overdue dependencies" />
        <StatCard value={data.languages?.length || 0} label="Languages today" />
      </div>

      {data.predictions?.length > 0 && (
        <Card>
          <p className="kicker">Operational forecast</p>
          <div className="layout-2" style={{ margin: 0 }}>
            {data.predictions.map((p) => (
              <div key={p.id}>
                <h3 style={{ margin: "0 0 4px", fontSize: 16 }}>{p.title}</h3>
                <p className="small muted" style={{ margin: 0 }}>{p.detail}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <p className="kicker">Patient volume by hour</p>
        <BarChart data={data.byHour} color="var(--accent)" />
      </Card>

      <div className="layout-2">
        <Card>
          <p className="kicker">Average wait by department</p>
          {(data.avgWaitByDept || []).length === 0 ? (
            <p className="small muted">No timing data yet</p>
          ) : (
            data.avgWaitByDept.map((d) => (
              <div key={d.department} style={{ marginBottom: 12 }}>
                <div className="spread small">
                  <span>{DEPT_NAMES[d.department] || d.department}</span>
                  <span className="muted">{d.avg_wait_minutes || 0} min · {d.total} visits</span>
                </div>
                <div className="hr-bar">
                  <div style={{
                    height: "100%",
                    width: `${Math.max(4, ((d.avg_wait_minutes || 0) / maxWait) * 100)}%`,
                    background: DEPT_COLORS[d.department]?.border || "var(--accent)",
                    borderRadius: 99,
                  }} />
                </div>
              </div>
            ))
          )}
        </Card>

        <Card>
          <p className="kicker">Urgency mix</p>
          {["high", "medium", "low"].map((u) => {
            const found = data.urgencyBreakdown?.find((d) => d.urgency === u);
            const count = found?.count || 0;
            const pct = totalUrgency > 0 ? Math.round((count / totalUrgency) * 100) : 0;
            return (
              <div key={u} style={{ marginBottom: 12 }}>
                <div className="spread small">
                  <span>{URGENCY[u].label}</span>
                  <span className="muted">{count} ({pct}%)</span>
                </div>
                <div className="hr-bar">
                  <div style={{ height: "100%", width: `${pct}%`, background: URGENCY[u].color, borderRadius: 99 }} />
                </div>
              </div>
            );
          })}
        </Card>
      </div>

      <div className="layout-2">
        <Card>
          <p className="kicker">Open dependencies by type</p>
          {openBlockers.length === 0 ? (
            <p className="small muted">No open blockers</p>
          ) : (
            openBlockers.map((b) => (
              <div key={`${b.type}-${b.status}`} className="spread" style={{ padding: "8px 0" }}>
                <span style={{ textTransform: "capitalize" }}>{b.type.replaceAll("_", " ")}</span>
                <span className="badge">{b.count} {b.status}</span>
              </div>
            ))
          )}
        </Card>
        <Card>
          <p className="kicker">Languages spoken today</p>
          <div className="row">
            {(data.languages || []).map((l) => (
              <span key={l.language} className="badge accent">{l.language} · {l.count}</span>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
