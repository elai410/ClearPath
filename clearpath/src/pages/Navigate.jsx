import { QRCodeSVG as QRCode } from "qrcode.react";
import FloorPlan from "../components/FloorPlan.jsx";
import { Button, Card } from "../components/ui.jsx";

export default function Navigate({ dept, patient, ui, onArrived }) {
  return (
    <div className="stack">
      <Card>
        <p className="kicker">{ui.label_routed}</p>
        <h2 className="display">{dept.name}</h2>
        <p className="lede">{ui.label_floor} {dept.floor} · {ui.label_room} {dept.room}</p>
      </Card>

      <FloorPlan activeRoom={dept.id} />

      <Card>
        <p className="kicker">{ui.label_directions}</p>
        <ol className="small" style={{ margin: 0, paddingLeft: 18, color: "var(--ink-2)", lineHeight: 1.75 }}>
          {(ui.directions || []).map((d, i) => <li key={i}>{d}</li>)}
        </ol>
      </Card>

      {patient?.id && (
        <Card>
          <p className="kicker">{ui.label_qr}</p>
          <div style={{ display: "flex", justifyContent: "center", padding: "8px 0" }}>
            <QRCode value={`${location.origin}/?resume=${patient.id}`} size={132} bgColor="#fffcf7" fgColor="#1c1917" />
          </div>
          <p className="small muted" style={{ textAlign: "center", margin: 0 }}>{ui.label_qr_sub}</p>
        </Card>
      )}

      <Button onClick={onArrived} block>{ui.btn_arrived}</Button>
    </div>
  );
}
