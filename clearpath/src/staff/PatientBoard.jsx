import { useMemo, useState } from "react";
import PatientCard from "../components/PatientCard.jsx";
import { DEPT_LIST, DEPT_NAMES } from "../constants.js";
import { Empty } from "../components/ui.jsx";

export default function PatientBoard({ patients, onRefresh, focusId }) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [view, setView] = useState("attention");

  const stats = DEPT_LIST.map((d) => ({
    id: d,
    name: DEPT_NAMES[d],
    count: patients.filter((p) => p.department === d).length,
    high: patients.filter((p) => p.department === d && p.urgency === "high").length,
    stuck: patients.filter((p) => p.department === d && p.is_stuck).length,
  })).filter((s) => s.count);

  const filtered = useMemo(() => {
    let list = patients.filter((p) => {
      if (filter !== "all" && p.department !== filter) return false;
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return [p.name, p.situation, p.summary, p.reason].some((v) => (v || "").toLowerCase().includes(q));
    });
    if (view === "attention") {
      list = [...list].sort((a, b) => {
        const as = (a.is_stuck ? 0 : 1) + (a.action?.priority ?? 5);
        const bs = (b.is_stuck ? 0 : 1) + (b.action?.priority ?? 5);
        return as - bs || b.wait_minutes - a.wait_minutes;
      });
    } else if (view === "ready") {
      list = list.filter((p) => p.action?.kind === "advance" || p.action?.kind === "prepare-discharge" || p.action?.kind === "discharge");
    } else if (view === "stuck") {
      list = list.filter((p) => p.is_stuck);
    }
    if (focusId) {
      list = [...list].sort((a, b) => (a.id === focusId ? -1 : b.id === focusId ? 1 : 0));
    }
    return list;
  }, [patients, filter, search, view, focusId]);

  return (
    <div>
      <div className="stat-grid">
        {stats.map((s) => (
          <button
            key={s.id}
            className={`stat ${filter === s.id ? "on" : ""}`}
            onClick={() => setFilter(filter === s.id ? "all" : s.id)}
          >
            <b>{s.count}</b>
            <span>{s.name}</span>
            {(s.high > 0 || s.stuck > 0) && (
              <div className="small" style={{ marginTop: 4, color: s.stuck ? "var(--danger)" : "var(--warn)" }}>
                {s.high ? `${s.high} high` : ""}{s.high && s.stuck ? " · " : ""}{s.stuck ? `${s.stuck} delayed` : ""}
              </div>
            )}
          </button>
        ))}
      </div>

      <div className="toolbar">
        <input className="field" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or situation" />
        <select className="select" value={view} onChange={(e) => setView(e.target.value)} style={{ width: 180 }}>
          <option value="attention">Needs attention</option>
          <option value="ready">Ready to move</option>
          <option value="stuck">Delayed only</option>
          <option value="all">Everyone</option>
        </select>
        <button className="btn ghost sm" onClick={onRefresh} type="button">Refresh</button>
      </div>

      <div className="board">
        {filtered.length === 0 ? (
          <Empty title="No patients in this view" body="Try another filter, or check the flow view for hospital-wide bottlenecks." />
        ) : (
          filtered.map((p) => <PatientCard key={p.id} patient={p} onRefresh={onRefresh} />)
        )}
      </div>
    </div>
  );
}
