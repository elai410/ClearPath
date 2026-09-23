import test from "node:test";
import assert from "node:assert/strict";
import { occupyFloor } from "../src/staff/map/bind.js";
import { catalogFor, controlLabel, kitSections, needsFor, occupyEquipment, visitHeadline } from "../src/staff/map/equipment.js";
import { FLOOR_LAYOUT, layoutFor } from "../src/staff/map/layout.js";

test("every clinical bed room has tracked monitors and pumps", () => {
  const catalog = catalogFor(FLOOR_LAYOUT);
  const bedRooms = [...new Set(FLOOR_LAYOUT.slots.filter((s) => s.kind === "bed" && s.roomId).map((s) => s.roomId))];
  assert.ok(bedRooms.length >= 6);
  for (const roomId of bedRooms) {
    assert.ok(catalog.some((a) => a.kind === "monitor" && a.roomId === roomId), `monitor in ${roomId}`);
    assert.ok(catalog.some((a) => a.kind === "iv-pump" && a.roomId === roomId), `pump in ${roomId}`);
  }
  assert.ok(catalog.some((a) => a.kind === "crash-cart"));
  assert.ok(catalog.some((a) => a.kind === "ecg" && !a.fixture));
});

test("kit uses hospital names and biomed control numbers, not type codes", () => {
  const catalog = catalogFor(FLOOR_LAYOUT);
  const suction = catalog.find((a) => a.kind === "suction");
  assert.equal(suction.label, "Wall suction");
  assert.match(suction.control, /^\d{5}$/);
  assert.equal(controlLabel(suction), `Control ${suction.control}`);
  assert.equal(catalog.find((a) => a.kind === "phlebotomy").label, "Phlebotomy cart");
  assert.equal(catalog.find((a) => a.kind === "monitor").label, "Bedside monitor");
  for (const item of catalog) {
    assert.equal(item.tag, undefined);
    assert.doesNotMatch(item.label, /^(MON|SUC|IV|CRASH|DRAW|TEL|STR|WC)-/);
  }
});

test("Fitkin rooms carry PFT, MRI, and slit-lamp kit", () => {
  const f2 = layoutFor(2);
  const catalog = catalogFor(f2);
  assert.ok(catalog.some((a) => a.kind === "pft-rig"));
  assert.ok(catalog.some((a) => a.kind === "mri"));
  assert.ok(catalog.some((a) => a.kind === "slit-lamp"));
});

test("an ECG that is not in the bay opens a request from the visit", () => {
  const occupied = occupyFloor([{
    id: "p-chen",
    name: "Robert Chen",
    department: "emergency",
    status: "in_progress",
    urgency: "high",
    reason: "Dyspnea and palpitations",
    visit_kind: "emergency",
    blockers: [{ type: "imaging", title: "Repeat ECG", detail: "Machine is on the floor, not in this bay.", status: "open" }],
  }]);
  const eq = occupied.equipment;
  const req = eq.requests.find((r) => r.patientId === "p-chen" && r.kind === "ecg");
  assert.ok(req);
  assert.equal(req.status, "pulling");
  const asset = eq.items.find((i) => i.id === req.assetId);
  assert.equal(asset.status, "requested");
  assert.equal(asset.destRoomId, occupied.placements.find((p) => p.patient.id === "p-chen").room.id);
});

test("hand surgery in an ED bay auto-requests a procedure tray", () => {
  const occupied = occupyFloor([{
    id: "p-marcus",
    name: "Marcus Johnson",
    department: "emergency",
    status: "in_progress",
    urgency: "high",
    reason: "Laceration — table saw",
    visit_kind: "emergency",
    blockers: [{ type: "consult", title: "Hand surgery consult", detail: "Not assigned.", status: "open" }],
  }]);
  const req = occupied.equipment.open.find((r) => r.patientId === "p-marcus" && r.kind === "suture-tray");
  assert.ok(req);
  assert.equal(req.status, "pulling");
});

test("pre-op labs in triage open a phlebotomy-cart request without a human click", () => {
  const occupied = occupyFloor([{
    id: "p-ibrahim",
    name: "Ibrahim Hassan",
    department: "triage",
    status: "waiting",
    urgency: "low",
    reason: "Pre-admission testing for scheduled surgery",
    visit_kind: "preop",
    blockers: [{ type: "lab", title: "Pre-op labs", detail: "Has not been.", status: "open" }],
  }]);
  const kinds = occupied.equipment.open.filter((r) => r.patientId === "p-ibrahim").map((r) => r.kind);
  assert.ok(kinds.includes("phlebotomy"));
  assert.ok(kinds.includes("airway-cart"));
});

test("people placement is unchanged when equipment is attached", () => {
  const occupied = occupyFloor([
    { id: "p-wait", name: "Maria Chen", department: "emergency", status: "waiting", wait_minutes: 12, blockers: [] },
    { id: "p-bed", name: "James Carter", department: "emergency", status: "in_progress", wait_minutes: 40, blockers: [] },
  ]);
  const wait = occupied.placements.find((pl) => pl.patient.id === "p-wait");
  const bed = occupied.placements.find((pl) => pl.patient.id === "p-bed");
  assert.equal(wait.slot.kind, "seat");
  assert.equal(bed.slot.kind, "bed");
  assert.ok(occupied.equipment.items.length > 10);
  const kit = occupyEquipment(occupied, FLOOR_LAYOUT);
  assert.equal(kit.counts.tracked, occupied.equipment.counts.tracked);
});

test("needsFor prefers visit work over occupancy kit", () => {
  const needs = needsFor({
    visit_kind: "preop",
    reason: "Pre-admission testing for scheduled surgery",
    urgency: "low",
    blockers: [{ type: "lab", title: "Pre-op labs", status: "open" }],
  }, { slot: { kind: "seat" }, zone: { id: "triage" }, room: null });
  assert.ok(needs.some((n) => n.kind === "phlebotomy" && n.mode === "pull"));
  assert.ok(!needs.some((n) => n.kind === "monitor"));
});

test("equipment layer groups kit into one section per room, not per item", () => {
  const occupied = occupyFloor([
    {
      id: "p-marcus",
      name: "Marcus Johnson",
      department: "emergency",
      status: "in_progress",
      urgency: "high",
      reason: "Laceration — table saw",
      visit_kind: "emergency",
      blockers: [{ type: "consult", title: "Hand surgery consult", detail: "Not assigned.", status: "open" }],
    },
  ]);
  const sections = kitSections(occupied);
  const rooms = sections.filter((s) => s.type === "room");
  assert.ok(rooms.length >= 1);
  const busy = rooms.find((s) => s.visits.some((v) => v.patientId === "p-marcus"));
  assert.ok(busy);
  assert.equal(busy.visits.length, 1);
  assert.equal(busy.visits[0].headline, "Procedure");
  assert.ok(busy.needs.some((n) => n.kind === "suture-tray"));
  assert.ok(busy.supplies.length >= 3);
  assert.ok(busy.kit.length > busy.visits.length);
  const byId = new Set(rooms.map((s) => s.id));
  assert.equal(byId.size, rooms.length);
  assert.equal(visitHeadline({ visit_kind: "preop", reason: "Pre-admission testing for scheduled surgery" }), "Scheduled surgery");
});

test("a staff indication pulls kit to the room without a second scheduler", () => {
  const placed = occupyFloor([{
    id: "p-chen",
    name: "Robert Chen",
    department: "emergency",
    status: "in_progress",
    reason: "Ankle sprain",
  }]);
  const roomId = placed.placements.find((pl) => pl.patient.id === "p-chen").room.id;
  const occupied = occupyFloor([{
    id: "p-chen",
    name: "Robert Chen",
    department: "emergency",
    status: "in_progress",
    reason: "Ankle sprain",
  }], {
    indicated: [{
      id: "staff:1:room:ecg:1",
      kind: "ecg",
      roomId,
      zoneId: "ed-bays",
      floor: 1,
    }],
  });
  const req = occupied.equipment.requests.find((r) => r.kind === "ecg" && r.staff && r.roomId === roomId);
  assert.ok(req);
  assert.equal(req.why, "Staff indicated");
  assert.ok(req.status === "pulling" || req.status === "needed" || req.status === "fulfilled");
});
