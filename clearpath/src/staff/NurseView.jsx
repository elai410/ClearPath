import { useMemo, useState } from "react";
import {
  advancePatient, callPatient, resolveBlocker, verifyEvidenceBatch,
} from "../api/backend.js";
import { AgentFloor, CaptureRound, ClaimCard } from "./Inbox.jsx";
import Handoffs from "./Handoffs.jsx";
import { Worklist, PatientPlan } from "./Planner.jsx";
import WorkRow, { FindPerson, Section } from "./WorkRow.jsx";
import { Button } from "../components/ui.jsx";

const NURSE_OWNERS = /nurs|language|transport|admitt|interpreter|him/i;
const NURSE_RES = /nurse|interpret|transport|registration/i;

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
      <p className="role-lead">
        {agent
          ? `${agent.silent} beds are quiet. ${exceptions.length ? `${exceptions.length} reading${exceptions.length === 1 ? "" : "s"} need a person.` : "Silence is the product."}`
          : "Loading the floor…"}
      </p>

      <AgentFloor agent={agent} onTick={onRefresh} />

      {evidence && (
        <div className="kpi-grid kpi-4">
          <div className={`kpi ${evidence.consequential ? "alert" : ""}`}>
            <b>{evidence.consequential}</b><span>Unverified and consequential</span>
          </div>
          <div className="kpi"><b>{evidence.unverified}</b><span>Awaiting a person</span></div>
          <div className="kpi"><b>{evidence.batchable}</b><span>Safe to confirm together</span></div>
          <div className="kpi"><b>{agent ? agent.silent : "—"}</b><span>Beds the agent is leaving alone</span></div>
        </div>
      )}

      <section className="role-section">
        <p className="kicker">Exceptions</p>
        <h2 className="role-h">Confirm what the agent already captured</h2>
        <p className="small muted" style={{ margin: "0 0 10px" }}>
          Confirming records that a person checked the source. It does not place an order.
        </p>
        {batchable.length > 1 && (
          <div style={{ marginBottom: 10 }}>
            <Button size="sm" disabled={busy} onClick={() => run(() => verifyEvidenceBatch(batchable.map((c) => c.id), "nurse"))}>
              Confirm {batchable.length} ordinary readings
            </Button>
          </div>
        )}
        {exceptions.length === 0 && <p className="small muted">Quiet. Stable values are not work.</p>}
        {exceptions.map((claim) => (
          <ClaimCard key={claim.id} claim={claim} actor="nurse" busy={busy} onDone={run} />
        ))}
      </section>

      <CaptureRound onDone={onRefresh} />

      <Section kicker="Nursing-owned work" title="Interpreters, transport, rooms" empty="Nothing in front of a nurse right now.">
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

      {lists.length > 0 && (
        <section className="role-section">
          <p className="kicker">Planned order</p>
          <h2 className="role-h">Nursing and transport queues</h2>
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
        <p className="kicker">Waiting on this team</p>
        <h2 className="role-h">Language, nursing, transport</h2>
        <Handoffs data={escalations} owners={NURSE_OWNERS} onChanged={onRefresh} />
      </section>

      <FindPerson patients={patients} onRefresh={onRefresh} />

      {plan && (
        <PatientPlan patientId={plan.id} name={plan.name} onClose={() => setPlan(null)} />
      )}
    </div>
  );
}
