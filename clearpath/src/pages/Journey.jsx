import { useEffect, useState } from "react";
import Concierge from "../components/Concierge.jsx";
import { BlockerList, JourneyTimeline, NowCard } from "../components/JourneyTimeline.jsx";
import { Badge, Button, Card } from "../components/ui.jsx";
import FloorPlan from "../components/FloorPlan.jsx";
import { explainWait, timeline } from "../lib/journey.js";
import { useLang } from "../lib/i18n/LanguageContext.jsx";

export default function Journey({ journey, ui, dept, onArrived, showMap }) {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  if (!journey) return <Card>{t("ui.journey.loading")}</Card>;

  const called = journey.status === "called";
  const shareUrl = journey.share_token
    ? `${location.origin}/follow/${journey.share_token}`
    : null;
  void tick;

  const view = {
    ...journey,
    now: explainWait(journey, journey.blockers || [], dept?.name),
    timeline: timeline(journey),
  };

  return (
    <div className="stack">
      <JourneyTimeline items={view.timeline} />

      {called && (
        <section className="now-card" style={{ background: "var(--sage)" }}>
          <p className="kicker">{t("ui.alert.comeNow")}</p>
          <h2>{ui.alert_turn}</h2>
          <p>{ui.alert_room} {dept?.room}. Give your name at the desk.</p>
        </section>
      )}

      {!called && <NowCard journey={view} />}

      {journey.operating?.clockBound && (
        <Card>
          <p className="kicker">This wait cannot be expedited</p>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55 }}>
            {journey.operating.clockBound.guidance}
          </p>
        </Card>
      )}
      {journey.operating?.blockedBy && !journey.operating.clockBound && (
        <Card>
          <p className="kicker">What going home is waiting on</p>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55 }}>
            {journey.operating.blockedBy.label}
            {journey.operating.blockedBy.why ? ` — ${journey.operating.blockedBy.why}` : ""}
          </p>
        </Card>
      )}

      {view.now?.next && (
        <Card>
          <p className="kicker">{t("ui.journey.next")}</p>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55 }}>{view.now.next}</p>
          {view.now.youDo && <p className="small muted" style={{ marginTop: 8 }}>{view.now.youDo}</p>}
        </Card>
      )}

      <Card>
        <div className="spread">
          <p className="kicker" style={{ margin: 0 }}>{t("ui.journey.holdingUp")}</p>
          <Badge tone={journey.open_blocker_count ? "medium" : "low"}>
            {journey.open_blocker_count ? `${journey.open_blocker_count} open` : "Clear"}
          </Badge>
        </div>
        <div style={{ marginTop: 10 }}>
          <BlockerList blockers={journey.blockers} />
        </div>
      </Card>

      {/*
        `journey.parallel` is deliberately not shown here. Those are staff
        instructions written about the patient in the third person ("pull this
        patient forward"), and they belong on the staff board. Patients get the
        localized, second-person guidance instead.
      */}
      {journey.while_you_wait?.length > 0 && (
        <Card>
          <p className="kicker">{t("ui.journey.parallel")}</p>
          {journey.while_you_wait.map((w) => (
            <p key={w} className="small" style={{ margin: "6px 0 0" }}>· {w}</p>
          ))}
        </Card>
      )}

      {showMap && dept && (
        <>
          <FloorPlan activeRoom={dept.id} />
          {onArrived && <Button onClick={onArrived} block>{ui.btn_arrived}</Button>}
        </>
      )}

      {journey.id && (
        <Concierge
          patientId={journey.id}
          questions={journey.questions}
          hint="Ask about the wait, or get help phrasing a question for your care team."
        />
      )}

      {shareUrl && (
        <Card>
          <p className="kicker">Someone waiting with you?</p>
          <p className="small" style={{ margin: "0 0 10px" }}>
            Share a live, limited view of this visit — where you are, what you're waiting on, and what's next. It does not include your full medical story.
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(shareUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch {
                window.prompt("Copy this link", shareUrl);
              }
            }}
          >
            {copied ? "Link copied" : "Copy companion link"}
          </Button>
        </Card>
      )}
    </div>
  );
}
