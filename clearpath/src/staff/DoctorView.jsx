import { useMemo, useState } from "react";
import { callPatient, prepareDischarge, resolveBlocker } from "../api/backend.js";
import { Card } from "../components/ui.jsx";
import { ClaimCard } from "./Inbox.jsx";
import Handoffs from "./Handoffs.jsx";
import { Worklist, PatientPlan } from "./Planner.jsx";
import WorkRow, { FindPerson, Section } from "./WorkRow.jsx";

const DOC_OWNERS = /attend|physician|consult|cardiolog|surg|psych/i;
const DOC_RES = /attend|cardio|surg|psych|radiolog|consult/i;
const CLOCK = /chest|troponin|acs|interval/i;

export default function DoctorView({ flow, evidence, floor, escalations, onRefresh }) {
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState(null);
  const patients = flow?.patients || [];
  const holds = floor?.agent?.holds || [];
  const claims = (evidence?.claims || []).filter((c) => c.status === "unverified" && c.consequential);
  const lists = (floor?.worklists || []).filter((l) => DOC_RES.test(l.resource || "") || DOC_RES.test(l.label || ""));
  const clockBound = patients.filter((p) => CLOCK.test(`${p.situation || ""} ${p.summary || ""}`));

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
          title: "Provider sign-off",
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
            ? "Clock-bound — seeing them does not shorten a mandatory interval"
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
      <p className="role-lead">
        {claims.length
          ? `${claims.length} unverified reading${claims.length === 1 ? "" : "s"} still cannot be treated as fact.`
          : holds.length
            ? "Departure is held until a person looks at the source."
            : "Nothing unverified is waiting on a physician."}
      </p>

      {holds.length > 0 && (
        <Card className="constraint resource">
          <p className="kicker">Hold — not a diagnosis</p>
          <h2 className="role-h" style={{ marginBottom: 8 }}>Do not start going-home work</h2>
          {holds.map((h) => (
            <p key={h.patientId} className="small" style={{ margin: "0 0 6px" }}>
              <strong>{h.title}</strong>
              {h.reason ? <span className="muted"> — {h.reason}</span> : null}
            </p>
          ))}
        </Card>
      )}

      {clockBound.length > 0 && (
        <Card className="trajectory">
          <p className="kicker">Clock-bound</p>
          <h2 className="role-h" style={{ marginBottom: 6 }}>Expediting a queue will not move these visits</h2>
          <p className="small muted" style={{ margin: 0 }}>
            {floor?.clockBoundPatients || clockBound.length} visit{(floor?.clockBoundPatients || clockBound.length) === 1 ? " sits" : "s sit"} on a mandatory interval
            (serial troponin, observation). The scanner being free does not buy time.
          </p>
        </Card>
      )}

      <section className="role-section">
        <p className="kicker">Evidence</p>
        <h2 className="role-h">What not to treat as fact yet</h2>
        {claims.length === 0 && <p className="small muted">No consequential unverified values.</p>}
        {claims.map((claim) => (
          <ClaimCard key={claim.id} claim={claim} actor="attending" busy={busy} onDone={run} />
        ))}
      </section>

      <Section kicker="Clinical work" title="Sign-off, consults, see-now" empty="No physician-owned work is waiting.">
        {work.map((row) => (
          <WorkRow key={row.id} {...row} busy={busy} />
        ))}
      </Section>

      {lists.length > 0 && (
        <section className="role-section">
          <p className="kicker">Your queues — least float first</p>
          <h2 className="role-h">Not arrival order</h2>
          {lists.map((list) => (
            <Worklist
              key={list.resource}
              list={list}
              onOpenPatient={(id, name) => setPlan({ id, name })}
            />
          ))}
        </section>
      )}

      <section className="role-section">
        <p className="kicker">Waiting on physicians</p>
        <h2 className="role-h">Overdue consults and sign-offs</h2>
        <Handoffs data={escalations} owners={DOC_OWNERS} onChanged={onRefresh} />
      </section>

      <FindPerson patients={patients} onRefresh={onRefresh} />

      {plan && (
        <PatientPlan patientId={plan.id} name={plan.name} onClose={() => setPlan(null)} />
      )}
    </div>
  );
}
