import { useCallback, useEffect, useState } from "react";
import {
  captureEvidence, correctEvidence, fetchAgent, fetchEvidence, fetchPatients, rejectEvidence, tickAgent, verifyEvidence, verifyEvidenceBatch,
} from "../api/backend.js";
import { EvidenceDrawer } from "../components/EvidenceDrawer.jsx";
import { Button, Card, Empty } from "../components/ui.jsx";

const ROUND = "Pulse 72. SpO2 98%. Blood pressure 118 over 76. Temperature 36.6. Respiratory rate 16.";

export function AgentFloor({ agent, onTick, compact }) {
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
    <Card className={`trajectory ${compact ? "agent-compact" : ""}`.trim()}>
      <p className="kicker">Monitors</p>
      <h2 style={{ margin: compact ? "0 0 8px" : "0 0 6px", fontSize: compact ? 18 : 22 }}>
        Watching {agent.watching} beds. {agent.silent} look fine.
      </h2>
      {!compact && (
        <p className="small muted" style={{ margin: "0 0 12px" }}>
          Normal numbers stay on the board. Only a change that matters shows up for you to check.
        </p>
      )}
      <div className="bed-grid">
        {agent.beds.map((bed) => (
          <div key={bed.patientId} className={`bed-row ${bed.watching ? (bed.exception ? "exception" : "quiet") : "off"}`}>
            <div className="spread">
              <strong>{bed.name}</strong>
              <span className="small muted">
                {!bed.watching ? "no monitor" : bed.exception ? "flag" : "ok"}
              </span>
            </div>
            <div className="vital-row">
              {(bed.vitals || []).map((v) => (
                <span key={v.measure} className={`vital-chip ${v.consequential ? "hot" : ""}`}>{v.display}</span>
              ))}
              {bed.watching && !(bed.vitals || []).length && <span className="small muted">Waiting for the first reading</span>}
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: compact ? 10 : 12 }}>
        <Button size="sm" disabled={busy} onClick={listen}>
          {busy ? "Checking…" : "Check now"}
        </Button>
        <span className="small muted" style={{ marginLeft: 10 }}>
          {compact
            ? `Update ${agent.tick}`
            : `Update ${agent.tick}. The monitors already run on their own — this just jumps the demo ahead.`}
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
    <details className="card" id="rooms">
      <summary className="small">Room has no monitor — enter vitals</summary>
      <p className="small muted" style={{ margin: "8px 0 10px" }}>
        Type what you heard. We&apos;ll log it so someone can confirm.
      </p>
      <div className="stack" style={{ gap: 8 }}>
        <select className="field" value={patientId} onChange={(e) => setPatientId(e.target.value)} aria-label="Patient">
          {patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <textarea className="field" rows={3} value={text} onChange={(e) => setText(e.target.value)} aria-label="What was said" />
        <Button disabled={busy || !patientId} onClick={capture}>Save vitals</Button>
      </div>
      {created && (
        <ul className="lineage" style={{ marginTop: 12 }}>
          {created.map((claim) => (
            <li key={claim.id}>
              <span className={`ep ${claim.epistemic?.tone || "candidate"}`}>{claim.epistemic?.label}</span>
              <strong>{claim.display}</strong>
            </li>
          ))}
          {!created.length && <li><span className="small muted">Couldn&apos;t pick out numbers in that.</span></li>}
        </ul>
      )}
    </details>
  );
}

/** One captured value. Confirming it is not treating. Correcting keeps the chain. */
export function ClaimCard({ claim, actor = "staff", busy, onDone, compact }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(claim.display);
  const [why, setWhy] = useState(false);

  return (
    <Card className={`handoff-group ${claim.consequential ? "constraint resource" : ""} ${compact ? "claim-compact" : ""}`.trim()}>
      <div className="spread">
        <div>
          {!compact && (
            <p className="kicker" style={{ margin: 0 }}>
              {claim.kind === "intent" ? "They asked for this" : claim.evidence?.agent ? "From the monitor" : "From the room"}
              {claim.evidence?.synthetic && !claim.evidence?.agent ? " · sample" : ""}
            </p>
          )}
          <h3 style={{ margin: compact ? "0" : "4px 0 0", fontSize: compact ? 16 : 18 }}>{claim.display}</h3>
          <p className="small muted" style={{ margin: "4px 0 0" }}>
            {claim.patient_name || "Unknown patient"}
            {!compact && claim.authority?.reason ? ` · ${claim.authority.reason}` : ""}
          </p>
        </div>
        <span className={`ep ${claim.epistemic?.tone || "candidate"}`}>
          {claim.consequential ? "Needs a look" : claim.epistemic?.label || "Needs a look"}
        </span>
      </div>
      {!compact && (
        <p className="small" style={{ margin: "10px 0" }}>
          What we heard: “{claim.evidence?.quote || "nothing recorded"}”
        </p>
      )}
      <div className="row" style={compact ? { marginTop: 8 } : undefined}>
        <Button size="sm" disabled={busy} onClick={() => onDone(() => verifyEvidence(claim.id, actor))}>
          {claim.consequential ? "I looked at this" : "Looks right"}
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

  if (!data) return <p className="muted">Loading readings…</p>;

  const open = data.claims.filter((c) => c.status === "unverified");
  const closed = data.claims.filter((c) => c.status !== "unverified");

  return (
    <div>
      <AgentFloor agent={agent} onTick={load} />

      <div className="kpi-grid kpi-4">
        <div className={`kpi ${data.consequential ? "alert" : ""}`}>
            <b>{data.consequential}</b><span>Abnormal — still needs a look</span>
          </div>
          <div className="kpi"><b>{data.unverified}</b><span>Needs a look</span></div>
          <div className="kpi"><b>{data.batchable}</b><span>Normal, OK to batch</span></div>
          <div className="kpi"><b>{agent ? agent.silent : "—"}</b><span>Beds that look fine</span></div>
      </div>

      <CaptureRound onDone={load} />

      <Card>
        <p className="kicker">Flags and spoken vitals</p>
        <h2 style={{ margin: "0 0 6px", fontSize: 22 }}>Only what still needs a look</h2>
        <p className="small muted" style={{ margin: "0 0 12px" }}>
          Confirming just means you looked. It doesn&apos;t place an order or change treatment.
          Beds that look fine don&apos;t show up here.
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
        <Empty title="Nothing to check" body="The beds that look fine don't show up here." />
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
