import { useCallback, useEffect, useState } from "react";
import {
  captureEvidence, correctEvidence, fetchAgent, fetchEvidence, fetchPatients, rejectEvidence, tickAgent, verifyEvidence, verifyEvidenceBatch,
} from "../api/backend.js";
import { EvidenceDrawer } from "../components/EvidenceDrawer.jsx";
import { Button, Card, Empty } from "../components/ui.jsx";

const ROUND = "Pulse 72. SpO2 98%. Blood pressure 118 over 76. Temperature 36.6. Respiratory rate 16.";

export function AgentFloor({ agent, onTick }) {
  const [busy, setBusy] = useState(false);
  if (!agent) return null;

  async function listen() {
    setBusy(true);
    try {
      await tickAgent();
      onTick?.();
    } catch {
      /* the stream stays */
    }
    setBusy(false);
  }

  return (
    <Card className="trajectory">
      <p className="kicker">Passive vitals agent</p>
      <h2 style={{ margin: "0 0 6px", fontSize: 22 }}>
        Watching {agent.watching} beds. {agent.silent} are quiet.
      </h2>
      <p className="small muted" style={{ margin: "0 0 12px" }}>
        Ordinary values stay on the stream. Only a change that matters becomes work, still unverified.
      </p>
      <div className="bed-grid">
        {agent.beds.map((bed) => (
          <div key={bed.patientId} className={`bed-row ${bed.watching ? (bed.exception ? "exception" : "quiet") : "off"}`}>
            <div className="spread">
              <strong>{bed.name}</strong>
              <span className="small muted">
                {!bed.watching ? "no monitor" : bed.exception ? "exception" : "quiet"}
              </span>
            </div>
            <div className="vital-row">
              {(bed.vitals || []).map((v) => (
                <span key={v.measure} className={`vital-chip ${v.consequential ? "hot" : ""}`}>{v.display}</span>
              ))}
              {bed.watching && !(bed.vitals || []).length && <span className="small muted">Waiting on first frame</span>}
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12 }}>
        <Button size="sm" disabled={busy} onClick={listen}>
          {busy ? "Listening…" : "Listen now"}
        </Button>
        <span className="small muted" style={{ marginLeft: 10 }}>
          Tick {agent.tick}. The agent already runs on its own. This just advances the demo clock.
        </span>
      </div>
    </Card>
  );
}

export function CaptureRound({ onDone }) {
  const [patients, setPatients] = useState([]);
  const [patientId, setPatientId] = useState("");
  const [text, setText] = useState(ROUND);
  const [created, setCreated] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchPatients()
      .then((list) => {
        setPatients(list);
        setPatientId(list[0]?.id || "");
      })
      .catch(() => {});
  }, []);

  async function capture() {
    if (!patientId || !text.trim()) return;
    setBusy(true);
    try {
      const data = await captureEvidence(patientId, text, "nurse");
      setCreated(data.claims);
      onDone();
    } catch {
      setCreated([]);
    }
    setBusy(false);
  }

  return (
    <details className="card">
      <summary className="small">Room has no monitor — capture a spoken round</summary>
      <p className="small muted" style={{ margin: "8px 0 10px" }}>
        Speak or paste the measurements. They land as captured, not verified. Nothing here is written as fact.
      </p>
      <div className="stack" style={{ gap: 8 }}>
        <select className="field" value={patientId} onChange={(e) => setPatientId(e.target.value)} aria-label="Patient">
          {patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <textarea className="field" rows={3} value={text} onChange={(e) => setText(e.target.value)} aria-label="What was said" />
        <Button disabled={busy || !patientId} onClick={capture}>Capture round</Button>
      </div>
      {created && (
        <ul className="lineage" style={{ marginTop: 12 }}>
          {created.map((claim) => (
            <li key={claim.id}>
              <span className={`ep ${claim.epistemic?.tone || "candidate"}`}>{claim.epistemic?.label}</span>
              <strong>{claim.display}</strong>
            </li>
          ))}
          {!created.length && <li><span className="small muted">Nothing in that sentence could be structured.</span></li>}
        </ul>
      )}
    </details>
  );
}

/** One captured value. Confirming it is not treating. Correcting keeps the chain. */
export function ClaimCard({ claim, actor = "staff", busy, onDone }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(claim.display);
  const [why, setWhy] = useState(false);

  return (
    <Card className={`handoff-group ${claim.consequential ? "constraint resource" : ""}`.trim()}>
      <div className="spread">
        <div>
          <p className="kicker" style={{ margin: 0 }}>
            {claim.kind === "intent" ? "Intention heard" : claim.evidence?.agent ? "Monitor spoke" : "Observation captured"}
            {claim.evidence?.synthetic && !claim.evidence?.agent ? " · sample" : ""}
          </p>
          <h3 style={{ margin: "4px 0 0", fontSize: 18 }}>{claim.display}</h3>
          <p className="small muted" style={{ margin: "4px 0 0" }}>
            {claim.patient_name || "Unknown patient"} · {claim.authority?.reason}
          </p>
        </div>
        <span className={`ep ${claim.epistemic?.tone || "candidate"}`}>
          {claim.consequential ? "check this one" : claim.epistemic?.label || "Captured"}
        </span>
      </div>
      <p className="small" style={{ margin: "10px 0" }}>
        Evidence: “{claim.evidence?.quote || "none recorded"}”
      </p>
      <div className="row">
        <Button size="sm" disabled={busy} onClick={() => onDone(() => verifyEvidence(claim.id, actor))}>
          {claim.consequential ? "I checked the source" : "Confirm"}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditing((v) => !v)}>Correct</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => onDone(() => rejectEvidence(claim.id, actor, "not accurate"))}>
          Reject
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setWhy(true)}>Why</Button>
      </div>
      {editing && (
        <div className="row" style={{ marginTop: 10 }}>
          <input className="field" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Corrected value" />
          <Button
            size="sm"
            disabled={busy || !draft.trim()}
            onClick={() => onDone(async () => {
              await correctEvidence(claim.id, { ...claim.proposition, display: draft.trim(), value: Number(draft) || undefined }, draft.trim(), actor);
              setEditing(false);
            })}
          >
            Save correction
          </Button>
        </div>
      )}
      {why && <EvidenceDrawer claimId={claim.id} onClose={() => setWhy(false)} />}
    </Card>
  );
}

/**
 * Captured work waiting for a person. The agent already collected the stream.
 * This queue is the exceptions and the spoken rounds, not the vital signs task.
 */
export default function Inbox() {
  const [data, setData] = useState(null);
  const [agent, setAgent] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await fetchEvidence());
    } catch {
      /* keep the last inbox */
    }
    try {
      setAgent(await fetchAgent());
    } catch {
      /* agent is advisory */
    }
  }, []);

  useEffect(() => {
    load();
    const poll = setInterval(load, 10000);
    return () => clearInterval(poll);
  }, [load]);

  async function run(fn) {
    setBusy(true);
    try {
      await fn();
      await load();
    } catch {
      /* the row stays so it can be retried */
    }
    setBusy(false);
  }

  if (!data) return <p className="muted">Loading captured evidence…</p>;

  const open = data.claims.filter((c) => c.status === "unverified");
  const closed = data.claims.filter((c) => c.status !== "unverified");

  return (
    <div>
      <AgentFloor agent={agent} onTick={load} />

      <div className="kpi-grid kpi-4">
        <div className={`kpi ${data.consequential ? "alert" : ""}`}>
          <b>{data.consequential}</b><span>Unverified and consequential</span>
        </div>
        <div className="kpi"><b>{data.unverified}</b><span>Awaiting a person</span></div>
        <div className="kpi"><b>{data.batchable}</b><span>Safe to confirm together</span></div>
        <div className="kpi"><b>{agent ? agent.silent : "—"}</b><span>Beds the agent is leaving alone</span></div>
      </div>

      <CaptureRound onDone={load} />

      <Card>
        <p className="kicker">Exceptions and spoken captures</p>
        <h2 style={{ margin: "0 0 6px", fontSize: 22 }}>Only what a person still has to look at</h2>
        <p className="small muted" style={{ margin: "0 0 12px" }}>
          Confirming one records that a person checked the source. It does not place an order or change treatment.
          Stable monitor values never appear here.
        </p>
        {data.batchable > 0 && (
          <Button
            disabled={busy}
            onClick={() => run(() => verifyEvidenceBatch(open.filter((c) => c.batch).map((c) => c.id), "staff"))}
          >
            Confirm {data.batchable} ordinary {data.batchable === 1 ? "reading" : "readings"}
          </Button>
        )}
      </Card>

      {open.length === 0 && (
        <Empty title="No exceptions" body="The agent is watching. Quiet beds do not create work." />
      )}

      {open.map((claim) => (
        <ClaimCard key={claim.id} claim={claim} actor="staff" busy={busy} onDone={run} />
      ))}

      {closed.length > 0 && (
        <details className="card">
          <summary className="small">Resolved ({closed.length})</summary>
          {closed.map((claim) => (
            <p key={claim.id} className="small" style={{ margin: "8px 0 0" }}>
              <strong>{claim.display}</strong> · {claim.status}
              {claim.supersedes ? " · replaced an earlier reading" : ""}
            </p>
          ))}
        </details>
      )}
    </div>
  );
}
