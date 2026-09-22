import { useEffect, useState } from "react";
import { fetchFollow } from "../api/backend.js";
import { JourneyTimeline, NowCard } from "../components/JourneyTimeline.jsx";
import { Card, Empty } from "../components/ui.jsx";
import { timeline } from "../lib/journey.js";

export default function Follow({ token }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let on = true;
    async function load() {
      try {
        const d = await fetchFollow(token);
        if (on) setData(d);
      } catch {
        if (on) setError(true);
      }
    }
    load();
    const t = setInterval(load, 15000);
    return () => { on = false; clearInterval(t); };
  }, [token]);

  if (error) {
    return (
      <div className="follow-app">
        <Empty title="This link isn't active" body="Ask the patient to share a new companion link from their visit page." />
      </div>
    );
  }

  if (!data) {
    return <div className="follow-app"><p className="muted">Loading visit…</p></div>;
  }

  const journey = {
    ...data,
    now: data.now || data.nowCard,
    wait_minutes: data.wait_minutes ?? data.now?.waitMinutes,
    predicted_remaining: data.predicted_remaining,
  };

  return (
    <div className="follow-app stack">
      <header className="row">
        <span className="logo-mark">＋</span>
        <div>
          <h1 className="brand">ClearPath companion</h1>
          <p className="small muted" style={{ margin: 0 }}>A limited live view for someone waiting with {data.name}</p>
        </div>
      </header>
      <JourneyTimeline items={timeline({ status: data.status, stage: data.stage })} />
      <NowCard journey={journey} />
      {data.operating?.blockedBy && (
        <Card>
          <p className="kicker">What they&apos;re waiting on</p>
          <h2 className="display" style={{ fontSize: 22 }}>{data.operating.blockedBy.label}</h2>
          {data.operating.blockedBy.clock ? (
            <p className="lede">This is a required wait. Other tests won&apos;t shorten it.</p>
          ) : (
            <p className="lede">The rest of the visit is waiting on this step.</p>
          )}
          {data.operating.clockBound && !data.operating.blockedBy.clock && (
            <p className="small muted">A required waiting period is still ahead. Speeding up other tests won&apos;t shorten the visit.</p>
          )}
        </Card>
      )}
      <Card>
        <p className="kicker">Where they are</p>
        <h2 className="display" style={{ fontSize: 22 }}>{data.departmentMeta?.name}</h2>
        <p className="lede">{data.departmentMeta?.room} · Floor {data.departmentMeta?.floor}</p>
      </Card>
      <p className="small muted">This page doesn&apos;t include medical details. It updates as the visit moves.</p>
    </div>
  );
}
