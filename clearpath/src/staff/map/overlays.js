const MEASURE = {
  pulse: "HR",
  spo2: "SpO₂",
  bp: "BP",
  temp: "Temp",
  rr: "RR",
};

function vitalValue(row) {
  if (!row) return "";
  const display = String(row.display || "");
  return display.replace(/\s*(bpm|mmHg|%|°F|°C)\s*/gi, "").trim() || display;
}

function pickVital(vitals, measure) {
  return (vitals || []).find((v) => v.measure === measure) || null;
}

function openBlockers(patient) {
  return (patient.blockers || []).filter((b) => b.status !== "resolved");
}

export function overlayVitals(placement, { selected } = {}) {
  const vitals = placement.vitals;
  if (!vitals?.watching) return null;
  const rows = vitals.vitals || [];
  if (!rows.length) {
    return { text: "Monitor on", exception: Boolean(placement.flags?.exception), pending: true };
  }
  const hr = pickVital(rows, "pulse");
  const spo2 = pickVital(rows, "spo2");
  const bp = pickVital(rows, "bp");
  const rr = pickVital(rows, "rr");
  const parts = [
    hr && `HR ${vitalValue(hr)}`,
    spo2 && `SpO₂ ${vitalValue(spo2)}`,
    (selected || placement.flags?.exception) && bp && `BP ${vitalValue(bp)}`,
    selected && rr && `RR ${vitalValue(rr)}`,
  ].filter(Boolean);
  return {
    text: parts.join(" · "),
    exception: Boolean(placement.flags?.exception || rows.some((r) => r.consequential)),
    pending: false,
  };
}

/**
 * Compact copy for a live overlay. Never dump the whole chart.
 * Vitals for a watched bed live on overlayVitals — they are always on, not
 * only when the reading is an exception.
 */
export function overlayLines(placement) {
  const patient = placement.patient;
  const open = openBlockers(patient);
  const interpreter = open.find((b) => b.type === "interpreter");
  const paperwork = open.find((b) => b.type === "documentation" || b.type === "registration" || b.type === "signature");
  const imaging = open.find((b) => b.type === "imaging");
  const transport = open.find((b) => b.type === "transport");

  if (interpreter || (patient.is_stuck && open[0])) {
    const wait = patient.wait_minutes ? `Waiting ${patient.wait_minutes} min` : patient.now?.waitingFor;
    const lang = patient.language && patient.language.length > 3 ? patient.language : patient.locale?.native;
    const second = interpreter
      ? `${lang || patient.language || "Language"} interpreter`
      : open[0].type_label || open[0].title;
    return [wait, second].filter(Boolean);
  }

  if (imaging || patient.status === "pending_test") {
    return [
      `Waiting on ${imaging?.type_label || patient.now?.waitingFor || "tests"}`,
      transport ? "Transport requested" : patient.action?.label,
    ].filter(Boolean);
  }

  if (
    patient.status === "pending_signature"
    || patient.stage === "discharge_prep"
    || patient.action?.kind === "discharge"
  ) {
    return [
      "Ready to go",
      paperwork ? paperwork.title || "Waiting on paperwork" : patient.now?.waitingFor,
    ].filter(Boolean);
  }

  if (patient.now?.waitingFor) {
    return [patient.now.waitingFor, patient.action?.label].filter(Boolean);
  }

  return [patient.stage_label || patient.status].filter(Boolean);
}

export function overlayScore(placement) {
  let score = 0;
  if (placement.flags?.exception) score += 100;
  if (placement.flags?.stuck) score += 55;
  if (placement.flags?.opportunity) score += 40;
  if (placement.flags?.blocked) score += 25;
  score += Math.min(40, placement.patient.wait_minutes || 0);
  if (placement.patient.urgency === "high") score += 20;
  return score;
}

export function overlayTone(placement) {
  if (placement.flags?.exception) return "alert";
  if (placement.flags?.stuck) return "warn";
  if (placement.flags?.opportunity) return "accent";
  if (placement.patient.status === "waiting" && (placement.patient.wait_minutes || 0) >= 15) return "wait";
  return "quiet";
}

export function overlayMode(placement, { selected, zoom, rank = 99 } = {}) {
  if (selected) return "full";
  if (placement.flags?.exception || placement.vitals?.watching) return "compact";
  const cap = zoom === "far" ? 3 : zoom === "mid" ? 5 : 7;
  if (rank < cap) return "compact";
  if (zoom === "near") return "name";
  return "dot";
}

export function overlayFor(placement, opts = {}) {
  const mode = overlayMode(placement, opts);
  const vitals = overlayVitals(placement, opts);
  const lines = overlayLines(placement);
  const shown = [];
  if (mode !== "dot" && mode !== "name" && vitals) shown.push(vitals.text);
  if (mode !== "dot" && mode !== "name") shown.push(...lines);
  return {
    mode,
    name: placement.patient.name,
    vitals,
    lines: shown.slice(0, opts.selected ? 4 : vitals ? 2 : 2),
    tone: overlayTone(placement),
    score: overlayScore(placement),
    location: placement.slot?.label || placement.zone?.name,
    measureLabels: MEASURE,
  };
}

export function rankPlacements(placements = []) {
  return [...placements]
    .sort((a, b) => overlayScore(b) - overlayScore(a))
    .map((pl, i) => [pl.patient.id, i]);
}
