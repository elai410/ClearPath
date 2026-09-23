import { occupyEquipment } from "./equipment.js";
import { FLOOR_LAYOUT } from "./layout.js";

const KIND_FOR_STATUS = {
  waiting: "seat",
  called: "door",
  in_progress: "bed",
  pending_signature: "seat",
  pending_test: "treatment",
  pending_transport: "path",
  pending_bed: "holding",
};

function hash(text) {
  let h = 2166136261;
  for (const ch of String(text)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

function pickFrom(list, seed) {
  if (!list.length) return null;
  return list[hash(seed) % list.length];
}

function openBlockers(patient) {
  return (patient.blockers || []).filter((b) => b.status !== "resolved");
}

export function onThisFloor(patient, layout = FLOOR_LAYOUT) {
  if (patient.status === "discharged") return false;
  const declared = String(patient.floor || "");
  if (layout.floor === 2) {
    return declared === "2" || patient.department === "fitkin";
  }
  return declared !== "2" && patient.department !== "fitkin";
}

function roomKey(value) {
  return String(value || "").trim().toLowerCase();
}

/** Seed/census "room" is a cubicle label on this floor, not a second clinical record. */
export function roomHint(patient, layout = FLOOR_LAYOUT) {
  const want = roomKey(patient.room);
  if (!want) return null;
  return (
    layout.rooms.find(
      (r) => roomKey(r.label) === want || roomKey(r.id) === want || roomKey(r.id).endsWith(`-${want}`),
    ) || null
  );
}

function slotsForRoom(slots, patient, layout) {
  const hinted = roomHint(patient, layout);
  if (!hinted) return slots;
  const hits = slots.filter((s) => s.roomId === hinted.id);
  return hits.length ? hits : slots;
}

export function zoneForPatient(patient, layout = FLOOR_LAYOUT) {
  const hinted = roomHint(patient, layout);
  if (hinted) {
    return layout.zones.find((z) => z.id === hinted.zoneId) || layout.zones[0];
  }
  const open = openBlockers(patient);
  if (layout.floor === 1 && patient.status === "pending_test" && open.some((b) => b.type === "imaging")) {
    return layout.zones.find((z) => z.id === "imaging") || layout.zones[0];
  }
  if (patient.department === "fitkin") {
    const text = `${patient.reason || ""} ${patient.situation || ""}`;
    if (open.some((b) => b.type === "pharmacy") || /pharmac|prescription|to-go med/i.test(text)) {
      return layout.zones.find((z) => z.id === "pharmacy") || layout.zones[0];
    }
    if (patient.status === "waiting") {
      return layout.zones.find((z) => z.id === "fitkin-waiting") || layout.zones.find((z) => z.department === "fitkin") || layout.zones[0];
    }
    if (/mri/i.test(text)) {
      return layout.zones.find((z) => z.id === "mri") || layout.zones[0];
    }
    if (/lab|phlebotomy|blood draw/i.test(text) && !/pft|ecg|pulmonary/i.test(text)) {
      return layout.zones.find((z) => z.id === "lab") || layout.zones[0];
    }
    if (patient.status === "pending_test" || /pft|ecg|pulmonary|x-ray|film/i.test(text)) {
      return layout.zones.find((z) => z.id === "pft") || layout.zones.find((z) => z.id === "mri") || layout.zones[0];
    }
    if (patient.status === "in_progress") {
      return layout.zones.find((z) => z.id === "obs" || z.kind === "clinical") || layout.zones[0];
    }
    return layout.zones.find((z) => z.department === "fitkin") || layout.zones[0];
  }
  if (patient.department === "clinicbldg") {
    return layout.zones.find((z) => z.id === "imaging" || z.id === "mri") || layout.zones[0];
  }
  if (patient.department === "atrium") {
    return layout.zones.find((z) => z.kind === "circulation") || layout.zones[0];
  }
  const matches = layout.zones.filter((z) => z.department === patient.department);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    if (patient.status === "waiting") {
      return matches.find((z) => z.kind === "waiting" || z.kind === "intake") || matches[0];
    }
    if (patient.status === "pending_signature" || patient.stage === "discharge_prep") {
      return matches.find((z) => z.kind === "discharge") || matches.find((z) => z.kind === "clinical") || matches[0];
    }
    if (patient.status === "pending_bed") {
      return matches.find((z) => z.kind === "station") || matches[0];
    }
    return matches.find((z) => z.kind === "clinical" || z.kind === "specialty") || matches[0];
  }
  return layout.zones[0];
}

function pickSlot(patient, zone, used, layout = FLOOR_LAYOUT) {
  const want = KIND_FOR_STATUS[patient.status] || "seat";
  const inZone = (kind) =>
    slotsForRoom(
      layout.slots.filter((s) => s.zoneId === zone.id && s.kind === kind && !used.has(s.id)),
      patient,
      layout,
    );

  const preferred = inZone(want);
  if (want === "bed" && preferred.length) {
    const occupiedRooms = new Set(
      layout.slots.filter((s) => s.zoneId === zone.id && s.kind === "bed" && used.has(s.id)).map((s) => s.roomId),
    );
    const pair = preferred.filter((s) => occupiedRooms.has(s.roomId));
    if (pair.length) return pickFrom(pair, patient.id);
    return pickFrom(preferred, patient.id);
  }
  if (preferred.length) return pickFrom(preferred, patient.id);

  if (want === "bed") {
    const treatment = inZone("treatment");
    if (treatment.length) return pickFrom(treatment, patient.id);
  }

  if (want === "treatment") {
    const beds = inZone("bed");
    if (beds.length) return pickFrom(beds, patient.id);
  }
  if (want === "door") {
    const seats = inZone("seat");
    if (seats.length) return pickFrom(seats, patient.id);
  }
  if (want === "seat") {
    const visitors = inZone("visitor");
    if (visitors.length) return pickFrom(visitors, patient.id);
    const doors = inZone("door");
    if (doors.length) return pickFrom(doors, patient.id);
  }
  if (want === "holding") {
    const seats = inZone("seat");
    if (seats.length) return pickFrom(seats, patient.id);
  }

  const sameDept = layout.zones.filter((z) => z.department === zone.department).map((z) => z.id);
  const deptKind = slotsForRoom(
    layout.slots.filter((s) => sameDept.includes(s.zoneId) && s.kind === want && !used.has(s.id)),
    patient,
    layout,
  );
  if (deptKind.length) return pickFrom(deptKind, patient.id);

  const globalKind = slotsForRoom(
    layout.slots.filter((s) => s.kind === want && !used.has(s.id)),
    patient,
    layout,
  );
  if (globalKind.length) return pickFrom(globalKind, patient.id);

  const anyInZone = slotsForRoom(
    layout.slots.filter(
      (s) => s.zoneId === zone.id && !used.has(s.id) && s.kind !== "visitor" && s.kind !== "staff",
    ),
    patient,
    layout,
  );
  if (anyInZone.length) return pickFrom(anyInZone, patient.id);

  return {
    id: `overflow-${patient.id}`,
    zoneId: zone.id,
    kind: "overflow",
    label: zone.name,
    x: zone.x,
    z: zone.z,
    rot: 0,
  };
}

function poseFor(slot, patient) {
  if (slot.kind === "bed" || slot.kind === "treatment") return "recumbent";
  if (slot.kind === "path" || patient.status === "pending_transport") return "walking";
  if (slot.kind === "door" || patient.status === "called") return "standing";
  return "seated";
}

function placeOne(patient, used, layout, extra) {
  const zone = zoneForPatient(patient, layout);
  const slot = pickSlot(patient, zone, used, layout);
  used.add(slot.id);
  const open = openBlockers(patient);
  const vitals = extra.bedsByPatient[patient.id] || null;
  const exception = Boolean(vitals?.exception || extra.holds.has(patient.id));
  return {
    patient,
    slot,
    zone,
    room: slot.roomId ? layout.rooms.find((r) => r.id === slot.roomId) || null : null,
    pose: poseFor(slot, patient),
    vitals,
    exception,
    opportunity: extra.recommendedId === patient.id,
    companion: Boolean(patient.companion),
    staff: false,
    flags: {
      stuck: Boolean(patient.is_stuck),
      blocked: open.length > 0,
      exception,
      opportunity: extra.recommendedId === patient.id,
      hot: Boolean(patient.is_stuck || exception || extra.recommendedId === patient.id || open.some((b) => b.overdue)),
    },
  };
}

function visitorFor(placement, used, layout) {
  if (placement.companion || placement.staff || placement.pose !== "recumbent" || !placement.room) return null;
  const chair = layout.slots.find(
    (s) => s.roomId === placement.room.id && s.kind === "visitor" && !used.has(s.id),
  );
  if (!chair) return null;
  used.add(chair.id);
  const first = String(placement.patient.name || "Patient").split(" ")[0];
  return {
    patient: {
      id: `with:${placement.patient.id}`,
      name: `${first}'s visitor`,
      department: placement.patient.department,
      status: "waiting",
      wait_minutes: placement.patient.wait_minutes,
      stage_label: "With family",
      blockers: [],
      companion: true,
      visiting: placement.patient.name,
    },
    slot: chair,
    zone: placement.zone,
    room: placement.room,
    pose: "seated",
    vitals: null,
    exception: false,
    opportunity: false,
    companion: true,
    staff: false,
    flags: { stuck: false, blocked: false, exception: false, opportunity: false, hot: false },
  };
}

function ghostPerson(id, name, slot, zone, room, pose, extra = {}) {
  return {
    patient: {
      id,
      name,
      department: zone?.department,
      status: extra.status || "on_duty",
      wait_minutes: 0,
      stage_label: extra.stage || extra.role || "Staff",
      blockers: [],
      staff: true,
      role: extra.role,
    },
    slot,
    zone,
    room: room || null,
    pose,
    vitals: null,
    exception: false,
    opportunity: false,
    companion: false,
    staff: true,
    flags: { stuck: false, blocked: false, exception: false, opportunity: false, hot: false },
  };
}

function clinicianFor(placement, used) {
  if (placement.companion || placement.staff || placement.pose !== "recumbent" || !placement.room) return null;
  if (hash(placement.patient.id) % 2 !== 0) return null;
  const id = `staff:bed:${placement.patient.id}`;
  const slot = {
    id,
    zoneId: placement.zone.id,
    roomId: placement.room.id,
    kind: "staff",
    label: hash(placement.patient.id) % 3 === 0 ? "Physician" : "Bedside RN",
    x: placement.slot.x + 0.95,
    z: placement.slot.z - 0.12,
    rot: -0.35,
    pose: "standing",
    role: hash(placement.patient.id) % 3 === 0 ? "physician" : "nurse",
  };
  used.add(id);
  return ghostPerson(id, slot.label, slot, placement.zone, placement.room, "standing", { role: slot.role, stage: "With patient" });
}

function stationedStaff(layout, used) {
  return layout.slots
    .filter((s) => s.kind === "staff" && !used.has(s.id))
    .map((slot) => {
      used.add(slot.id);
      const zone = layout.zones.find((z) => z.id === slot.zoneId) || layout.zones[0];
      const room = slot.roomId ? layout.rooms.find((r) => r.id === slot.roomId) || null : null;
      return ghostPerson(`staff:${slot.id}`, slot.label, slot, zone, room, slot.pose || "standing", {
        role: slot.role,
        stage: slot.role === "physician" ? "On round" : "On duty",
      });
    });
}

export function occupyFloor(patients = [], { agent, flow, floor, indicated } = {}, layout = FLOOR_LAYOUT) {
  const beds = agent?.beds?.length ? agent.beds : (floor?.agent?.beds || []);
  const bedsByPatient = Object.fromEntries(beds.map((b) => [b.patientId, b]));
  const queues = Object.fromEntries((flow?.queues || []).map((q) => [q.department, q]));
  const recommendedId = floor?.control?.recommended?.patientId || null;
  const holdList = agent?.holds?.length ? agent.holds : (floor?.agent?.holds || []);
  const holds = new Set(holdList.map((h) => h.patientId));
  const extra = { bedsByPatient, recommendedId, holds };

  const used = new Set();
  const ordered = [...patients]
    .filter((p) => onThisFloor(p, layout))
    .sort((a, b) => {
      const hinted = (roomHint(a, layout) ? 0 : 1) - (roomHint(b, layout) ? 0 : 1);
      if (hinted) return hinted;
      return String(a.id).localeCompare(String(b.id));
    });

  const placements = ordered.map((patient) => placeOne(patient, used, layout, extra));
  const visitors = [];
  const clinicians = [];
  for (const pl of placements) {
    const visitor = visitorFor(pl, used, layout);
    if (visitor) visitors.push(visitor);
    const clinician = clinicianFor(pl, used);
    if (clinician) clinicians.push(clinician);
  }
  const crew = stationedStaff(layout, used);
  const all = placements.concat(visitors, clinicians, crew);

  const predictions = flow?.predictions || [];
  const areas = layout.zones.map((zone) => {
    const here = all.filter((pl) => pl.zone.id === zone.id);
    const patientsHere = here.filter((pl) => !pl.companion && !pl.staff);
    const queue = queues[zone.department];
    const prediction = predictions.find((p) =>
      (p.id || "").includes(zone.department) || (p.detail || "").toLowerCase().includes((zone.name || "").toLowerCase().split(" ")[0]),
    ) || (zone.department === "emergency" ? predictions.find((p) => p.id === "ed-wait") : null)
      || (zone.kind === "diagnostics" ? predictions.find((p) => p.id === "diagnostics") : null)
      || (zone.kind === "discharge" ? predictions.find((p) => p.id === "discharge-cluster") : null);
    return {
      ...zone,
      occupants: here,
      occupancy: patientsHere.length,
      waiting: patientsHere.filter((pl) => pl.patient.status === "waiting").length,
      stuck: patientsHere.filter((pl) => pl.flags.stuck).length,
      high: patientsHere.filter((pl) => pl.patient.urgency === "high").length,
      congestion: queue?.congestion || (patientsHere.length >= zone.capacity ? "forming" : "steady"),
      avgWait: queue?.avgWait || 0,
      prediction,
      resources: {
        seats: layout.slots.filter((s) => s.zoneId === zone.id && s.kind === "seat").length,
        beds: layout.slots.filter((s) => s.zoneId === zone.id && s.kind === "bed").length,
        treatment: layout.slots.filter((s) => s.zoneId === zone.id && s.kind === "treatment").length,
      },
    };
  });

  const occupied = {
    layout,
    placements: all,
    areas,
    path: layout.path,
    hot: all.filter((pl) => pl.flags.hot),
  };
  occupied.equipment = occupyEquipment(occupied, layout, indicated || []);
  return occupied;
}

export function areaById(occupied, id) {
  return occupied.areas.find((a) => a.id === id) || null;
}

export function placementByPatient(occupied, patientId) {
  return occupied.placements.find((pl) => pl.patient.id === patientId) || null;
}
