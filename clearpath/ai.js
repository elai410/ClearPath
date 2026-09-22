import { explainWait, keywordRoute, patientQuestions, whileYouWait, currentStage } from "./src/lib/journey.js";
import { detectLanguage, languageLabel, translator } from "./src/lib/i18n/index.js";

/** Distress words across the supported languages, for the sentiment hint only. */
const PAIN_WORDS = /pain|hurt|scared|afraid|dolor|duele|miedo|dor|dói|medo|fè mal|doulè|pè|痛|疼|怕|ألم|وجع|خائف|боль|болит|страшно/i;

const MODEL = "claude-sonnet-4-20250514";
const USE_ANTHROPIC = false;

function anthropicKey() {
  if (!USE_ANTHROPIC) return null;
  return process.env.ANTHROPIC_API_KEY || null;
}

export async function claudeJSON(system, user, maxTokens = 900) {
  const key = anthropicKey();
  if (!key) return null;
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const text = data.content?.find((b) => b.type === "text")?.text || "";
    const cleaned = text.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

export async function claudeText(system, user, maxTokens = 500) {
  const key = anthropicKey();
  if (!key) return null;
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        ...(system ? { system } : {}),
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.content?.find((b) => b.type === "text")?.text || null;
  } catch {
    return null;
  }
}

export const DEFAULT_UI = {
  heading: "What brings you in today?",
  sub: "Describe your situation in your own words. We'll guide you to the right place.",
  btn_route: "Find my care",
  btn_checkin: "Confirm check-in",
  btn_arrived: "I've arrived — show my place in line",
  btn_followup: "Get my follow-up plan",
  label_routed: "You're headed to",
  label_position: "Your place in line",
  label_floor: "Floor",
  label_room: "Room",
  label_what_to_expect: "What to expect",
  label_avg_visit: "Typical visit time",
  label_qr_sub: "Show this at the desk if anyone asks",
  label_queue: "in line at",
  label_wait: "Estimated wait",
  label_directions: "Walking directions",
  label_qr: "Your check-in code",
  label_discharge: "Going-home instructions",
  label_followup_card: "Your 3-day follow-up",
  label_name: "Your name",
  label_phone: "Phone for alerts (optional)",
  alert_turn: "It's your turn",
  alert_room: "Please head to",
  alert_wait_msg: "We'll alert you when it's almost your turn. You don't need to watch this screen.",
  allset: "You're all set",
  thank_you: "Thank you for trusting us with your visit",
  directions: [
    "Enter through the York Street main entrance",
    "Follow the highlighted route on the map",
    "Take the corridor toward your building",
    "Check in at the desk when you arrive",
  ],
  expect: [
    "Show your check-in code or give your name",
    "A nurse will take your vitals",
    "A clinician will see you as soon as a room is ready",
  ],
  back: "Back",
  min: "min",
  urgency_label: "priority",
};

const CONVERSE_SYSTEM = `You are a calm, compassionate hospital guide at Yale New Haven Hospital for ClearPath.
You are NOT a diagnostician. You do not give medical advice, diagnoses, or treatment.
Your job is to understand why the person is here, route them, and reduce fear and confusion.

Detect their language and always reply in that language.

MODE 1 — if you still need information (max 2 questions total), respond ONLY with JSON:
{
  "mode": "question",
  "question": "warm follow-up, one question only",
  "detectedLanguage": "English|Spanish|..."
}

MODE 2 — when you can route, respond ONLY with JSON:
{
  "mode": "route",
  "department": "rabies|emergency|pediatric|triage|atrium|clinicbldg|dana|ypb|north|fitkin|winchester",
  "reason": "one sentence in the patient's language",
  "urgency": "low|medium|high",
  "sentiment": "calm|anxious|scared|confused|distressed|in-pain",
  "sentimentNote": "short note for staff",
  "detectedLanguage": "English|Spanish|...",
  "summary": "2 sentences for staff, clinical-operational not diagnostic",
  "whileYouWait": "one sentence of practical reassurance in the patient's language",
  "questionsForTeam": ["up to 3 questions the patient may want to ask"],
  "ui": { ... translated UI strings matching the keys listed below }
}

UI keys to translate (keep key names in English):
heading, sub, btn_route, btn_checkin, btn_arrived, btn_followup, label_routed, label_position,
label_floor, label_room, label_what_to_expect, label_avg_visit, label_qr_sub, label_queue, label_wait,
label_directions, label_qr, label_discharge, label_followup_card, label_name, label_phone, alert_turn,
alert_room, alert_wait_msg, allset, thank_you, directions (array of 4), expect (array of 3), back, min, urgency_label

Departments:
- rabies: animal bites / rabies
- emergency: life-threatening
- pediatric: under 18, maternity, labor
- triage: general admitting
- atrium: cafeteria, info, non-medical
- clinicbldg: MRI, PET, neuroradiology
- dana: digestive, eye, diabetes, cardiology
- ypb: orthopedics, surgery, transplant
- north: breast, gynecology, oncology, ORs
- fitkin: EEG, pulmonary
- winchester: psychiatry

Never ask more than 2 questions. If it sounds like an emergency, route immediately with urgency high.
If they mention chest pain, stroke, trouble breathing, or severe bleeding, route to emergency immediately.`;

export async function converse(messages) {
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content || "";
  const allUserText = messages.filter((m) => m.role === "user").map((m) => m.content).join(" ");
  const userTurns = messages.filter((m) => m.role === "user").length;

  const key = anthropicKey();
  if (key) {
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1400,
          system: CONVERSE_SYSTEM,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      if (response.ok) {
        const data = await response.json();
        const text = data.content?.find((b) => b.type === "text")?.text || "{}";
        return JSON.parse(text.replace(/```json|```/g, "").trim());
      }
    } catch {
      // fall through to deterministic routing
    }
  }

  // Detect from everything the patient has written, not just the last turn: a
  // one-word follow-up carries no language signal but the first message does.
  const detected = detectLanguage(allUserText || lastUser);
  const tr = translator(detected);
  const routedEarly = keywordRoute(allUserText || lastUser, detected);

  if (userTurns < 2 && lastUser.split(/\s+/).length < 8 && routedEarly.department === "triage") {
    return {
      mode: "question",
      question: tr("converse.clarify"),
      detectedLanguage: languageLabel(detected),
    };
  }
  return {
    mode: "route",
    ...routedEarly,
    sentiment: PAIN_WORDS.test(allUserText || lastUser) ? "anxious" : "calm",
    sentimentNote: "Routed by ClearPath guide",
    detectedLanguage: languageLabel(detected),
    summary: lastUser,
    whileYouWait: tr("stage.waiting.youDo"),
    questionsForTeam: [tr("q.after"), tr("q.turn")],
  };
}

export function fallbackExplain(patient, blockers, deptName) {
  const now = explainWait(patient, blockers, deptName);
  return {
    source: "clearpath",
    reviewRequired: false,
    ...now,
    questions: patientQuestions(patient, blockers),
    whileYouWait: whileYouWait(patient, blockers),
  };
}

export async function explainStatus(patient, blockers, deptName) {
  const base = fallbackExplain(patient, blockers, deptName);
  const open = (blockers || []).filter((b) => b.status !== "resolved");
  const ai = await claudeText(
    "You explain hospital waits in plain language for a stressed patient. No diagnosis. No medical advice. 4 short sentences max. Mention who owns the wait if known. Say if the wait is typical or long.",
    `Stage: ${currentStage(patient)}\nStatus: ${patient.status}\nDepartment: ${deptName}\nWait minutes: from check-in\nLanguage: ${patient.language}\nOpen blockers: ${open.map((b) => `${b.title} (${b.owner_role})`).join("; ") || "none"}\nHeadline: ${base.headline}\nWhy: ${base.why}`
  );
  if (!ai) return base;
  return { ...base, source: "ai", narrative: ai };
}

export async function staffBrief(patient, blockers) {
  const open = (blockers || []).filter((b) => b.status !== "resolved");
  const fallback = [
    `${patient.name} · ${patient.urgency || "low"} urgency · ${patient.status.replaceAll("_", " ")}`,
    patient.summary || patient.situation,
    open.length
      ? `Blocked by: ${open.map((b) => b.title).join(", ")}.`
      : "No open dependencies — this patient can likely advance.",
    patient.sentimentNote ? `Affect: ${patient.sentimentNote}` : null,
    patient.language && !/^english$/i.test(patient.language) ? `Language: ${patient.language}` : null,
  ].filter(Boolean).join(" ");

  const ai = await claudeText(
    "You are a charge nurse writing a 4-sentence operational brief. No new diagnosis. Flag missing info, blockers, language needs, and the single best next operational action.",
    fallback
  );
  return { source: ai ? "ai" : "clearpath", text: ai || fallback, reviewRequired: false };
}

export async function draftDischarge(patient, extra = "") {
  const fallback = extra?.trim()
    ? extra.trim()
    : `Follow up with your primary clinician if symptoms return or worsen. Rest today. Take medications as discussed. Return immediately for chest pain, trouble breathing, fainting, or rapidly worsening symptoms.`;

  const ai = await claudeText(
    "Write patient-friendly discharge instructions. Not a diagnosis. Use short sentences. Include: what to do today, warning signs to return, and follow-up. Mark that a clinician must review before this is given to a patient. Respond in the patient's language if specified.",
    `Patient language: ${patient.language || "English"}\nSituation: ${patient.situation}\nSummary: ${patient.summary || ""}\nDepartment: ${patient.department}\nClinician notes: ${extra || "none"}`
  );
  return {
    source: ai ? "ai" : "clearpath",
    text: ai || fallback,
    reviewRequired: true,
    disclaimer: "Draft only — a clinician must review before this is given to the patient.",
  };
}

export async function followUpReminder(situation, instructions, language) {
  const fallback = `In three days, check how you're feeling compared to today. If you are not improving, or if anything new and worrying starts, contact your clinician. Keep your discharge instructions nearby.`;
  const ai = await claudeText(
    `Write a warm 2-sentence follow-up reminder in ${language || "English"}. No diagnosis.`,
    `Treated for: ${situation}. Instructions: ${instructions}`
  );
  return ai || fallback;
}

export async function handoffSummary(patients) {
  if (!patients.length) return "No patients currently in the system.";
  const list = patients.map((p) =>
    `- ${p.name}: ${p.summary || p.situation} | ${p.department} | ${p.urgency} | ${p.status} | wait ${p.wait_minutes || "?"}m | blockers: ${(p.blockers || []).filter((b) => b.status !== "resolved").map((b) => b.title).join(", ") || "none"}`
  ).join("\n");
  const ai = await claudeText(
    "You are a hospital charge nurse. Write a 4-6 sentence shift handoff. Cover: volume, high urgency, longest waits, systemic bottlenecks, and what the incoming team should do first. Operational, not diagnostic.",
    list
  );
  if (ai) return ai;
  const high = patients.filter((p) => p.urgency === "high");
  const stuck = patients.filter((p) => p.is_stuck);
  return `${patients.length} patients are in the hospital now. ${high.length} high-urgency. ${stuck.length} are past expected wait. Start with anyone high-urgency or stuck on a single overdue dependency.`;
}

export async function conciergeAnswer(patient, blockers, question, deptName) {
  const base = fallbackExplain(patient, blockers, deptName);
  const ai = await claudeText(
    `You are ClearPath, a hospital visit guide. Answer the patient's question in ${patient.language || "English"}.
You cannot diagnose, change orders, or give medical advice.
You CAN explain where they are, what they are waiting for, who owns that wait, what happens next, and what they can do while they wait.
If the question is clinical, tell them to ask their care team and offer a well-phrased version of the question they can use.
Keep answers under 90 words. Calm tone.`,
    `Question: ${question}\nHeadline: ${base.headline}\nWhy: ${base.why}\nNext: ${base.next}\nWaiting for: ${base.waitingFor}\nOwner: ${base.owner}\nOpen blockers: ${(blockers || []).filter((b) => b.status !== "resolved").map((b) => b.title).join(", ") || "none"}`
  );
  if (ai) return { source: "ai", text: ai };
  const q = question.toLowerCase();
  if (/how long|wait|when/.test(q)) {
    return { source: "clearpath", text: `${base.why} Typical remaining time is shown on your journey card.` };
  }
  if (/next|happen/.test(q)) {
    return { source: "clearpath", text: base.next };
  }
  if (/do i|should i|need to/.test(q)) {
    return { source: "clearpath", text: base.youDo };
  }
  return {
    source: "clearpath",
    text: `${base.headline}. ${base.why} If this is about your medical care, ask your team — we can help you phrase the question.`,
  };
}
