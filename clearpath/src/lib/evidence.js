/**
 * Claims are not facts.
 *
 * A hospital system that collapses "the monitor said", "someone meant", "the
 * model predicts", and "this happened" into one kind of record will eventually
 * treat a guess as an order. Every intelligent output here is a claim with a
 * kind, a layer, the evidence it came from, and an authority decision about
 * what may be done with it.
 *
 * The authority rule is short on purpose. Clinical acts stay with a qualified
 * person. Unverified observations can be shown and cannot be acted on.
 * Intentions are not events. Reversible preparation can be staged. Anything
 * past that waits for a person.
 */

export const KINDS = ["observation", "intent", "inference", "prediction", "recommendation"];

/**
 * How sure the system is allowed to look. A prediction must never share a
 * treatment with a verified measurement, because people believe what looks settled.
 */
export const EPISTEMIC = {
  OBSERVED: { label: "Observed", tone: "fact" },
  AI_EXTRACTED: { label: "Captured · not verified", tone: "candidate" },
  AI_INFERRED: { label: "Inferred", tone: "candidate" },
  PREDICTED: { label: "Predicted", tone: "prediction" },
  HUMAN_REPORTED: { label: "Reported by a person", tone: "candidate" },
  HUMAN_VERIFIED: { label: "Verified", tone: "fact" },
  SYSTEM_CONFIRMED: { label: "Confirmed", tone: "fact" },
  DISPUTED: { label: "Disputed", tone: "dispute" },
  SUPERSEDED: { label: "Superseded", tone: "past" },
};

export function initialEpistemic(kind) {
  if (kind === "prediction") return "PREDICTED";
  if (kind === "inference" || kind === "recommendation") return "AI_INFERRED";
  if (kind === "intent") return "AI_EXTRACTED";
  return "AI_EXTRACTED";
}

export function presentEpistemic(state) {
  return EPISTEMIC[state] || EPISTEMIC.AI_EXTRACTED;
}

/** The only states that may be rendered as something that happened. */
export function looksLikeFact(state) {
  return presentEpistemic(state).tone === "fact";
}

export const AUTONOMY = {
  0: "observe",
  1: "recommend",
  2: "prepare",
  3: "operate",
  4: "authorize",
  5: "clinical",
};

/**
 * Whether a captured vital is consequential enough that it must not be swept
 * into a batch confirm. This is a review rule, not a diagnosis.
 */
export function consequentialVital(vital) {
  if (!vital) return false;
  if (vital.measure === "spo2") return vital.value < 92;
  if (vital.measure === "sbp") return vital.value >= 180 || vital.value < 90;
  if (vital.measure === "dbp") return vital.value >= 120;
  if (vital.measure === "temp") return vital.value >= 38.5 || vital.value < 35;
  if (vital.measure === "pulse") return vital.value >= 130 || vital.value < 45;
  if (vital.measure === "rr") return vital.value >= 30 || vital.value < 8;
  return false;
}

/**
 * What ClearPath is allowed to do with a claim.
 *
 * `surface` means a person may be shown it. `execute` means the system may
 * cause it to happen. Those are different permissions and this function
 * refuses to treat them as one.
 */
export function gate(claim) {
  if (!claim) {
    return { level: 0, name: "observe", surface: false, execute: false, prepare: false, reason: "Nothing to act on." };
  }
  if (claim.status === "rejected") {
    return { level: 0, name: "observe", surface: true, execute: false, prepare: false, reason: "Rejected. Kept so the rejection stays auditable." };
  }
  if (claim.clinical || claim.kind === "order") {
    return {
      level: 5, name: "clinical", surface: true, execute: false, prepare: false,
      reason: "Diagnosis, treatment, and orders stay with a qualified professional.",
    };
  }
  if (claim.kind === "observation" && claim.status !== "verified" && claim.status !== "corrected") {
    return {
      level: 0, name: "observe", surface: true, execute: false, prepare: false,
      reason: claim.consequential
        ? "Captured and not yet verified. It can be surfaced. It cannot be treated as a fact or used to change care."
        : "Captured and not yet verified. Safe to show. Not safe to act on.",
    };
  }
  if (claim.kind === "intent") {
    return {
      level: 1, name: "recommend", surface: true, execute: false, prepare: false,
      reason: "An intention is not an order and not something that has happened.",
    };
  }
  if (claim.kind === "prediction" || claim.kind === "inference") {
    return {
      level: 1, name: "recommend", surface: true, execute: false, prepare: false,
      reason: "A prediction is not a fact. It can inform a person. It cannot commit the hospital.",
    };
  }
  if (claim.reversible && (claim.kind === "recommendation" || claim.kind === "preparation")) {
    return {
      level: 2, name: "prepare", surface: true, execute: false, prepare: true,
      reason: "Reversible preparation only. It can be staged and it can be thrown away. It does not commit care.",
    };
  }
  return {
    level: 1, name: "recommend", surface: true, execute: false, prepare: false,
    reason: "A recommendation waits for a person.",
  };
}

/** Execution is a separate question from display, and the answer is usually no. */
export function mayExecute(claim, requestedLevel = 3) {
  const decision = gate(claim);
  if (claim?.clinical || requestedLevel >= 5) {
    return { allowed: false, ...decision, reason: "Clinical authority stays with a qualified professional." };
  }
  if (decision.execute) return { allowed: true, ...decision };
  if (requestedLevel <= 2 && decision.prepare && claim?.reversible) {
    return { allowed: true, ...decision };
  }
  return { allowed: false, ...decision };
}

/** Batch confirm is only for ordinary unverified vitals. The abnormal one stays individual. */
export function batchEligible(claim) {
  return claim?.kind === "observation"
    && claim.status === "unverified"
    && !claim.consequential
    && !claim.clinical;
}

function vital(measure, fields, quote) {
  const proposition = { measure, ...fields };
  const consequential = measure === "bp"
    ? consequentialVital({ measure: "sbp", value: fields.systolic }) || consequentialVital({ measure: "dbp", value: fields.diastolic })
    : consequentialVital({ measure, value: fields.value });
  return {
    kind: "observation",
    layer: "observation",
    proposition,
    display: fields.display,
    consequential,
    clinical: false,
    reversible: false,
    confidence: 0.7,
    evidence: { source: "spoken", quote, synthetic: false },
  };
}

/**
 * Turn a sentence someone actually said into claims. The quote is the evidence.
 * The structured value is an interpretation of it, and it starts unverified.
 */
export function captureUtterance(text = "") {
  const raw = String(text).trim();
  if (!raw) return [];
  const claims = [];

  const bp = raw.match(/blood pressure\s+(\d{2,3})\s*(?:over|\/)\s*(\d{2,3})/i);
  if (bp) {
    const systolic = Number(bp[1]);
    const diastolic = Number(bp[2]);
    claims.push(vital("bp", { systolic, diastolic, display: `${systolic}/${diastolic} mmHg` }, bp[0]));
  }

  const spo2 = raw.match(/(?:spo2|oxygen(?: saturation)?|o2 sat)\s*(?:is|of|at)?\s*(\d{2,3})\s*%?/i);
  if (spo2) claims.push(vital("spo2", { value: Number(spo2[1]), display: `${spo2[1]}%` }, spo2[0]));

  const temp = raw.match(/temp(?:erature)?\s*(?:is|of|at)?\s*(\d{2}(?:\.\d)?)/i);
  if (temp) claims.push(vital("temp", { value: Number(temp[1]), unit: "C", display: `${temp[1]} °C` }, temp[0]));

  const pulse = raw.match(/(?:pulse|heart rate)\s*(?:is|of|at)?\s*(\d{2,3})/i);
  if (pulse) claims.push(vital("pulse", { value: Number(pulse[1]), display: `${pulse[1]} bpm` }, pulse[0]));

  const rr = raw.match(/(?:respiratory rate|resp(?:iration)?s?)\s*(?:is|of|at)?\s*(\d{1,2})/i);
  if (rr) claims.push(vital("rr", { value: Number(rr[1]), display: `${rr[1]} / min` }, rr[0]));

  const intents = [
    [/let'?s get (?:a |an )?([a-z][a-z0-9 /-]{1,40})/i, (m) => `Get ${m[1].trim()}`],
    [/i(?:'ll| will) call ([a-z]+)/i, (m) => `Call ${m[1]}`],
    [/discharge after (?:the )?([a-z][a-z ]{1,40})/i, (m) => `Discharge after ${m[1].trim()}`],
  ];
  for (const [pattern, render] of intents) {
    const match = raw.match(pattern);
    if (!match) continue;
      claims.push({
        kind: "intent",
        layer: "interpretation",
        proposition: { text: render(match) },
        display: match[0].trim(),
      consequential: false,
      clinical: false,
      reversible: true,
      confidence: 0.55,
      evidence: { source: "spoken", quote: match[0], synthetic: false },
    });
  }

  return claims;
}

/**
 * A small opening set so the inbox is about real patients in this census,
 * clearly marked as sample captures rather than live devices.
 */
export function openingCaptures(patients = []) {
  const out = [];
  let abnormal = false;
  for (const patient of patients) {
    if (out.length >= 8) break;
    const situation = `${patient.situation || ""} ${patient.summary || ""}`;
    const chest = /chest|pecho|troponin|cardiac/i.test(situation);
    const base = {
      patientId: patient.id,
      patientName: patient.name,
      evidence: { source: "sample", synthetic: true, speaker: "bedside", room: patient.room || null },
    };
    if (chest && !abnormal) {
      abnormal = true;
      out.push({
        ...base,
        fingerprint: `${patient.id}:spo2:89`,
        kind: "observation",
        layer: "observation",
        display: "SpO2 89%",
        proposition: { measure: "spo2", value: 89, display: "89%" },
        consequential: true,
        clinical: false,
        confidence: 0.62,
        evidence: { ...base.evidence, quote: "Monitor frame: SpO2 89%", source: "monitor" },
      });
      out.push({
        ...base,
        fingerprint: `${patient.id}:intent:ct`,
        kind: "intent",
        layer: "interpretation",
        display: "Get a CT",
        proposition: { text: "Get a CT" },
        consequential: false,
        clinical: false,
        reversible: true,
        confidence: 0.5,
        evidence: { ...base.evidence, quote: "Let's get a CT.", source: "spoken" },
      });
    }
    out.push({
      ...base,
      fingerprint: `${patient.id}:bp:118`,
      kind: "observation",
      layer: "observation",
      display: "118/76 mmHg",
      proposition: { measure: "bp", systolic: 118, diastolic: 76, display: "118/76 mmHg" },
      consequential: false,
      clinical: false,
      confidence: 0.8,
      evidence: { ...base.evidence, quote: "Blood pressure 118 over 76", source: "spoken" },
    });
  }
  return out.slice(0, 8);
}

/** Authority stamp for a whole planning surface. Display is allowed. Execution is not. */
export function planAuthority() {
  return {
    level: 1,
    name: "recommend",
    execute: false,
    prepare: false,
    reason: "This is a recommendation about ordering work. It does not move a patient, place an order, or change treatment.",
    epistemic: "PREDICTED",
  };
}
