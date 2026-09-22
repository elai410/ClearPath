import { Children, useMemo, useState } from "react";
import PatientCard from "../components/PatientCard.jsx";
import { Button, Modal } from "../components/ui.jsx";

/**
 * One row, one reason, one action. Extra context stays behind More.
 * Role screens share this so a nurse and a doctor see the same object
 * in different lists, not different widgets.
 */
export default function WorkRow({
  title,
  detail,
  meta,
  tone,
  action,
  busy,
  onOpen,
  children,
}) {
  const [more, setMore] = useState(false);
  const extra = Children.toArray(children).filter(Boolean);
  const Copy = onOpen ? "button" : "div";

  return (
    <div className={`work-row ${tone || ""}`}>
      <div className="work-main">
        <Copy
          className="work-copy"
          type={onOpen ? "button" : undefined}
          onClick={onOpen}
        >
          <span className="work-title">{title}</span>
          {detail && <span className="work-detail">{detail}</span>}
          {meta && <span className="small muted">{meta}</span>}
        </Copy>
        <div className="work-act">
          {action?.label && (
            <Button size="sm" disabled={busy} onClick={action.onClick}>
              {action.label}
            </Button>
          )}
          {extra.length > 0 && (
            <button type="button" className="work-more" onClick={() => setMore((v) => !v)}>
              {more ? "Less" : "More"}
            </button>
          )}
        </div>
      </div>
      {more && extra.length > 0 && <div className="work-extra">{extra}</div>}
    </div>
  );
}

export function Section({ kicker, title, children, empty }) {
  const content = Children.toArray(children).filter(Boolean);
  return (
    <section className="role-section">
      {kicker && <p className="kicker">{kicker}</p>}
      {title && <h2 className="role-h">{title}</h2>}
      {content.length ? <div className="work-list">{content}</div> : (
        empty ? <p className="small muted">{empty}</p> : null
      )}
    </section>
  );
}

/** Search, not a roster. Names are how you find work, not the work. */
export function FindPerson({ patients, onRefresh }) {
  const [q, setQ] = useState("");
  const [record, setRecord] = useState(null);
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    return (patients || []).filter((p) =>
      [p.name, p.situation, p.summary, p.room, p.department].some((v) => (v || "").toLowerCase().includes(s))
    ).slice(0, 8);
  }, [q, patients]);

  return (
    <>
      <details className="role-rest">
        <summary>Find a person</summary>
        <div className="stack" style={{ gap: 8, marginTop: 10 }}>
          <input
            className="field"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name, situation, or room"
            aria-label="Find a person"
          />
          {hits.map((p) => (
            <button key={p.id} type="button" className="work-copy" onClick={() => setRecord(p)} style={{ padding: "8px 0" }}>
              <span className="work-title">{p.name}</span>
              <span className="small muted">{p.now?.waitingFor || p.action?.label}</span>
            </button>
          ))}
          {q.trim().length >= 2 && !hits.length && <p className="small muted">No match.</p>}
        </div>
      </details>
      {record && (
        <Modal title={record.name} onClose={() => setRecord(null)}>
          <PatientCard patient={record} onRefresh={onRefresh} />
        </Modal>
      )}
    </>
  );
}
