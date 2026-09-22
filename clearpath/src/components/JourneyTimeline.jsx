import { formatWait } from "../lib/journey.js";
import { Badge } from "./ui.jsx";

export function JourneyTimeline({ items = [] }) {
  return (
    <ol className="timeline" aria-label="Your visit">
      {items.map((s) => (
        <li key={s.id} className={`t-step ${s.state}`}>
          <div className="t-dot">{s.state === "done" ? "✓" : s.state === "now" ? "•" : ""}</div>
          <div className="t-label">{s.label}</div>
        </li>
      ))}
    </ol>
  );
}

export function NowCard({ journey }) {
  if (!journey?.now) return null;
  const n = journey.now;
  return (
    <section className={`now-card ${n.unusual ? "unusual" : ""}`} aria-live="polite">
      <p className="kicker">{n.unusual ? "This wait is longer than usual" : "Happening now"}</p>
      <h2>{n.headline}</h2>
      <p>{n.why}</p>
      <div className="now-meta">
        <div className="now-chip">
          <span>Waiting on</span>
          <strong>{n.waitingFor || "Your care team"}</strong>
        </div>
        <div className="now-chip">
          <span>Who owns this</span>
          <strong>{n.owner || "Care team"}</strong>
        </div>
        <div className="now-chip">
          <span>You've been here</span>
          <strong>{formatWait(journey.wait_minutes)} </strong>
        </div>
        <div className="now-chip">
          <span>Likely remaining</span>
          <strong>~{formatWait(journey.predicted_remaining)}</strong>
        </div>
      </div>
    </section>
  );
}

export function BlockerList({ blockers = [], compact }) {
  const list = compact ? blockers.filter((b) => b.status !== "resolved") : blockers;
  if (!list.length) {
    return <p className="small muted">No open dependencies — this visit can move.</p>;
  }
  return (
    <div>
      {list.map((b) => (
        <div className="blocker" key={b.id}>
          <div className={`b-rail ${b.status} ${b.overdue ? "overdue" : ""}`} />
          <div>
            <div className="b-title">{b.title}</div>
            <div className="b-detail">
              {b.owner_role || b.type_label}
              {b.wait_minutes != null ? ` · ${formatWait(b.wait_minutes)}` : ""}
              {b.can_parallel ? " · can run in parallel" : ""}
            </div>
            {!compact && b.detail && <div className="b-detail">{b.detail}</div>}
          </div>
          <Badge tone={b.status === "resolved" ? "low" : b.overdue ? "high" : b.status === "escalated" ? "medium" : "accent"}>
            {b.status === "resolved" ? "Done" : b.overdue ? "Overdue" : b.status === "escalated" ? "Escalated" : "Pending"}
          </Badge>
        </div>
      ))}
    </div>
  );
}
