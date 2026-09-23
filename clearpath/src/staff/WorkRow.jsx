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

export function PageMap({ items }) {
  return (
    <nav className="page-map" aria-label="On this page">
      <p className="page-map-label">On this page</p>
      <ol>
        {items.map((item) => (
          <li key={item.id}>
            <a href={`#${item.id}`}>{item.label}</a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function Fold({ id, title, hint, children, open }) {
  return (
    <details className="fold" id={id} open={open}>
      <summary>
        <span>{title}</span>
        {hint && <span className="fold-hint">{hint}</span>}
      </summary>
      <div className="fold-body">{children}</div>
    </details>
  );
}

export function Section({ id, kicker, title, children, empty }) {
  const content = Children.toArray(children).filter(Boolean);
  return (
    <section className="role-section" id={id}>
      {kicker && <p className="kicker">{kicker}</p>}
      {title && <h2 className="role-h">{title}</h2>}
      {content.length ? <div className="work-list">{content}</div> : (
        empty ? <p className="small muted">{empty}</p> : null
      )}
    </section>
  );
}

/** Search, not a roster. Names are how you find work, not the work. */
export function FindPerson({ patients, onRefresh, variant = "details", onPick }) {
  const [q, setQ] = useState("");
  const [record, setRecord] = useState(null);
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    return (patients || []).filter((p) =>
      [p.name, p.situation, p.summary, p.room, p.department].some((v) => (v || "").toLowerCase().includes(s))
    ).slice(0, 8);
  }, [q, patients]);

  const field = (
    <>
      <input
        className="field"
        id={variant === "bar" ? "patient-lookup" : undefined}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Name, room, or what's going on"
        aria-label="Look up a patient"
        autoComplete="off"
      />
      {hits.length > 0 && (
        <div className={variant === "bar" ? "lookup-hits" : "stack"} style={variant === "bar" ? undefined : { gap: 8, marginTop: 8 }}>
          {hits.map((p) => (
            <button key={p.id} type="button" className="work-copy" onClick={() => { if (onPick) { onPick(p); setQ(""); return; } setRecord(p); setQ(""); }} style={{ padding: "8px 0" }}>
              <span className="work-title">{p.name}</span>
              <span className="small muted">{p.now?.waitingFor || p.action?.label}</span>
            </button>
          ))}
        </div>
      )}
      {q.trim().length >= 2 && !hits.length && <p className="small muted" style={{ margin: "8px 0 0" }}>No match.</p>}
    </>
  );

  return (
    <>
      {variant === "bar" ? (
        <div className="lookup-bar" id="lookup">
          <label className="lookup-label" htmlFor="patient-lookup">Look up a patient</label>
          {field}
        </div>
      ) : (
        <details className="role-rest" id="lookup">
          <summary>Look up a patient</summary>
          <div className="stack" style={{ gap: 8, marginTop: 10 }}>{field}</div>
        </details>
      )}
      {record && (
        <Modal title={record.name} onClose={() => setRecord(null)}>
          <PatientCard patient={record} onRefresh={onRefresh} />
        </Modal>
      )}
    </>
  );
}
