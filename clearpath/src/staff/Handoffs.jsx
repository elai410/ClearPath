import { useCallback, useEffect, useMemo, useState } from "react";
import { ackEscalation, fetchEscalations, resolveBlocker, sweepEscalations } from "../api/backend.js";
import { Badge, Button, Card, Empty } from "../components/ui.jsx";

/**
 * Grouped by the team that owns the work, not by patient. A department can open
 * one card and see everything the hospital is waiting on them for.
 */
export default function Handoffs({ onOpenPatient, data: injected, owners, onChanged }) {
  const [local, setLocal] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    if (injected) {
      await onChanged?.();
      return;
    }
    try {
      setLocal(await fetchEscalations());
    } catch {
      /* keep last good snapshot */
    }
  }, [injected, onChanged]);

  useEffect(() => {
    if (injected) return undefined;
    load();
    const poll = setInterval(load, 10000);
    return () => clearInterval(poll);
  }, [injected, load]);

  async function act(id, fn) {
    setBusy(id);
    try {
      await fn();
      await load();
    } catch {
      /* leave the row in place so it can be retried */
    }
    setBusy(null);
  }

  const raw = injected || local;
  const data = useMemo(() => {
    if (!raw) return null;
    if (!owners) return raw;
    const groups = (raw.groups || []).filter((g) => owners.test(g.owner));
    return {
      ...raw,
      groups,
      total: groups.reduce((n, g) => n + g.items.length, 0),
      unacknowledged: groups.reduce((n, g) => n + (g.unacknowledged || 0), 0),
    };
  }, [raw, owners]);

  if (!data) return <p className="muted">Loading open handoffs…</p>;

  if (data.total === 0) {
    return (
      <Empty
        title="Nothing overdue"
        body="Every dependency is inside its expected window. Overdue work lands here automatically with the owning team attached."
      />
    );
  }

  return (
    <div>
      <div className="kpi-grid">
        <div className={`kpi ${data.unacknowledged ? "alert" : ""}`}>
          <b>{data.unacknowledged}</b><span>Unacknowledged</span>
        </div>
        <div className="kpi"><b>{data.total}</b><span>Open escalations</span></div>
        <div className="kpi"><b>{data.groups.length}</b><span>Teams involved</span></div>
      </div>

      {data.groups.map((group) => (
        <Card key={group.owner} className="handoff-group">
          <div className="spread" style={{ marginBottom: 10 }}>
            <div>
              <p className="kicker" style={{ margin: 0 }}>Waiting on</p>
              <h2 style={{ margin: "2px 0 0", fontSize: 20 }}>{group.owner}</h2>
            </div>
            <div className="row" style={{ gap: 8 }}>
              {group.unacknowledged > 0 && (
                <Badge tone="high">{group.unacknowledged} unanswered</Badge>
              )}
              <Badge>{group.items.length} open</Badge>
            </div>
          </div>

          {group.items.map((item) => (
            <div className="esc-row" key={item.id}>
              <div className={`esc-level l${Math.min(item.level, 3)}`} title={item.rung_label}>
                L{item.level}
              </div>
              <div className="esc-body">
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  {item.blocker_title}
                  {item.urgency === "high" && <Badge tone="high">high</Badge>}
                </div>
                <div className="small">
                  {item.patient_name} · {item.department_name} · {item.elapsed_minutes}m elapsed
                  {item.over_by > 0 && ` · ${item.over_by}m over`}
                </div>
                {item.acknowledged ? (
                  <div className="small ok">{item.rung_label} · picked up by {item.acknowledged_by}</div>
                ) : (
                  <div className="small muted">{item.rung_label} · no answer yet</div>
                )}
              </div>
              <div className="row esc-actions">
                {!item.acknowledged && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy === item.id}
                    onClick={() => act(item.id, () => ackEscalation(item.id, group.owner))}
                  >
                    On it
                  </Button>
                )}
                <Button
                  size="sm"
                  disabled={busy === item.id}
                  onClick={() => act(item.id, () => resolveBlocker(item.blocker_id))}
                >
                  Done
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onOpenPatient?.(item.patient_id)}>
                  Patient
                </Button>
              </div>
            </div>
          ))}
        </Card>
      ))}

      <p className="small muted" style={{ marginTop: 12 }}>
        Escalations are raised automatically when a dependency runs past its expected window.
        High-urgency patients escalate sooner.{" "}
        <button className="linkish" type="button" onClick={() => act("sweep", sweepEscalations)}>
          Check now
        </button>
      </p>
    </div>
  );
}
