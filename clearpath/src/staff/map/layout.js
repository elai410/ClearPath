/**
 * Spatial model of YNHH South Pavilion, floors 1 and 2.
 *
 * Clinical state lives in flow / agent / evidence. This file is geometry.
 */
const BUILDING = { w: 80, d: 56 };
const ORIGIN = { x: BUILDING.w / 2, z: BUILDING.d / 2 };
const INNER_H = 1.42;
const OUTER_H = 3.15;
const WALL_T = 0.22;

function centered(x0, z0, x1, z1) {
  const w = x1 - x0;
  const d = z1 - z0;
  return {
    x: x0 + w / 2 - ORIGIN.x,
    z: z0 + d / 2 - ORIGIN.z,
    w,
    d,
  };
}

function wallX(x0, x1, z, h = INNER_H, t = WALL_T, extra = {}) {
  const a = centered(x0, z - t / 2, x1, z + t / 2);
  return { ...a, h, ...extra };
}

function wallZ(z0, z1, x, h = INNER_H, t = WALL_T, extra = {}) {
  const a = centered(x - t / 2, z0, x + t / 2, z1);
  return { ...a, h, ...extra };
}

function roomWalls(room, door = 1.2) {
  const x0 = room.x - room.w / 2;
  const x1 = room.x + room.w / 2;
  const z0 = room.z - room.d / 2;
  const z1 = room.z + room.d / 2;
  const hx = ORIGIN.x;
  const hz = ORIGIN.z;
  return [
    wallX(x0 + hx, x1 + hx, z1 + hz, INNER_H, 0.12),
    wallZ(z0 + hz, z1 + hz, x0 + hx, INNER_H, 0.12),
    wallZ(z0 + hz, z1 + hz, x1 + hx, INNER_H, 0.12),
    wallX(x0 + hx, room.x + hx - door / 2, z0 + hz, INNER_H, 0.12),
    wallX(room.x + hx + door / 2, x1 + hx, z0 + hz, INNER_H, 0.12),
  ];
}

function grid(x0, z0, cols, rows, dx, dz) {
  const out = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      out.push({
        x: x0 + c * dx - ORIGIN.x,
        z: z0 + r * dz - ORIGIN.z,
        col: c,
        row: r,
      });
    }
  }
  return out;
}

function zone(id, name, department, kind, x0, z0, x1, z1, color, floor) {
  return {
    id,
    name,
    department,
    kind,
    floor,
    color,
    ...centered(x0, z0, x1, z1),
  };
}

function addRooms(rooms, zoneId, labels, x0, z0, cols, w, d, gapX, gapZ, floor) {
  labels.forEach((label, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const box = centered(
      x0 + c * (w + gapX),
      z0 + r * (d + gapZ),
      x0 + c * (w + gapX) + w,
      z0 + r * (d + gapZ) + d,
    );
    rooms.push({
      id: `${zoneId}-${label.toLowerCase().replace(/\s+/g, "-")}`,
      zoneId,
      label,
      kind: "room",
      floor,
      ...box,
    });
  });
}

function finish(floor, name, zones, rooms, slots, stations, extraWalls, path) {
  const walls = [
    wallX(0, 36, 0, OUTER_H, 0.3),
    wallX(44, 80, 0, OUTER_H, 0.3),
    wallX(0, 80, 56, OUTER_H, 0.3),
    wallZ(0, 56, 0, OUTER_H, 0.3),
    wallZ(0, 56, 80, OUTER_H, 0.3),
    ...extraWalls,
  ];
  rooms.forEach((room) => walls.push(...roomWalls(room)));
  zones.forEach((z) => {
    const seats = slots.filter((s) => s.zoneId === z.id && (s.kind === "seat" || s.kind === "visitor")).length;
    const beds = slots.filter((s) => s.zoneId === z.id && (s.kind === "bed" || s.kind === "treatment")).length;
    z.capacity = Math.max(1, seats + beds + slots.filter((s) => s.zoneId === z.id && s.kind === "holding").length);
  });
  return {
    id: `south-pavilion-${floor}`,
    name,
    campus: "Yale New Haven Hospital",
    floor,
    size: BUILDING,
    origin: ORIGIN,
    innerWall: INNER_H,
    outerWall: OUTER_H,
    zones,
    rooms,
    slots,
    stations,
    walls,
    path,
    entrance: { x: 40 - ORIGIN.x, z: 0 - ORIGIN.z },
  };
}

function furnishRoom(slots, room, { beds = 2, treatment = false, visitors = true, bedStart }) {
  const kind = treatment ? "treatment" : "bed";
  const offsets = beds === 2 ? [-1.35, 1.35] : [0];
  offsets.forEach((dx, i) => {
    const n = treatment ? room.label : `Bed ${bedStart + i}`;
    slots.push({
      id: `${room.id}-${kind}-${i + 1}`,
      zoneId: room.zoneId,
      roomId: room.id,
      kind,
      label: n,
      x: room.x + dx,
      z: room.z + 0.45,
      rot: 0,
    });
  });
  slots.push({
    id: `${room.id}-door`,
    zoneId: room.zoneId,
    roomId: room.id,
    kind: "door",
    label: `Door ${room.label}`,
    x: room.x,
    z: room.z - room.d / 2 - 0.5,
    rot: 0,
  });
  if (visitors) {
    offsets.forEach((dx, i) => {
      slots.push({
        id: `${room.id}-visitor-${i + 1}`,
        zoneId: room.zoneId,
        roomId: room.id,
        kind: "visitor",
        label: `Chair ${room.label}${beds > 1 ? String.fromCharCode(65 + i) : ""}`,
        x: room.x + dx,
        z: room.z - 1.85,
        rot: 0,
      });
    });
  }
}

function addSeats(slots, zoneId, x0, z0, cols, rows, dx, dz, start) {
  let n = start;
  grid(x0, z0, cols, rows, dx, dz).forEach((p) => {
    slots.push({
      id: `${zoneId}-seat-${n}`,
      zoneId,
      kind: "seat",
      label: `Seat ${n}`,
      x: p.x,
      z: p.z,
      rot: 0,
    });
    n += 1;
  });
  return n;
}

function addStaff(slots, zoneId, x0, z0, label, role = "nurse", pose = "standing") {
  slots.push({
    id: `${zoneId}-staff-${label.toLowerCase().replace(/\s+/g, "-")}`,
    zoneId,
    kind: "staff",
    label,
    role,
    pose,
    x: x0 - ORIGIN.x,
    z: z0 - ORIGIN.z,
    rot: 0,
  });
}

function buildFloor1() {
  const floor = 1;
  const zones = [
    zone("triage", "Admitting & Triage", "triage", "intake", 0, 0, 18, 17, "#dfe8ea", floor),
    zone("ed-waiting", "Adult Emergency waiting", "emergency", "waiting", 18, 0, 42, 17, "#e7dfd2", floor),
    zone("discharge", "Discharge lounge", "emergency", "discharge", 42, 0, 58, 17, "#e4eadc", floor),
    zone("rabies", "Rabies Vaccine Clinic", "rabies", "clinic", 58, 0, 80, 17, "#dce6ef", floor),
    zone("hallway", "Main corridor", "atrium", "circulation", 0, 17, 80, 23.5, "#d2cbc0", floor),
    zone("imaging", "Diagnostics · Clinic", "clinicbldg", "diagnostics", 0, 23.5, 20, 43, "#dce8e3", floor),
    zone("station", "Nurse station", "emergency", "station", 20, 23.5, 34, 43, "#d8e0e2", floor),
    zone("ed-bays", "Adult Emergency bays", "emergency", "clinical", 34, 23.5, 58, 43, "#ece4d8", floor),
    zone("peds", "Pediatric Emergency", "pediatric", "clinical", 58, 23.5, 80, 43, "#e4e0ee", floor),
    zone("north", "North Pavilion", "north", "specialty", 0, 43, 22, 56, "#e2e8ea", floor),
    zone("dana", "Dana Building", "dana", "specialty", 22, 43, 42, 56, "#dfeae4", floor),
    zone("ypb", "Yale Physicians Building", "ypb", "specialty", 42, 43, 60, 56, "#e2e8ea", floor),
    zone("winchester", "Winchester Building", "winchester", "behavioral", 60, 43, 80, 56, "#e2dde8", floor),
  ];

  const rooms = [];
  addRooms(rooms, "ed-bays", ["208", "209", "210", "211", "212", "213"], 35.0, 25.2, 3, 7.2, 7.4, 0.45, 0.55, floor);
  addRooms(rooms, "peds", ["220", "221", "222", "223"], 59.4, 25.4, 2, 9.0, 7.4, 0.55, 0.55, floor);
  addRooms(rooms, "imaging", ["CT-1", "US-1", "US-2"], 1.5, 25.0, 1, 16.8, 5.0, 0.4, 0.45, floor);
  addRooms(rooms, "north", ["301", "302", "303"], 1.3, 44.2, 3, 6.0, 9.4, 0.5, 0.4, floor);
  addRooms(rooms, "dana", ["110", "111"], 23.2, 44.2, 2, 8.2, 9.4, 0.55, 0.4, floor);
  addRooms(rooms, "ypb", ["120", "121"], 43.2, 44.2, 2, 7.6, 9.4, 0.5, 0.4, floor);
  addRooms(rooms, "winchester", ["401", "402"], 61.4, 44.2, 2, 8.2, 9.4, 0.55, 0.4, floor);
  addRooms(rooms, "rabies", ["A3"], 63.2, 2.6, 1, 14.2, 8.0, 0.4, 0.4, floor);

  const slots = [];
  let seatN = 1;
  seatN = addSeats(slots, "triage", 2.2, 2.6, 4, 3, 1.18, 1.22, seatN);
  seatN = addSeats(slots, "ed-waiting", 20.0, 2.4, 8, 3, 1.2, 1.22, seatN);
  seatN = addSeats(slots, "discharge", 44.2, 3.0, 5, 2, 1.18, 1.22, seatN);
  seatN = addSeats(slots, "rabies", 59.2, 11.6, 4, 2, 1.18, 1.2, seatN);
  addSeats(slots, "peds", 59.6, 40.4, 4, 2, 1.2, 1.15, seatN);

  let bedN = 1;
  rooms.forEach((room) => {
    const clinical = room.zoneId === "ed-bays" || room.zoneId === "peds";
    const treatment = room.zoneId === "imaging";
    const double = clinical || room.zoneId === "winchester";
    furnishRoom(slots, room, {
      beds: double ? 2 : treatment ? 1 : 1,
      treatment,
      visitors: !treatment,
      bedStart: bedN,
    });
    if (!treatment) bedN += double ? 2 : 1;
  });

  grid(21.6, 26.0, 2, 3, 1.35, 1.4).forEach((p, i) => {
    slots.push({
      id: `station-hold-${i + 1}`,
      zoneId: "station",
      kind: "holding",
      label: `Holding ${i + 1}`,
      x: p.x,
      z: p.z,
      rot: 0,
    });
  });

  const path = [
    { x: 6 - ORIGIN.x, z: 20.2 - ORIGIN.z },
    { x: 24 - ORIGIN.x, z: 20.2 - ORIGIN.z },
    { x: 42 - ORIGIN.x, z: 20.2 - ORIGIN.z },
    { x: 62 - ORIGIN.x, z: 20.2 - ORIGIN.z },
    { x: 42 - ORIGIN.x, z: 20.2 - ORIGIN.z },
    { x: 42 - ORIGIN.x, z: 32 - ORIGIN.z },
  ];
  path.forEach((p, i) => {
    slots.push({
      id: `f1-path-${i + 1}`,
      zoneId: "hallway",
      kind: "path",
      label: "In transport",
      x: p.x,
      z: p.z,
      rot: 0,
    });
  });

  addStaff(slots, "triage", 7.2, 13.0, "Triage RN", "nurse");
  addStaff(slots, "triage", 11.2, 13.0, "Registrar", "clerk");
  addStaff(slots, "station", 24.6, 33.2, "Charge RN", "nurse");
  addStaff(slots, "station", 27.2, 33.2, "ED tech", "tech");
  addStaff(slots, "station", 29.8, 33.4, "Dr. Patel", "physician");
  addStaff(slots, "hallway", 16, 20.2, "Transport", "tech", "standing");
  addStaff(slots, "hallway", 52, 20.4, "Housekeeping", "tech", "standing");
  addStaff(slots, "imaging", 10.8, 31.2, "CT tech", "tech");
  addStaff(slots, "peds", 62.4, 34.6, "Peds RN", "nurse");
  addStaff(slots, "ed-waiting", 30.5, 13.6, "ED greeter", "clerk");

  const stations = [
    { id: "triage-desk", zoneId: "triage", kind: "desk", label: "Triage desk", x: 9 - ORIGIN.x, z: 13.4 - ORIGIN.z, w: 5.2, d: 1.15 },
    { id: "discharge-desk", zoneId: "discharge", kind: "desk", label: "Discharge desk", x: 50 - ORIGIN.x, z: 13.2 - ORIGIN.z, w: 4.2, d: 1.15 },
    { id: "nurse-desk", zoneId: "station", kind: "nurse-desk", label: "Nurse station", x: 27 - ORIGIN.x, z: 34.5 - ORIGIN.z, w: 9.2, d: 3.6 },
    { id: "ct-gantry", zoneId: "imaging", kind: "ct", label: "CT", x: 10 - ORIGIN.x, z: 27.4 - ORIGIN.z, w: 2.4, d: 2.4 },
    { id: "elevators-1", zoneId: "hallway", kind: "elevators", label: "Elevators", x: 40 - ORIGIN.x, z: 20.2 - ORIGIN.z, w: 4.4, d: 2.2 },
  ];

  const extraWalls = [
    wallX(0, 80, 17, INNER_H, 0.16, { glass: true }),
    wallX(0, 80, 23.5, INNER_H, 0.16, { glass: true }),
    wallX(0, 80, 43, INNER_H, 0.14),
    wallZ(0, 17, 18, INNER_H, 0.14),
    wallZ(0, 17, 42, INNER_H, 0.14),
    wallZ(0, 17, 58, INNER_H, 0.14),
    wallZ(23.5, 43, 20, INNER_H, 0.14),
    wallZ(23.5, 43, 34, INNER_H, 0.14),
    wallZ(23.5, 43, 58, INNER_H, 0.14),
    wallZ(43, 56, 22, INNER_H, 0.14),
    wallZ(43, 56, 42, INNER_H, 0.14),
    wallZ(43, 56, 60, INNER_H, 0.14),
  ];

  return finish(floor, "Floor 1 · South Pavilion", zones, rooms, slots, stations, extraWalls, path);
}

function buildFloor2() {
  const floor = 2;
  const zones = [
    zone("fitkin-waiting", "Fitkin waiting", "fitkin", "waiting", 0, 0, 28, 17, "#dce8e3", floor),
    zone("pft", "Pulmonary / ECG", "fitkin", "diagnostics", 28, 0, 54, 17, "#e2eae6", floor),
    zone("pharmacy", "Pharmacy", "fitkin", "pharmacy", 54, 0, 80, 17, "#e4eadc", floor),
    zone("hallway", "Floor 2 corridor", "atrium", "circulation", 0, 17, 80, 23.5, "#d2cbc0", floor),
    zone("mri", "Imaging · MRI", "fitkin", "diagnostics", 0, 23.5, 22, 43, "#d5e4df", floor),
    zone("station2", "Fitkin nurse station", "fitkin", "station", 22, 23.5, 36, 43, "#d8e0e2", floor),
    zone("obs", "Observation", "fitkin", "clinical", 36, 23.5, 80, 43, "#ece4d8", floor),
    zone("lab", "Laboratory", "fitkin", "diagnostics", 0, 43, 22, 56, "#e2e8ea", floor),
    zone("eye", "Ophthalmology · Dana", "dana", "specialty", 22, 43, 52, 56, "#dfeae4", floor),
    zone("consults", "Consult rooms", "ypb", "specialty", 52, 43, 80, 56, "#e2e8ea", floor),
  ];

  const rooms = [];
  addRooms(rooms, "pft", ["PFT-1", "PFT-2", "ECG-1", "ECG-2"], 29.2, 2.4, 4, 5.6, 12.8, 0.45, 0.4, floor);
  addRooms(rooms, "mri", ["MRI-1", "US-3"], 1.6, 25.0, 1, 18.4, 7.4, 0.4, 0.5, floor);
  addRooms(rooms, "obs", ["501", "502", "503", "504", "505", "506"], 37.2, 25.2, 3, 13.2, 7.4, 0.5, 0.55, floor);
  addRooms(rooms, "lab", ["Draw-1", "Draw-2"], 1.5, 44.4, 2, 9.0, 9.2, 0.5, 0.4, floor);
  addRooms(rooms, "eye", ["210", "211", "212"], 23.4, 44.4, 3, 8.6, 9.2, 0.5, 0.4, floor);
  addRooms(rooms, "consults", ["220", "221"], 53.6, 44.4, 2, 12.0, 9.2, 0.55, 0.4, floor);
  addRooms(rooms, "pharmacy", ["Rx"], 60.0, 2.8, 1, 16.4, 8.4, 0.4, 0.4, floor);

  const slots = [];
  let seatN = 1;
  seatN = addSeats(slots, "fitkin-waiting", 2.4, 2.6, 8, 3, 1.18, 1.22, seatN);
  addSeats(slots, "pharmacy", 55.6, 12.2, 4, 2, 1.18, 1.2, seatN);

  let bedN = 40;
  rooms.forEach((room) => {
    const obs = room.zoneId === "obs";
    const treatment = ["pft", "mri", "lab"].includes(room.zoneId);
    furnishRoom(slots, room, {
      beds: obs ? 2 : 1,
      treatment,
      visitors: obs || room.zoneId === "eye" || room.zoneId === "consults",
      bedStart: bedN,
    });
    if (!treatment) bedN += obs ? 2 : 1;
  });

  grid(24.0, 26.2, 2, 3, 1.35, 1.4).forEach((p, i) => {
    slots.push({
      id: `f2-hold-${i + 1}`,
      zoneId: "station2",
      kind: "holding",
      label: `Holding ${i + 1}`,
      x: p.x,
      z: p.z,
      rot: 0,
    });
  });

  const path = [
    { x: 8 - ORIGIN.x, z: 20.2 - ORIGIN.z },
    { x: 28 - ORIGIN.x, z: 20.2 - ORIGIN.z },
    { x: 50 - ORIGIN.x, z: 20.2 - ORIGIN.z },
    { x: 68 - ORIGIN.x, z: 20.2 - ORIGIN.z },
    { x: 50 - ORIGIN.x, z: 20.2 - ORIGIN.z },
    { x: 50 - ORIGIN.x, z: 33 - ORIGIN.z },
  ];
  path.forEach((p, i) => {
    slots.push({
      id: `f2-path-${i + 1}`,
      zoneId: "hallway",
      kind: "path",
      label: "In transport",
      x: p.x,
      z: p.z,
      rot: 0,
    });
  });

  addStaff(slots, "fitkin-waiting", 12.2, 13.1, "Fitkin clerk", "clerk");
  addStaff(slots, "fitkin-waiting", 16.4, 13.1, "Fitkin RN", "nurse");
  addStaff(slots, "station2", 26.6, 33.4, "Obs charge", "nurse");
  addStaff(slots, "station2", 29.2, 33.2, "Telemetry tech", "tech");
  addStaff(slots, "station2", 31.8, 33.4, "Hospitalist", "physician");
  addStaff(slots, "pharmacy", 60.4, 13.0, "Pharmacist", "pharmacist");
  addStaff(slots, "pharmacy", 64.6, 13.0, "Pharmacy tech", "tech");
  addStaff(slots, "mri", 16.8, 31.6, "MRI tech", "tech");
  addStaff(slots, "pft", 36.4, 12.8, "PFT tech", "tech");
  addStaff(slots, "lab", 8.4, 50.6, "Phlebotomist", "tech");
  addStaff(slots, "hallway", 22, 20.2, "Transporter", "tech", "standing");
  addStaff(slots, "hallway", 58, 20.3, "Unit clerk", "clerk", "standing");
  addStaff(slots, "obs", 48, 34.8, "Obs RN", "nurse");
  addStaff(slots, "eye", 38, 50.4, "Ophtho tech", "tech");

  const stations = [
    { id: "fitkin-desk", zoneId: "fitkin-waiting", kind: "desk", label: "Fitkin desk", x: 14 - ORIGIN.x, z: 13.4 - ORIGIN.z, w: 5.4, d: 1.15 },
    { id: "rx-window", zoneId: "pharmacy", kind: "desk", label: "Pharmacy window", x: 62 - ORIGIN.x, z: 13.4 - ORIGIN.z, w: 6.0, d: 1.15 },
    { id: "rx-shelves", zoneId: "pharmacy", kind: "shelves", label: "Medication shelves", x: 70 - ORIGIN.x, z: 8.4 - ORIGIN.z, w: 5.6, d: 0.5 },
    { id: "fitkin-nurse", zoneId: "station2", kind: "nurse-desk", label: "Fitkin nurse station", x: 29 - ORIGIN.x, z: 34.6 - ORIGIN.z, w: 9.0, d: 3.6 },
    { id: "mri-gantry", zoneId: "mri", kind: "mri", label: "MRI", x: 11 - ORIGIN.x, z: 28.6 - ORIGIN.z, w: 3.2, d: 3.2 },
    { id: "mri-control", zoneId: "mri", kind: "desk", label: "MRI control", x: 16.6 - ORIGIN.x, z: 39.2 - ORIGIN.z, w: 3.6, d: 1.0 },
    { id: "lab-bench-1", zoneId: "lab", kind: "lab-bench", label: "Draw bench", x: 7 - ORIGIN.x, z: 49.6 - ORIGIN.z, w: 6.4, d: 1.2 },
    { id: "elevators-2", zoneId: "hallway", kind: "elevators", label: "Elevators", x: 40 - ORIGIN.x, z: 20.2 - ORIGIN.z, w: 4.4, d: 2.2 },
  ];

  const extraWalls = [
    wallX(0, 80, 17, INNER_H, 0.16, { glass: true }),
    wallX(0, 80, 23.5, INNER_H, 0.16, { glass: true }),
    wallX(0, 80, 43, INNER_H, 0.14),
    wallZ(0, 17, 28, INNER_H, 0.14),
    wallZ(0, 17, 54, INNER_H, 0.14),
    wallZ(23.5, 43, 22, INNER_H, 0.14),
    wallZ(23.5, 43, 36, INNER_H, 0.14),
    wallZ(43, 56, 22, INNER_H, 0.14),
    wallZ(43, 56, 52, INNER_H, 0.14),
  ];

  return finish(floor, "Floor 2 · Fitkin", zones, rooms, slots, stations, extraWalls, path);
}

export const FLOORS = {
  1: buildFloor1(),
  2: buildFloor2(),
};

export const FLOOR_LAYOUT = FLOORS[1];

export function layoutFor(floor) {
  return FLOORS[Number(floor)] || FLOORS[1];
}

export function areaJumps(layout = FLOOR_LAYOUT) {
  return layout.zones
    .filter((z) => z.kind !== "circulation")
    .map((z) => ({ id: z.id, name: z.name, x: z.x, z: z.z, floor: layout.floor }));
}

export const AREA_JUMPS = areaJumps(FLOOR_LAYOUT);

export function zoneById(id, layout = FLOOR_LAYOUT) {
  return layout.zones.find((z) => z.id === id) || null;
}

export function roomById(id, layout = FLOOR_LAYOUT) {
  return layout.rooms.find((r) => r.id === id) || null;
}

export function slotById(id, layout = FLOOR_LAYOUT) {
  return layout.slots.find((s) => s.id === id) || null;
}
