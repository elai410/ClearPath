import { useMemo, useState } from "react";
import {
  advancePatient, callPatient, resolveBlocker, verifyEvidenceBatch,
} from "../api/backend.js";
import { AgentFloor, CaptureRound, ClaimCard } from "./Inbox.jsx";
import Handoffs from "./Handoffs.jsx";
import { Worklist, PatientPlan } from "./Planner.jsx";
import WorkRow, { PageMap, Section } from "./WorkRow.jsx";
import { Button } from "../components/ui.jsx";

const NURSE_OWNERS = /nurs|language|transport|admitt|interpreter|him/i;
const NURSE_RES = /nurse|interpret|transport|registration/i;

const MAP = [
  { id: "nursing", label: "Your work" },
  { id: "floor", label: "Monitors and readings" },
  { id: "overdue", label: "Waiting on us" },
  { id: "board", label: "Who's next" },
];

function nurseWork(patient) {
  const open = (patient.blockers || []).filter((b) => b.status !== "resolved");
  const interp = open.find((b) => b.type === "interpreter");
  if (interp) {
    return {
      title: interp.title || "Interpreter",
      detail: patient.name,
      action: { label: "Interpreter here", kind: "resolve", blockerId: interp.id },
    };
  }
  const transport = open.find((b) => b.type === "transport");
  if (transport) {
    return {
      title: transport.title || "Transport",
      detail: patient.name,
      action: { label: "Move them", kind: "resolve", blockerId: transport.id },
    };
  }
  const nurseBlock = open.find((b) => NURSE_OWNERS.test(`${b.owner_role || ""} ${b.type || ""}`));
  if (nurseBlock) {
    return {
      title: nurseBlock.title,
      detail: patient.name,
      action: { label: "Mark done", kind: "resolve", blockerId: nurseBlock.id },
    };
  }
  if (patient.status === "called") {
    return {
      title: "Room is ready",
      detail: patient.name,
      action: { label: "They're here", kind: "advance" },
    };
  }
  if (patient.status === "waiting" && patient.urgency === "high") {
    return {
      title: "High urgency, still in line",
      detail: patient.name,
      action: { label: "Call", kind: "call" },
    };
  }
  return null;
}

function leadLine(work, exceptions, agent) {
  const nWork = work.length;
  const nRead = exceptions.length;
  const workBit = nWork
    ? `${nWork} thing${nWork === 1 ? "" : "s"} in front of you`
    : "Nothing in the work list";
  const readBit = nRead
    ? `${nRead} reading${nRead === 1 ? "" : "s"} still need a look`
    : agent
      ? `${agent.silent} bed${agent.silent === 1 ? "" : "s"} look fine`
      : null;
  if (readBit) return `${workBit}. ${readBit}.`;
  return `${workBit}.`;
}

export default function NurseView({ flow, evidence, agent, escalations, floor, onRefresh }) {
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState(null);
  const patients = flow?.patients || [];
  const openClaims = (evidence?.claims || []).filter((c) => c.status === "unverified");
  const exceptions = openClaims.filter((c) => c.kind === "observation");
  const batchable = exceptions.filter((c) => c.batch);
  const lists = (floor?.worklists || []).filter((l) => NURSE_RES.test(l.resource || "") || NURSE_RES.test(l.label || ""));

  async function run(fn) {
    setBusy(true);
    try {
      await fn();
      onRefresh();
    } catch { /* keep */ }
    setBusy(false);
  }

  const work = useMemo(
    () => patients.map((p) => {
      const item = nurseWork(p);
      if (!item) return null;
      return { id: p.id, ...item, patient: p };
    }).filter(Boolean),
    [patients]
  );

  return (
    <div className="role-view">
      <PageMap items={MAP} />
      <p className="role-lead">{agent || evidence ? leadLine(work, exceptions, agent) : "Loading…"}</p>

      <Section id="nursing" kicker="Your work" title="Interpreters, transport, rooms" empty="Nothing in front of a nurse right now.">
        {work.map((row) => (
          <WorkRow
            key={row.id}
            title={row.title}
            detail={row.detail}
            action={{
              label: row.action.label,
              onClick: () => run(() => {
                if (row.action.kind === "call") return callPatient(row.id);
                if (row.action.kind === "advance") return advancePatient(row.id);
                if (row.action.blockerId) return resolveBlocker(row.action.blockerId);
                return Promise.resolve();
              }),
            }}
            busy={busy}
          />
        ))}
      </Section>

      <section id="floor" className="role-section">
        <div className="nurse-floor">
          <div id="monitors">
            <AgentFloor agent={agent} onTick={onRefresh} compact />
          </div>
          <div id="readings" className="readings-col">
            <p className="kicker">Readings to check</p>
            <h2 className="role-h">Needs a look</h2>
            <p className="small muted" style={{ margin: "0 0 8px" }}>
              Confirming just means you looked. It doesn&apos;t place an order.
            </p>
            {batchable.length > 1 && (
              <div style={{ marginBottom: 8 }}>
                <Button size="sm" disabled={busy} onClick={() => run(() => verifyEvidenceBatch(batchable.map((c) => c.id), "nurse"))}>
                  Confirm {batchable.length} normal readings
                </Button>
              </div>
            )}
            {exceptions.length === 0 && <p className="small muted">No odd readings.</p>}
            {exceptions.map((claim) => (
              <ClaimCard key={claim.id} claim={claim} actor="nurse" busy={busy} onDone={run} compact />
            ))}
            <CaptureRound onDone={onRefresh} />
          </div>
        </div>
      </section>

      <section id="overdue" className="role-section">
        <p className="kicker">Waiting on this team</p>
        <h2 className="role-h">Language, nursing, transport</h2>
        <Handoffs data={escalations} owners={NURSE_OWNERS} onChanged={onRefresh} hideKpis />
      </section>

      <section id="board" className="role-section">
        <p className="kicker">Who&apos;s next</p>
        <h2 className="role-h">Who should be seen first</h2>
        {lists.length === 0 && <p className="small muted">No nursing or transport queues right now.</p>}
        {lists.map((list) => (
          <Worklist
            key={list.resource}
            list={list}
            onOpenPatient={(id, name) => setPlan({ id, name })}
          />
        ))}
      </section>

      {plan && (
        <PatientPlan patientId={plan.id} name={plan.name} onClose={() => setPlan(null)} />
      )}
    </div>
  );
}
