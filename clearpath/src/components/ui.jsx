export function Badge({ children, tone = "" }) {
  return <span className={`badge ${tone}`.trim()}>{children}</span>;
}

export function Button({ children, variant = "", size = "", block, className = "", ...props }) {
  return (
    <button
      className={`btn ${variant} ${size} ${block ? "block" : ""} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}

export function Card({ children, className = "" }) {
  return <section className={`card ${className}`.trim()}>{children}</section>;
}

export function Empty({ title, body }) {
  return (
    <div className="empty">
      <h3 className="display" style={{ fontSize: 22 }}>{title}</h3>
      {body && <p className="lede" style={{ textAlign: "center" }}>{body}</p>}
    </div>
  );
}

export function Modal({ title, onClose, children }) {
  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="spread" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">Close</Button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, ...props }) {
  return (
    <label className="stack" style={{ gap: 6 }}>
      {label && <span className="kicker" style={{ margin: 0 }}>{label}</span>}
      <input className="field" {...props} />
    </label>
  );
}
