/**
 * Spatial equipment inventory and visit-driven demand.
 *
 * Kit locations are layout. Live need is derived from patients already on
 * the floor (visit kind, open blockers, reason) — not a second scheduler.
 * A scheduled operation in a room raises demand against that room's kit.
 */
import { visitKind } from "../../lib/plan/compile.js";

export const KIND_META = {
  monitor: { label: "Bedside monitor" },
  "iv-pump": { label: "IV pump" },
  suction: { label: "Wall suction" },
  "crash-cart": { label: "Crash cart" },
  ultrasound: { label: "Ultrasound" },
  "portable-xray": { label: "Portable X-ray" },
  ecg: { label: "ECG machine" },
  nebulizer: { label: "Nebulizer" },
  "suture-tray": { label: "Procedure tray" },
  ventilator: { label: "Ventilator" },
  "airway-cart": { label: "Airway cart" },
  phlebotomy: { label: "Phlebotomy cart" },
  telemetry: { label: "Telemetry pack" },
  "fetal-monitor": { label: "Fetal monitor" },
  "slit-lamp": { label: "Slit lamp" },
  "pft-rig": { label: "PFT machine" },
  ct: { label: "CT scanner" },
  mri: { label: "MRI" },
  stretcher: { label: "Stretcher" },
  wheelchair: { label: "Wheelchair" },
};

const IMMOVABLE = new Set(["ct", "mri", "slit-lamp", "pft-rig", "monitor", "suction"]);

function controlNumber(id) {
  return String(20000 + (hash(id) % 70000));
}

export function controlLabel(item) {
  if (!item?.control) return "";
  return `Control ${item.control}`;
}

export function itemTitle(item) {
  if (!item) return "";
  if (item.ghost) return `${item.label} needed`;
  return item.label;
}

function hash(text) {
  let h = 2166136261;
  for (const ch of String(text)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

function openBlockers(patient) {
  return (patient.blockers || []).filter((b) => b.status !== "resolved");
}

function patientText(patient) {
  const blockers = openBlockers(patient)
    .map((b) => `${b.title || ""} ${b.detail || ""}`)
    .join(" ");
  return `${patient.reason || ""} ${patient.situation || ""} ${patient.summary || ""} ${blockers}`;
}

function addNeed(list, kind, why, urgency, mode) {
  if (!KIND_META[kind] || list.some((n) => n.kind === kind)) return;
  list.push({
    kind,
    label: KIND_META[kind].label,
    why,
    urgency: urgency || "medium",
    mode,
  });
}

/**
 * What the visit already implies this room needs. Occupancy kit is always
 * claimed; operations (imaging, surgery, pre-op, procedures) open a request
 * so a person does not have to.
 */
export function needsFor(patient, placement) {
  const occupy = [];
  const ops = [];
  const open = openBlockers(patient);
  const text = patientText(patient);
  const kind = visitKind(patient);
  const urgency = patient.urgency || "medium";
  const slotKind = placement?.slot?.kind;

  if (slotKind === "bed") {
    addNeed(occupy, "monitor", "Bed in use", urgency, "occupy");
    addNeed(occupy, "iv-pump", "Bed in use", urgency, "occupy");
    addNeed(occupy, "suction", "Bed in use", urgency, "occupy");
  }

  for (const blocker of open) {
    const blob = `${blocker.title || ""} ${blocker.detail || ""}`;
    const settled = /\b(done|taken|tracing done|acquisition done|film taken)\b/i.test(blob);
    const mode = settled ? "in-place" : "pull";
    if (blocker.type === "imaging") {
      if (/\bmri\b/i.test(blob)) addNeed(ops, "mri", blocker.title, "high", mode);
      else if (/\bct\b/i.test(blob)) addNeed(ops, "ct", blocker.title, "high", mode);
      else if (/ecg|ekg|12-lead/i.test(blob)) addNeed(ops, "ecg", blocker.title, urgency, mode);
      else if (/us|ultrasound/i.test(blob)) addNeed(ops, "ultrasound", blocker.title, urgency, mode);
      else if (/x-ray|xr|film|ankle|wrist|lumbar/i.test(blob)) addNeed(ops, "portable-xray", blocker.title, urgency, mode);
      else addNeed(ops, "portable-xray", blocker.title, urgency, mode);
    }
    if (blocker.type === "lab") addNeed(ops, "phlebotomy", blocker.title, urgency, mode);
    if (blocker.type === "consult" && /laceration|hand surgery|or\b|trauma|wound repair|suture/i.test(blob)) {
      addNeed(ops, "suture-tray", blocker.title, "high", "pull");
    }
    if (blocker.type === "consult" && /cardio|telemetry/i.test(blob)) {
      addNeed(ops, "telemetry", blocker.title, urgency, mode);
    }
  }

  if (kind === "preop") {
    addNeed(ops, "ecg", "Pre-op clearance", urgency, "pull");
    addNeed(ops, "airway-cart", "Scheduled surgery", urgency, "pull");
    addNeed(ops, "phlebotomy", "Pre-op labs", urgency, "pull");
  }
  if (kind === "obstetric") addNeed(ops, "fetal-monitor", "Obstetric visit", urgency, "pull");
  if (kind === "imaging" && /mri/i.test(text)) addNeed(ops, "mri", "Scheduled MRI", urgency, "pull");
  if (/pft|pulmonary function/i.test(text)) addNeed(ops, "pft-rig", "Scheduled PFT", urgency, "pull");
  if (/eye|dilat|ophthalm|vision|blurry/i.test(text)) addNeed(ops, "slit-lamp", "Eye exam", urgency, "in-place");
  if (/laceration|hand surgery|table saw|suture/i.test(text)) {
    addNeed(ops, "suture-tray", "Procedure in this room", "high", "pull");
  }
  if (/chest pain|stents|palpitations|syncope|telemetry/i.test(text)) {
    addNeed(ops, "ecg", "Cardiac work", urgency, "pull");
  }
  if (/asthma|copd|croup|wheez|nebul/i.test(text)) addNeed(ops, "nebulizer", "Respiratory care", urgency, "pull");
  if (
    urgency === "high"
    && slotKind === "bed"
    && /chest|cardiac|stemi|stroke|seizure|dyspnea|shortness of breath|palpitations/i.test(text)
  ) {
    addNeed(ops, "crash-cart", "High-acuity bay", "high", "pull");
  }
  if (/ventilat|intubat|airway/i.test(text) && kind !== "preop") {
    addNeed(ops, "ventilator", "Airway support", "high", "pull");
  }

  return ops.slice(0, 4).concat(occupy.slice(0, 3));
}

export function catalogFor(layout) {
  const items = [];
  let seq = 0;

  function push(partial) {
    const meta = KIND_META[partial.kind];
    if (!meta) return;
    const i = seq;
    seq += 1;
    items.push({
      id: partial.id || `eq:${layout.floor}:${partial.kind}:${i}`,
      kind: partial.kind,
      label: partial.label || meta.label,
      control: controlNumber(partial.id || `${layout.floor}:${partial.kind}:${i}`),
      fixture: Boolean(partial.fixture),
      zoneId: partial.zoneId,
      roomId: partial.roomId || null,
      homeX: partial.x,
      homeZ: partial.z,
      stationId: partial.stationId || null,
    });
  }

  for (const slot of layout.slots || []) {
    if (slot.kind !== "bed") continue;
    push({
      kind: "monitor",
      fixture: true,
      zoneId: slot.zoneId,
      roomId: slot.roomId,
      x: slot.x + 0.72,
      z: slot.z + 0.58,
      id: `${slot.id}-monitor`,
    });
    push({
      kind: "iv-pump",
      fixture: true,
      zoneId: slot.zoneId,
      roomId: slot.roomId,
      x: slot.x + 0.78,
      z: slot.z - 0.18,
      id: `${slot.id}-pump`,
    });
    push({
      kind: "suction",
      fixture: true,
      zoneId: slot.zoneId,
      roomId: slot.roomId,
      x: slot.x - 0.72,
      z: slot.z + 0.52,
      id: `${slot.id}-suction`,
    });
  }

  for (const room of layout.rooms || []) {
    if (/^US/i.test(room.label)) {
      push({
        kind: "ultrasound",
        fixture: true,
        zoneId: room.zoneId,
        roomId: room.id,
        x: room.x + 1.55,
        z: room.z,
        id: `${room.id}-us`,
      });
    }
    if (/^PFT/i.test(room.label)) {
      push({
        kind: "pft-rig",
        fixture: true,
        zoneId: room.zoneId,
        roomId: room.id,
        x: room.x + 1.35,
        z: room.z - 0.35,
        id: `${room.id}-pft`,
      });
    }
    if (/^ECG/i.test(room.label)) {
      push({
        kind: "ecg",
        fixture: true,
        zoneId: room.zoneId,
        roomId: room.id,
        x: room.x + 1.25,
        z: room.z,
        id: `${room.id}-ecg`,
      });
    }
    if (room.zoneId === "eye") {
      push({
        kind: "slit-lamp",
        fixture: true,
        zoneId: room.zoneId,
        roomId: room.id,
        x: room.x + 1.4,
        z: room.z,
        id: `${room.id}-slit`,
      });
    }
    if (room.zoneId === "consults" || room.zoneId === "ypb") {
      push({
        kind: "suture-tray",
        fixture: true,
        zoneId: room.zoneId,
        roomId: room.id,
        x: room.x + 1.35,
        z: room.z + 0.75,
        id: `${room.id}-tray`,
      });
    }
    if (room.zoneId === "lab") {
      push({
        kind: "phlebotomy",
        fixture: true,
        zoneId: room.zoneId,
        roomId: room.id,
        x: room.x,
        z: room.z + 1.15,
        id: `${room.id}-draw`,
      });
    }
  }

  for (const station of layout.stations || []) {
    if (station.kind === "ct") {
      push({
        kind: "ct",
        fixture: true,
        zoneId: station.zoneId,
        x: station.x,
        z: station.z,
        stationId: station.id,
        id: `${station.id}-eq`,
      });
    }
    if (station.kind === "mri") {
      push({
        kind: "mri",
        fixture: true,
        zoneId: station.zoneId,
        x: station.x,
        z: station.z,
        stationId: station.id,
        id: `${station.id}-eq`,
      });
    }
    if (station.kind === "nurse-desk") {
      push({
        kind: "crash-cart",
        fixture: false,
        zoneId: station.zoneId,
        x: station.x + station.w / 2 + 0.7,
        z: station.z + 0.4,
        id: `${station.id}-crash`,
      });
    }
  }

  const stationZone = (layout.zones || []).find((z) => z.kind === "station");
  if (stationZone) {
    const pool = layout.floor === 2
      ? ["ecg", "ecg", "ecg", "nebulizer", "nebulizer", "telemetry", "telemetry", "airway-cart", "airway-cart", "phlebotomy", "phlebotomy", "suture-tray", "portable-xray", "stretcher", "wheelchair", "ventilator", "crash-cart"]
      : ["ultrasound", "ultrasound", "portable-xray", "portable-xray", "portable-xray", "ecg", "ecg", "ecg", "nebulizer", "nebulizer", "suture-tray", "suture-tray", "airway-cart", "ventilator", "phlebotomy", "phlebotomy", "phlebotomy", "crash-cart", "telemetry", "telemetry", "stretcher", "wheelchair", "fetal-monitor"];
    pool.forEach((kind, i) => {
      const cols = 5;
      const c = i % cols;
      const r = Math.floor(i / cols);
      push({
        kind,
        fixture: false,
        zoneId: stationZone.id,
        x: stationZone.x - 2.35 + c * 1.08,
        z: stationZone.z - stationZone.d / 2 + 2.55 + r * 1.02,
        id: `pool:${layout.floor}:${kind}:${i}`,
      });
    });
  }

  const hall = (layout.zones || []).find((z) => z.kind === "circulation");
  if (hall) {
    push({
      kind: "stretcher",
      fixture: false,
      zoneId: hall.id,
      x: hall.x + 8,
      z: hall.z,
      id: `hall-stretcher-${layout.floor}`,
    });
    push({
      kind: "wheelchair",
      fixture: false,
      zoneId: hall.id,
      x: hall.x - 6.5,
      z: hall.z,
      id: `hall-wc-${layout.floor}`,
    });
  }

  return items;
}

function destFor(placement, kind) {
  const h = hash(`${placement.patient.id}:${kind}`);
  const ox = ((h % 5) - 2) * 0.42;
  const oz = ((Math.floor(h / 5) % 3) - 1) * 0.32;
  if (placement.room) {
    return {
      x: placement.room.x + ox,
      z: placement.room.z + placement.room.d / 2 - 0.95 + oz,
      roomId: placement.room.id,
      zoneId: placement.zone.id,
      label: `Room ${placement.room.label}`,
    };
  }
  return {
    x: placement.slot.x + 0.8 + ox * 0.4,
    z: placement.slot.z + 0.45 + oz * 0.4,
    roomId: null,
    zoneId: placement.zone.id,
    label: placement.zone.name,
  };
}

function takeLocal(items, kind, placement) {
  if (placement.room) {
    const sameRoom = items.find(
      (i) => !i.ghost && i.kind === kind && i.status === "available" && i.roomId === placement.room.id,
    );
    if (sameRoom) return sameRoom;
  }
  if (IMMOVABLE.has(kind)) {
    return items.find(
      (i) => !i.ghost && i.kind === kind && i.status === "available" && i.fixture && i.zoneId === placement.zone.id,
    ) || null;
  }
  return null;
}

function takePortable(items, kind) {
  if (IMMOVABLE.has(kind)) return null;
  return items.find((i) => !i.ghost && i.kind === kind && i.status === "available" && !i.fixture) || null;
}

function applyNeed(items, requests, need, dest, owner) {
  if (!KIND_META[need.kind]) return;
  if (requests.some((r) => r.kind === need.kind && r.roomId === dest.roomId && r.zoneId === dest.zoneId)) {
    return;
  }
  const req = {
    id: owner.id,
    kind: need.kind,
    label: need.label || KIND_META[need.kind].label,
    why: need.why,
    mode: need.mode || "pull",
    urgency: need.urgency || "medium",
    patientId: owner.patientId || null,
    patientName: owner.patientName,
    roomId: dest.roomId,
    zoneId: dest.zoneId,
    roomLabel: dest.label,
    slotLabel: owner.slotLabel || dest.label,
    status: "needed",
    assetId: null,
    staff: Boolean(owner.staff),
  };
  requests.push(req);

  const local = takeLocal(items, need.kind, {
    room: dest.roomId ? { id: dest.roomId } : null,
    zone: { id: dest.zoneId },
  });
  if (local) {
    local.status = "in-use";
    local.request = req;
    req.status = "fulfilled";
    req.assetId = local.id;
    return;
  }

  if (need.mode === "occupy") {
    req.status = "fulfilled";
    return;
  }

  if (IMMOVABLE.has(need.kind)) {
    const machine = items.find((i) => !i.ghost && i.kind === need.kind);
    if (!machine) {
      requests.splice(requests.indexOf(req), 1);
      return;
    }
    if (machine.status === "available") {
      machine.status = "in-use";
      machine.request = req;
      req.status = "fulfilled";
    } else {
      req.status = "pulling";
    }
    req.assetId = machine.id;
    return;
  }

  const portable = takePortable(items, need.kind);
  if (portable) {
    const using = need.mode !== "pull";
    portable.status = using ? "in-use" : "requested";
    portable.request = req;
    portable.x = dest.x;
    portable.z = dest.z;
    portable.destRoomId = dest.roomId;
    portable.destZoneId = dest.zoneId;
    portable.destLabel = dest.label;
    req.status = using ? "fulfilled" : "pulling";
    req.assetId = portable.id;
    return;
  }

  items.push({
    id: `need:${req.id}`,
    kind: need.kind,
    label: req.label,
    control: null,
    fixture: false,
    ghost: true,
    status: "needed",
    request: req,
    zoneId: dest.zoneId,
    roomId: dest.roomId,
    homeX: dest.x,
    homeZ: dest.z,
    x: dest.x,
    z: dest.z,
    destRoomId: dest.roomId,
    destZoneId: dest.zoneId,
    destLabel: dest.label,
    stationId: null,
  });
}

export function occupyEquipment(occupied, layout = occupied.layout, indicated = []) {
  const catalog = catalogFor(layout);
  const items = catalog.map((asset) => ({
    ...asset,
    x: asset.homeX,
    z: asset.homeZ,
    status: "available",
    request: null,
    ghost: false,
    destRoomId: null,
    destZoneId: null,
    destLabel: null,
  }));

  const clinical = (occupied.placements || []).filter((pl) => !pl.companion && !pl.staff);
  const requests = [];

  for (const pl of clinical) {
    for (const need of needsFor(pl.patient, pl)) {
      applyNeed(items, requests, need, destFor(pl, need.kind), {
        id: `req:${pl.patient.id}:${need.kind}`,
        patientId: pl.patient.id,
        patientName: pl.patient.name,
        slotLabel: pl.slot.label,
      });
    }
  }

  for (const pull of indicated) {
    if (Number(pull.floor) !== Number(layout.floor)) continue;
    if (!KIND_META[pull.kind]) continue;
    const room = pull.roomId ? (layout.rooms || []).find((r) => r.id === pull.roomId) : null;
    const zone = (layout.zones || []).find((z) => z.id === pull.zoneId) || (layout.zones || [])[0];
    if (!zone) continue;
    const dest = room
      ? destFor({ patient: { id: pull.id }, room, zone, slot: { x: room.x, z: room.z } }, pull.kind)
      : { x: zone.x, z: zone.z, roomId: null, zoneId: zone.id, label: zone.name };
    applyNeed(items, requests, {
      kind: pull.kind,
      label: KIND_META[pull.kind].label,
      why: "Staff indicated",
      mode: "pull",
      urgency: "medium",
    }, dest, {
      id: pull.id || `req:staff:${pull.kind}:${dest.roomId || dest.zoneId}`,
      patientId: null,
      patientName: dest.label,
      slotLabel: dest.label,
      staff: true,
    });
  }

  const open = requests.filter((r) => r.status === "pulling" || r.status === "needed");
  open.sort((a, b) => {
    const rank = { high: 0, medium: 1, low: 2 };
    return (rank[a.urgency] ?? 3) - (rank[b.urgency] ?? 3);
  });

  return {
    items,
    requests,
    open,
    counts: {
      tracked: items.filter((i) => !i.ghost).length,
      available: items.filter((i) => i.status === "available" && !i.ghost).length,
      inUse: items.filter((i) => i.status === "in-use").length,
      requested: items.filter((i) => i.status === "requested").length,
      needed: items.filter((i) => i.status === "needed").length,
    },
  };
}

export function assetById(equipment, id) {
  return equipment?.items?.find((i) => i.id === id) || null;
}

export function kitInRoom(equipment, roomId) {
  if (!equipment || !roomId) return [];
  return equipment.items.filter((i) => i.roomId === roomId || i.destRoomId === roomId);
}

export function kitInZone(equipment, zoneId) {
  if (!equipment || !zoneId) return [];
  return equipment.items.filter((i) => i.zoneId === zoneId || i.destZoneId === zoneId);
}

const VISIT_COPY = {
  preop: "Scheduled surgery",
  imaging: "Scheduled imaging",
  obstetric: "Obstetric visit",
  clinic: "Clinic visit",
  behavioral: "Behavioral visit",
  emergency: "Emergency visit",
};

export const REQUESTABLE = [
  "ecg",
  "ultrasound",
  "portable-xray",
  "nebulizer",
  "suture-tray",
  "crash-cart",
  "airway-cart",
  "phlebotomy",
  "telemetry",
  "ventilator",
  "iv-pump",
  "stretcher",
  "wheelchair",
];

export function visitHeadline(patient) {
  const kind = visitKind(patient);
  const text = `${patient.reason || ""} ${patient.situation || ""} ${patient.summary || ""}`;
  const open = openBlockers(patient);
  const blob = open.map((b) => `${b.title || ""} ${b.detail || ""}`).join(" ");
  if (kind === "preop") return "Scheduled surgery";
  if (/pft|pulmonary function/i.test(text)) return "Pulmonary function test";
  if (open.some((b) => /\bmri\b/i.test(`${b.title || ""} ${b.detail || ""}`)) || /mri/i.test(text)) return "Scheduled MRI";
  if (open.some((b) => /\bct\b/i.test(`${b.title || ""} ${b.detail || ""}`))) return "Scheduled CT";
  if (/laceration|hand surgery|table saw|suture|wound repair/i.test(`${text} ${blob}`)) return "Procedure";
  const imaging = open.find((b) => b.type === "imaging");
  if (imaging) return imaging.title || "Imaging";
  if (kind === "imaging") return "Scheduled imaging";
  if (/eye|dilat|ophthalm|vision/i.test(text)) return "Eye exam";
  if (kind === "obstetric") return "Obstetric visit";
  return patient.reason || VISIT_COPY[kind] || "Visit";
}

function sectionTone(kit, needs) {
  if (kit.some((i) => i.status === "needed") || needs.some((n) => n.status === "needed")) return "alert";
  if (kit.some((i) => i.status === "requested") || needs.some((n) => n.status === "pulling")) return "warn";
  if (kit.some((i) => i.status === "in-use")) return "accent";
  return "quiet";
}

function kitSummary(kit) {
  const seen = [];
  for (const item of kit) {
    const row = seen.find((s) => s.kind === item.kind);
    const rank = item.status === "needed" ? 3 : item.status === "requested" ? 2 : item.status === "in-use" ? 1 : 0;
    if (row) {
      row.count += 1;
      if (rank > row.rank) {
        row.status = item.status;
        row.rank = rank;
      }
    } else {
      seen.push({
        kind: item.kind,
        label: item.label,
        status: item.status,
        count: 1,
        rank,
      });
    }
  }
  seen.sort((a, b) => b.rank - a.rank || a.label.localeCompare(b.label));
  return seen;
}

function makeSection(type, id, title, x, z, zoneId, kit, visits, needs) {
  return {
    type,
    id,
    title,
    x,
    z,
    zoneId,
    kit,
    visits: visits.map((pl) => ({
      patientId: pl.patient.id,
      name: pl.patient.name,
      headline: visitHeadline(pl.patient),
      reason: pl.patient.reason || "",
      urgency: pl.patient.urgency,
      slot: pl.slot.label,
    })),
    needs,
    supplies: kitSummary(kit),
    counts: {
      here: kit.filter((i) => !i.ghost).length,
      needed: kit.filter((i) => i.status === "needed").length,
      requested: kit.filter((i) => i.status === "requested").length,
      inUse: kit.filter((i) => i.status === "in-use").length,
    },
    tone: sectionTone(kit, needs),
  };
}

export function kitSections(occupied) {
  const layout = occupied.layout;
  const items = occupied.equipment?.items || [];
  const requests = occupied.equipment?.requests || [];
  const people = (occupied.placements || []).filter((pl) => !pl.companion && !pl.staff);
  const sections = [];

  for (const room of layout.rooms || []) {
    const kit = kitInRoom(occupied.equipment, room.id);
    const visits = people.filter((pl) => pl.room?.id === room.id);
    const needs = requests.filter((r) => r.roomId === room.id && (r.status === "pulling" || r.status === "needed"));
    if (!kit.length && !needs.length) continue;
    sections.push(makeSection("room", room.id, `Room ${room.label}`, room.x, room.z, room.zoneId, kit, visits, needs));
  }

  for (const zone of layout.zones || []) {
    const kit = items.filter((i) => (
      (i.zoneId === zone.id || i.destZoneId === zone.id) && !i.roomId && !i.destRoomId
    ));
    const visits = people.filter((pl) => pl.zone.id === zone.id && !pl.room);
    const needs = requests.filter((r) => r.zoneId === zone.id && !r.roomId && (r.status === "pulling" || r.status === "needed"));
    if (!kit.length && !needs.length) continue;
    sections.push(makeSection("zone", zone.id, zone.name, zone.x, zone.z, zone.id, kit, visits, needs));
  }

  return sections;
}

export function sectionForItem(item) {
  if (!item) return null;
  if (item.destRoomId) return { type: "room", id: item.destRoomId };
  if (item.roomId) return { type: "room", id: item.roomId };
  if (item.destZoneId) return { type: "zone", id: item.destZoneId };
  if (item.zoneId) return { type: "zone", id: item.zoneId };
  return null;
}
