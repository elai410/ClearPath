import { Button, Card } from "../components/ui.jsx";

export default function Discharge({ discharge, followUp, ui, loading, onFollowUp, journey }) {
  return (
    <div className="stack">
      <section className="now-card" style={{ background: "var(--sage)" }}>
        <p className="kicker">Visit complete</p>
        <h2>{ui.allset}</h2>
        <p>{ui.thank_you}</p>
      </section>

      {discharge && (
        <Card>
          <p className="kicker">{ui.label_discharge}</p>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{discharge}</p>
        </Card>
      )}

      {journey?.questions?.length > 0 && (
        <Card>
          <p className="kicker">Questions worth asking before you leave</p>
          <ul className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
            {journey.questions.map((q) => <li key={q}>{q}</li>)}
          </ul>
        </Card>
      )}

      {!followUp ? (
        <Button onClick={onFollowUp} disabled={loading} block>
          {loading ? "Writing your reminder…" : ui.btn_followup}
        </Button>
      ) : (
        <Card>
          <p className="kicker">{ui.label_followup_card}</p>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7 }}>{followUp}</p>
        </Card>
      )}
    </div>
  );
}
