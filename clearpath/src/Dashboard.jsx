import { useEffect, useRef, useState } from "react";
import DoctorView from "./staff/DoctorView.jsx";
import NurseView from "./staff/NurseView.jsx";
import ManagerView from "./staff/ManagerView.jsx";
import { fetchAgent, fetchEscalations, fetchEvidence, fetchFloorPlan, fetchFlow, WS_URL } from "./api/backend.js";
import { Icon } from "./components/Icons.jsx";

const ROLES = [
  { id: "doctor", label: "Doctors", icon: "people", hint: "Who to see, what to sign, what not to treat as fact" },
  { id: "nurse", label: "Nurses", icon: "check", hint: "Beds, exceptions, the next thing in front of you" },
  { id: "manager", label: "Management", icon: "chart", hint: "The floor as one decision" },
];

function readRole() {
  try {
    const saved = localStorage.getItem("clearpath-role");
    if (ROLES.some((r) => r.id === saved)) return saved;
  } catch { /* ignore */ }
  return "nurse";
}

export default function Dashboard() {
  const [role, setRole] = useState(readRole);
  const [flow, setFlow] = useState(null);
  const [evidence, setEvidence] = useState(null);
  const [agent, setAgent] = useState(null);
  const [escalations, setEscalations] = useState(null);
  const [floor, setFloor] = useState(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);

  async function load() {
    const jobs = [
      fetchFlow().then(setFlow).catch(() => {}),
      fetchEvidence().then(setEvidence).catch(() => {}),
      fetchAgent().then(setAgent).catch(() => {}),
      fetchEscalations().then(setEscalations).catch(() => {}),
      fetchFloorPlan().then(setFloor).catch(() => {}),
    ];
    await Promise.all(jobs);
  }

  useEffect(() => {
    load();
    const ws = new WebSocket(`${WS_URL}?id=dashboard`);
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (["QUEUE_UPDATED", "PATIENT_JOINED", "FLOW_UPDATED", "ESCALATIONS_UPDATED", "EVIDENCE_UPDATED"].includes(msg.type)) load();
    };
    wsRef.current = ws;
    const poll = setInterval(load, 12000);
    return () => { ws.close(); clearInterval(poll); };
  }, []);

  function choose(id) {
    setRole(id);
    try { localStorage.setItem("clearpath-role", id); } catch { /* ignore */ }
  }

  const current = ROLES.find((r) => r.id === role) || ROLES[1];
  const doctorBadge = (evidence?.consequential || 0) + (flow?.patients || []).filter((p) => p.status === "pending_signature").length;
  const nurseBadge = (evidence?.unverified || 0);
  const managerBadge = escalations?.unacknowledged || 0;
  const badge = { doctor: doctorBadge, nurse: nurseBadge, manager: managerBadge };

  return (
    <div className="staff-app">
      <aside className="staff-nav">
        <h1 className="brand">ClearPath</h1>
        <div className="nav-sub">Who are you right now?</div>
        {ROLES.map((r) => (
          <button
            key={r.id}
            className={`nav-item ${role === r.id ? "active" : ""}`}
            onClick={() => choose(r.id)}
          >
            <Icon name={r.icon} /> {r.label}
            {badge[r.id] > 0 && (
              <span className="nav-count" aria-label={`${badge[r.id]} waiting`}>{badge[r.id]}</span>
            )}
          </button>
        ))}
        <div className="nav-spacer" />
        <div className="live-pill">
          <span className={`dot ${connected ? "on" : ""}`} />
          {connected ? "Live" : "Reconnecting"}
          {flow?.kpis ? ` · ${flow.kpis.active} in hospital` : ""}
        </div>
        <a className="nav-item" href="/">Patient view</a>
      </aside>

      <main className="staff-main">
        <div className="staff-top">
          <div>
            <p className="page-kicker">Yale New Haven Hospital</p>
            <h2 className="page-title">{current.label}</h2>
            <p className="page-sub">{current.hint}</p>
          </div>
        </div>

        {role === "doctor" && (
          <DoctorView
            flow={flow}
            evidence={evidence}
            floor={floor}
            escalations={escalations}
            onRefresh={load}
          />
        )}
        {role === "nurse" && (
          <NurseView
            flow={flow}
            evidence={evidence}
            agent={agent}
            escalations={escalations}
            floor={floor}
            onRefresh={load}
          />
        )}
        {role === "manager" && (
          <ManagerView
            flow={flow}
            floor={floor}
            escalations={escalations}
            onRefresh={load}
          />
        )}
      </main>
    </div>
  );
}
