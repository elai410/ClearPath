import { useMemo, useState } from "react";
import { callPatient, prepareDischarge, resolveBlocker } from "../api/backend.js";
import { Card } from "../components/ui.jsx";
import { ClaimCard } from "./Inbox.jsx";
import Handoffs from "./Handoffs.jsx";
import { Worklist, PatientPlan } from "./Planner.jsx";
import WorkRow, { FindPerson, PageMap, Section } from "./WorkRow.jsx";

const DOC_OWNERS = /attend|physician|consult|cardiolog|surg|psych/i;
const DOC_RES = /attend|cardio|surg|psych|radiolog|consult/i;
const CLOCK = /chest|troponin|acs|interval/i;

const MAP = [
  { id: "holds", label: "Don't discharge yet" },
  { id: "timer", label: "Waiting on a timer" },
  { id: "readings", label: "Readings to check" },
  { id: "signoff", label: "Sign-off and consults" },
  { id: "board", label: "Your board" },
  { id: "overdue", label: "Running late" },
  { id: "lookup", label: "Look up a patient" },
];

export default function DoctorView({ flow, evidence, floor, escalations, onRefresh }) {
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState(null);
  const patients = flow?.patients || [];
  const holds = floor?.agent?.holds || [];
  const claims = (evidence?.claims || []).filter((c) => c.status === "unverified" && c.consequential);
  const lists = (floor?.worklists || []).filter((l) => DOC_RES.test(l.resource || "") || DOC_RES.test(l.label || ""));
  const clockBound = patients.filter((p) => CLOCK.test(`${p.situation || ""} ${p.summary || ""}`));
  const clockCount = floor?.clockBoundPatients || clockBound.length;

  async function run(fn) {
    setBusy(true);
    try {
      await fn();
      onRefresh();
    } catch { /* keep */ }
    setBusy(false);
  }

  const work = useMemo(() => {
    const rows = [];
    for (const p of patients) {
      if (p.status === "pending_signature") {
        const sig = (p.blockers || []).find((b) => b.type === "signature" && b.status !== "resolved");
        rows.push({
          id: `sign:${p.id}`,
          title: "Needs your sign-off",
          detail: p.name,
          meta: p.now?.waitingFor,
          tone: "",
          action: {
            label: "Sign off",
            onClick: () => run(() => (sig ? resolveBlocker(sig.id) : prepareDischarge(p.id))),
          },
        });
      } else if (p.action?.kind === "escalate" && p.action.blockerId && DOC_OWNERS.test(`${p.now?.owner || ""} ${p.action.label || ""}`)) {
        rows.push({
          id: `esc:${p.id}`,
          title: p.action.label.replace(/^Escalate /i, ""),
          detail: p.name,
          meta: p.action.reason,
          tone: "warn",
          action: { label: "Mark done", onClick: () => run(() => resolveBlocker(p.action.blockerId)) },
        });
      } else if (p.urgency === "high" && p.status === "waiting") {
        rows.push({
          id: `see:${p.id}`,
          title: "High urgency, still in line",
          detail: p.name,
          meta: CLOCK.test(`${p.situation || ""} ${p.summary || ""}`)
            ? "On a required wait — seeing them now won't shorten it"
            : p.action?.reason,
          tone: "warn",
          action: { label: "See now", onClick: () => run(() => callPatient(p.id)) },
        });
      }
    }
    return rows;
  }, [patients]);

  return (
    <div className="role-view">
      <PageMap items={MAP} />
      <p className="role-lead">
        {claims.length
          ? `${claims.length} reading${claims.length === 1 ? "" : "s"} still need someone to look.`
          : holds.length
            ? "Don't send anyone home until these are checked."
            : "Nothing waiting on you that hasn't been checked."}
      </p>

      <section id="holds" className="role-section">
        {holds.length > 0 ? (
          <Card className="constraint resource">
            <p className="kicker">Check this first</p>
            <h2 className="role-h" style={{ marginBottom: 8 }}>Don't discharge them yet</h2>
            {holds.map((h) => (
              <p key={h.patientId} className="small" style={{ margin: "0 0 6px" }}>
                <strong>{h.title}</strong>
                {h.reason ? <span className="muted"> — {h.reason}</span> : null}
              </p>
            ))}
          </Card>
        ) : (
          <>
            <p className="kicker">Don't discharge yet</p>
            <h2 className="role-h">Nobody's on hold</h2>
            <p className="small muted">If a reading still needs a look, it'll show up here.</p>
          </>
        )}
      </section>

      <section id="timer" className="role-section">
        {clockBound.length > 0 || clockCount > 0 ? (
          <Card className="trajectory">
            <p className="kicker">Waiting on a timer</p>
            <h2 className="role-h" style={{ marginBottom: 6 }}>Calling them sooner won't speed this up</h2>
            <p className="small muted" style={{ margin: 0 }}>
              {clockCount} visit{clockCount === 1 ? " is" : "s are"} on a required wait
              (like serial troponin). A free scanner doesn't change that.
            </p>
          </Card>
        ) : (
          <>
            <p className="kicker">Waiting on a timer</p>
            <h2 className="role-h">Nobody's on a required wait</h2>
            <p className="small muted">Chest-pain intervals and other timed waits land here.</p>
          </>
        )}
      </section>

      <section id="readings" className="role-section">
        <p className="kicker">Readings to check</p>
        <h2 className="role-h">Look at these before you treat them as real</h2>
        {claims.length === 0 && <p className="small muted">No odd readings waiting.</p>}
        {claims.map((claim) => (
          <ClaimCard key={claim.id} claim={claim} actor="attending" busy={busy} onDone={run} />
        ))}
      </section>

      <Section id="signoff" kicker="Your work" title="Sign-off, consults, see now" empty="Nothing waiting on a physician.">
        {work.map((row) => (
          <WorkRow key={row.id} {...row} busy={busy} />
        ))}
      </Section>

      <section id="board" className="role-section">
        <p className="kicker">Your board</p>
        <h2 className="role-h">Who has the least time to spare</h2>
        {lists.length === 0 && <p className="small muted">No physician queues right now.</p>}
        {lists.map((list) => (
          <Worklist
            key={list.resource}
            list={list}
            onOpenPatient={(id, name) => setPlan({ id, name })}
          />
        ))}
      </section>

      <section id="overdue" className="role-section">
        <p className="kicker">Waiting on physicians</p>
        <h2 className="role-h">Consults and sign-offs running late</h2>
        <Handoffs data={escalations} owners={DOC_OWNERS} onChanged={onRefresh} />
      </section>

      <FindPerson patients={patients} onRefresh={onRefresh} />

      {plan && (
        <PatientPlan patientId={plan.id} name={plan.name} onClose={() => setPlan(null)} />
      )}
    </div>
  );
}
