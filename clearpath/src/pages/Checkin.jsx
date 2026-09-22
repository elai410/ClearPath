import { Badge, Button, Card, Field } from "../components/ui.jsx";
import { useLang } from "../lib/i18n/LanguageContext.jsx";

export default function Checkin({ dept, patient, name, setName, phone, setPhone, ui, loading, onCheckin, onBack }) {
  const { t } = useLang();
  return (
    <div className="stack">
      <Card>
        <p className="kicker">{ui.label_routed}</p>
        <h2 className="display">{dept.name}</h2>
        <p className="lede">
          {ui.label_floor} {dept.floor} · {ui.label_room} {dept.room}
        </p>
        <p className="small muted" style={{ marginTop: 8 }}>{patient.reason}</p>
        <div className="row" style={{ marginTop: 12 }}>
          <Badge tone={patient.urgency}>{patient.urgency} {ui.urgency_label}</Badge>
          {patient.detectedLanguage && <Badge tone="accent">{patient.detectedLanguage}</Badge>}
          {patient.sentiment && <Badge>{patient.sentiment}</Badge>}
        </div>
      </Card>

      <Card>
        <p className="kicker">{t("ui.journey.next")}</p>
        <ol className="small" style={{ margin: 0, paddingLeft: 18, color: "var(--ink-2)", lineHeight: 1.7 }}>
          <li>{t("ui.checkin.next.1")}</li>
          <li>{t("ui.checkin.next.2", { room: dept.room })}</li>
          <li>{t("ui.checkin.next.3")}</li>
        </ol>
      </Card>

      <Card>
        <div className="stack">
          <Field label={ui.label_name} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("ui.checkin.namePlaceholder")} autoComplete="name" />
          <Field label={ui.label_phone} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t("ui.checkin.phonePlaceholder")} type="tel" autoComplete="tel" />
        </div>
      </Card>

      <Button onClick={onCheckin} disabled={loading} block>
        {loading ? t("ui.btn.checkingIn") : ui.btn_checkin}
      </Button>
      <Button onClick={onBack} variant="ghost" block>{ui.back}</Button>
    </div>
  );
}
