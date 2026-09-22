import { useEffect, useRef, useState } from "react";
import Intake from "./pages/Intake.jsx";
import Checkin from "./pages/Checkin.jsx";
import Navigate from "./pages/Navigate.jsx";
import Journey from "./pages/Journey.jsx";
import Discharge from "./pages/Discharge.jsx";
import { JourneyTimeline } from "./components/JourneyTimeline.jsx";
import { checkinPatient, fetchJourney, aiFollowup, requestInterpreter, WS_URL } from "./api/backend.js";
import { DEPARTMENTS, DEFAULT_UI } from "./constants.js";
import { useLang } from "./lib/i18n/LanguageContext.jsx";
import { InterpreterOffer, LanguageSwitcher } from "./components/LanguageBar.jsx";

const SESSION_KEY = "clearpath.session";

/**
 * Bridges the catalog onto the legacy `ui` prop shape. Keys present here are
 * localized; anything still only in DEFAULT_UI stays English until it is
 * migrated, which the per-key fallback already handles gracefully.
 */
function localizedUi(t) {
  return {
    ...DEFAULT_UI,
    heading: t("ui.heading"),
    sub: t("ui.sub"),
    btn_checkin: t("ui.btn.checkin"),
    btn_arrived: t("ui.btn.arrived"),
    btn_followup: t("ui.btn.followup"),
    label_routed: t("ui.label.routed"),
    label_floor: t("ui.label.floor"),
    label_room: t("ui.label.room"),
    label_name: t("ui.label.name"),
    label_phone: t("ui.label.phone"),
    label_wait: t("ui.label.wait"),
    alert_turn: t("ui.alert.turn"),
    alert_room: t("ui.alert.room"),
    back: t("ui.btn.back"),
  };
}

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

function saveSession(data) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(data));
}

export default function App() {
  const saved = loadSession();
  const params = new URLSearchParams(location.search);
  const resumeId = params.get("resume");

  const [step, setStep] = useState(saved?.step ?? 0);
  const [name, setName] = useState(saved?.name ?? "");
  const [phone, setPhone] = useState(saved?.phone ?? "");
  const [loading, setLoading] = useState(false);
  const [patient, setPatient] = useState(null);
  const [dept, setDept] = useState(saved?.dept ? DEPARTMENTS[saved.dept] : null);
  const [discharge, setDischarge] = useState(saved?.discharge ?? null);
  const [followUp, setFollowUp] = useState("");
  const lang = useLang();
  const ui = localizedUi(lang.t);
  const [routeData, setRouteData] = useState(saved?.routeData ?? null);
  const [conversation, setConversation] = useState(saved?.conversation ?? []);
  const [journey, setJourney] = useState(null);
  const [error, setError] = useState("");
  const wsRef = useRef(null);
  const patientId = patient?.id || resumeId || (step >= 2 ? saved?.patientId : null);

  function persist(extra = {}) {
    saveSession({
      step,
      name,
      phone,
      dept: dept?.id,
      routeData,
      conversation,
      patientId,
      discharge,
      ...extra,
    });
  }

  useEffect(() => { persist(); }, [step, name, phone, dept, patientId, discharge]);

  async function refreshJourney(id = patientId) {
    if (!id) return;
    try {
      const data = await fetchJourney(id);
      setJourney(data);
      setPatient(data);
      if (data.department) setDept(DEPARTMENTS[data.department] || dept);
    } catch {
      /* still usable offline-ish */
    }
  }

  function connectWS(id) {
    if (!id) return;
    try { wsRef.current?.close(); } catch {}
    const ws = new WebSocket(`${WS_URL}?id=${id}`);
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      window.dispatchEvent(new MessageEvent("ws-message", { data: e.data }));
      if (msg.type === "YOU_ARE_CALLED") {
        setStep(3);
        refreshJourney(id);
      }
      if (msg.type === "STATUS_UPDATE") {
        setStep((s) => (s < 3 ? 3 : s));
        refreshJourney(id);
      }
      if (msg.type === "QUEUE_UPDATED" || msg.type === "FLOW_UPDATED") refreshJourney(id);
      if (msg.type === "DISCHARGED") {
        setDischarge(msg.instructions);
        setStep(5);
      }
      if (msg.type === "DEPARTMENT_CHANGED") {
        setPatient(msg.patient);
        setDept(DEPARTMENTS[msg.patient.department] || dept);
        setStep(2);
        refreshJourney(id);
      }
    };
    wsRef.current = ws;
  }

  useEffect(() => {
    if (patientId && step >= 2) {
      refreshJourney(patientId);
      connectWS(patientId);
      const t = setInterval(() => refreshJourney(patientId), 12000);
      return () => {
        clearInterval(t);
        wsRef.current?.close();
      };
    }
  }, [patientId, step]);

  useEffect(() => {
    if (!patientId) return;
    fetchJourney(patientId).then((p) => {
      setJourney(p);
      setPatient(p);
      if (p.department) setDept(DEPARTMENTS[p.department] || dept);
      if (p.status === "discharged") setStep(5);
      else if (resumeId) setStep((s) => (s < 3 ? 3 : s));
    }).catch(() => {});
  }, [patientId]);

  function startOver() {
    localStorage.removeItem(SESSION_KEY);
    setStep(0);
    setName("");
    setPhone("");
    setPatient(null);
    setDept(null);
    setDischarge(null);
    setFollowUp("");
    lang.reset();
    setRouteData(null);
    setConversation([]);
    setJourney(null);
    setError("");
    wsRef.current?.close();
  }

  function handleRouted(data, messages) {
    if (data.detectedLanguage) lang.suggest(data.detectedLanguage);
    setDept(DEPARTMENTS[data.department] || DEPARTMENTS.triage);
    setRouteData(data);
    setConversation(messages);
    setPatient({ ...data });
    setStep(1);
  }

  async function handleCheckin() {
    setLoading(true);
    setError("");
    try {
      const situationSummary = conversation.filter((m) => m.role === "user").map((m) => m.content).join(" | ");
      const data = await checkinPatient({
        name: name || "Patient",
        situation: situationSummary,
        department: dept.id,
        room: dept.room,
        floor: dept.floor,
        urgency: routeData.urgency,
        reason: routeData.reason,
        phone,
        // Send what the patient asked for, not what we can render, so staff see
        // the real language even when the page falls back to English.
        language: lang.requested || lang.requestedLabel || "English",
        sentiment: routeData.sentiment || "calm",
        sentimentNote: routeData.sentimentNote || "",
        summary: routeData.summary || situationSummary,
        aiContext: {
          whileYouWait: routeData.whileYouWait,
          questionsForTeam: routeData.questionsForTeam,
        },
      });
      const p = data.patient;
      setPatient(p);
      setJourney(p);
      persist({ patientId: p.id, step: 2 });
      connectWS(p.id);
      setStep(2);
    } catch {
      setError("Check-in didn't go through. If this keeps happening, go to the East Pavilion admitting desk.");
    }
    setLoading(false);
  }

  async function handleFollowUp() {
    setLoading(true);
    try {
      const situationSummary = conversation.filter((m) => m.role === "user").map((m) => m.content).join(". ");
      const res = await aiFollowup(situationSummary, discharge, lang.requestedLabel);
      setFollowUp(res.text || res);
    } catch {
      setError("Could not generate the follow-up just now.");
    }
    setLoading(false);
  }

  const at = (n) => (step === n ? "now" : step > n ? "done" : "later");
  const timelinePreview = [
    { id: "intake", label: lang.t("ui.step.tell"), state: step === 0 ? "now" : "done" },
    { id: "registration", label: lang.t("timeline.intake"), state: at(1) },
    { id: "waiting", label: lang.t("ui.step.findUs"), state: at(2) },
    { id: "evaluation", label: lang.t("timeline.evaluation"), state: at(3) },
    { id: "discharge", label: lang.t("timeline.discharge"), state: step >= 5 ? "now" : "later" },
  ];

  return (
    <div className="patient-app">
      <a className="skip" href="#main">Skip to visit</a>
      <header className="patient-header">
        <span className="logo-mark" aria-hidden="true">＋</span>
        <h1 className="brand">ClearPath</h1>
        <div className="header-meta">
          <LanguageSwitcher />
          {step > 0 && <button className="demo-link" type="button" onClick={startOver}>New visit</button>}
          <a className="demo-link" href="/dashboard">Staff</a>
        </div>
      </header>

      <main id="main" className="patient-body">
        {step < 3 && <JourneyTimeline items={timelinePreview} />}
        <InterpreterOffer
          onRequest={(language) =>
            patientId ? requestInterpreter(patientId, language) : Promise.resolve()
          }
        />
        {error && <div className="toast" role="alert">{error}</div>}

        {step === 0 && <Intake onRouted={handleRouted} />}

        {step === 1 && dept && routeData && (
          <Checkin
            dept={dept}
            patient={routeData}
            name={name}
            setName={setName}
            phone={phone}
            setPhone={setPhone}
            ui={ui}
            loading={loading}
            onCheckin={handleCheckin}
            onBack={() => setStep(0)}
          />
        )}

        {step === 2 && dept && (
          <Navigate
            dept={dept}
            patient={patient || { id: patientId }}
            ui={ui}
            onArrived={() => setStep(3)}
          />
        )}

        {step === 3 && (
          <Journey
            journey={journey}
            ui={ui}
            dept={dept}
            showMap={journey?.status === "pending_transport" || journey?.stage === "wayfinding"}
          />
        )}

        {step === 5 && (
          <Discharge
            discharge={discharge}
            followUp={followUp}
            ui={ui}
            loading={loading}
            onFollowUp={handleFollowUp}
            journey={journey}
          />
        )}
      </main>
    </div>
  );
}
