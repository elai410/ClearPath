export default function Care({ dept, ui }) {
  return (
    <div style={S.section}>
      <div style={{ ...S.card, background: "#f0fdf4", border: "2px solid #4ade80", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>🔔</div>
        <h2 style={{ margin: 0, color: "#15803d" }}>{ui.alert_turn}</h2>
        <p style={{ color: "#166534", fontSize: 14, margin: "8px 0 0" }}>
          {ui.alert_room} {dept?.room}
        </p>
      </div>

      <div style={S.card}>
<p style={S.label}>{ui.label_what_to_expect}</p>        <ol style={{ margin: 0, paddingLeft: 20, color: "#334155", fontSize: 14, lineHeight: 1.8 }}>
          {ui.expect.map((e, i) => <li key={i}>{e}</li>)}
          <li>{ui.label_avg_visit} {dept?.wait} {ui.min}</li>
        </ol>
      </div>
    </div>
  );
}

const S = {
  section: { display: "flex", flexDirection: "column", gap: 12 },
  card:    { background: "#fff", borderRadius: 12, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.07)", display: "flex", flexDirection: "column" },
  label:   { fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 4px" },
};