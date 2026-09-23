import { useState } from "react";
import {
  advancePatient, aiBrief, aiDischargeDraft, callPatient, dischargePatient,
  escalateBlocker, movePatient, prepareDischarge, resolveBlocker, updateStatus,
  STATUS_LABELS,
} from "../api/backend.js";
import { DEPT_LIST, DEPT_NAMES, DEPT_ROOM } from "../constants.js";
import { formatWait } from "../lib/journey.js";
import { Badge, Button, Modal } from "./ui.jsx";
import { BlockerList } from "./JourneyTimeline.jsx";

export default function PatientCard({ patient, onRefresh }) {
  const [expanded, setExpanded] = useState(false);
  const [showMove, setShowMove] = useState(false);
  const [moveDept, setMoveDept] = useState("");
  const [showDischarge, setShowDischarge] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [brief, setBrief] = useState(null);
  const [busy, setBusy] = useState(false);
  const [draftNote, setDraftNote] = useState("");

  const stuck = patient.is_stuck;
  const ready = patient.action?.kind === "advance";

  async function run(fn) {
    setBusy(true);
    try {
      await fn();
      onRefresh();
    } catch {
      /* keep UI usable */
    }
    setBusy(false);
  }

  async function handleBrief() {
    setBusy(true);
    try {
      setBrief(await aiBrief(patient.id));
    } catch {
      setBrief({ text: "Could not generate a brief." });
    }
    setBusy(false);
  }

  async function handleDraft() {
    setBusy(true);
    try {
      const draft = await aiDischargeDraft(patient.id, draftNote);
      setInstructions(draft.text);
      setDraftNote(draft.disclaimer || "");
      setShowDischarge(true);
    } catch {
      setShowDischarge(true);
    }
    setBusy(false);
  }

  return (
    <article className={`pcard ${stuck ? "stuck" : ready ? "ready" : ""}`}>
      {stuck && (
        <div className="stuck-banner">
          Delayed {formatWait(patient.wait_minutes)}
          {patient.now?.waitingFor ? ` · waiting on ${patient.now.waitingFor}` : ""}
          {patient.now?.owner ? ` · ${patient.now.owner}` : ""}
        </div>
      )}

      <div className="spread" style={{ alignItems: "flex-start" }}>
        <div>
          <div className="row">
            <strong style={{ fontSize: 16 }}>{patient.name}</strong>
            <Badge tone={patient.urgency}>{patient.urgency}</Badge>
            <Badge tone="accent">{STATUS_LABELS[patient.status] || patient.status}</Badge>
            {patient.sentiment && <Badge>{patient.sentiment}</Badge>}
            {patient.language && !/^english$/i.test(patient.language) && (
              <Badge tone="violet">{patient.language}</Badge>
            )}
          </div>
          <p className="small muted" style={{ margin: "4px 0 0" }}>
            {DEPT_NAMES[patient.department]} · {formatWait(patient.wait_minutes)} · next: {patient.next_stage?.label}
          </p>
          {patient.summary && (
            <p className="small" style={{ margin: "8px 0 0", color: "var(--ink-2)" }}>{patient.summary}</p>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Less" : "Details"}
        </Button>
      </div>

      {patient.action && (
        <div className="action-reason">
          <strong>{patient.action.label}.</strong> {patient.action.reason}
        </div>
      )}

      {patient.blockers?.filter((b) => b.status !== "resolved").length > 0 && (
        <BlockerList blockers={patient.blockers} compact />
      )}

      {expanded && (
        <div className="card" style={{ marginTop: 12, boxShadow: "none", background: "var(--surface-2)" }}>
          <p className="kicker">Original situation</p>
          <p className="small" style={{ margin: "0 0 8px" }}>{patient.situation}</p>
          {patient.sentimentNote && <p className="small muted">“{patient.sentimentNote}”</p>}

          {/* Coordination advice written for staff — the patient sees their own
              second-person version of this on their visit page. */}
          {patient.parallel?.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <p className="kicker">Doesn't need them in the room</p>
              {patient.parallel.map((p) => (
                <div key={p.id} style={{ marginBottom: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{p.title}</div>
                  <div className="small muted">{p.detail}</div>
                </div>
              ))}
            </div>
          )}
          {brief && (
            <p className="small" style={{ marginTop: 10 }}>
              <strong>Brief.</strong> {brief.text}
              {brief.source === "ai" && <span className="muted"> · AI assist</span>}
            </p>
          )}
        </div>
      )}

      <div className="row" style={{ marginTop: 12 }}>
        {(patient.status === "waiting" || patient.urgency === "high") && (
          <Button size="sm" onClick={() => run(() => callPatient(patient.id))} disabled={busy}>Call now</Button>
        )}
        {patient.action?.kind === "advance" && (
          <Button size="sm" variant="sage" onClick={() => run(() => advancePatient(patient.id))} disabled={busy}>Advance</Button>
        )}
        {patient.action?.kind === "prepare-discharge" && (
          <Button size="sm" variant="soft" onClick={() => run(() => prepareDischarge(patient.id))} disabled={busy}>Start discharge paperwork</Button>
        )}
        {patient.action?.blockerId && (
          <>
            <Button size="sm" variant="warn" onClick={() => run(() => escalateBlocker(patient.action.blockerId))} disabled={busy}>Escalate</Button>
            <Button size="sm" variant="sage" onClick={() => run(() => resolveBlocker(patient.action.blockerId))} disabled={busy}>Mark done</Button>
          </>
        )}
        <Button size="sm" variant="ghost" onClick={handleBrief} disabled={busy}>Handoff note</Button>
        <Button size="sm" variant="ghost" onClick={() => setShowMove((v) => !v)}>Move</Button>
        <Button size="sm" variant="ghost" onClick={handleDraft} disabled={busy}>Discharge</Button>
      </div>

      {patient.open_blocker_count > 0 && expanded && (
        <div className="row" style={{ marginTop: 8 }}>
          {patient.blockers.filter((b) => b.status !== "resolved").map((b) => (
            <Button key={b.id} size="sm" variant="ghost" onClick={() => run(() => resolveBlocker(b.id))} disabled={busy}>
              Resolve {b.type_label || b.title}
            </Button>
          ))}
        </div>
      )}

      <div className="row" style={{ marginTop: 10 }}>
        <span className="small muted">Status</span>
        <select
          className="select"
          style={{ flex: 1, padding: "8px 10px" }}
          value={patient.status}
          disabled={busy}
          onChange={(e) => run(() => updateStatus(patient.id, e.target.value))}
        >
          {Object.entries(STATUS_LABELS).filter(([k]) => k !== "discharged").map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
      </div>

      {showMove && (
        <div className="row" style={{ marginTop: 10 }}>
          <select className="select" value={moveDept} onChange={(e) => setMoveDept(e.target.value)} style={{ flex: 1 }}>
            <option value="">Move to…</option>
            {DEPT_LIST.filter((d) => d !== patient.department).map((d) => (
              <option key={d} value={d}>{DEPT_NAMES[d]}</option>
            ))}
          </select>
          <Button size="sm" onClick={() => {
            const dest = DEPT_ROOM[moveDept];
            run(() => movePatient(patient.id, moveDept, dest.room, dest.floor, `Transferred to ${DEPT_NAMES[moveDept]}`));
            setShowMove(false);
          }} disabled={!moveDept || busy}>Move</Button>
        </div>
      )}

      {showDischarge && (
        <Modal title={`Discharge ${patient.name}`} onClose={() => setShowDischarge(false)}>
          {draftNote && <p className="small muted" style={{ marginTop: 0 }}>{draftNote}</p>}
          <textarea
            className="field"
            rows={6}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Discharge instructions the patient will see…"
          />
          <div className="row" style={{ marginTop: 12, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => setShowDischarge(false)}>Cancel</Button>
            <Button onClick={() => run(async () => {
              await dischargePatient(patient.id, instructions);
              setShowDischarge(false);
            })}>Confirm discharge</Button>
          </div>
        </Modal>
      )}
    </article>
  );
}
