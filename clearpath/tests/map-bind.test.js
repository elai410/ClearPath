import test from "node:test";
import assert from "node:assert/strict";
import { occupyFloor, zoneForPatient } from "../src/staff/map/bind.js";
import { FLOOR_LAYOUT, layoutFor } from "../src/staff/map/layout.js";
import { overlayFor, overlayLines } from "../src/staff/map/overlays.js";

test("layout has one floor of rooms, seats, and beds", () => {
  assert.equal(FLOOR_LAYOUT.floor, 1);
  assert.ok(FLOOR_LAYOUT.zones.length >= 8);
  assert.ok(FLOOR_LAYOUT.slots.some((s) => s.kind === "seat"));
  assert.ok(FLOOR_LAYOUT.slots.some((s) => s.kind === "bed"));
  assert.ok(FLOOR_LAYOUT.slots.some((s) => s.label === "Seat 14"));
  const roomBeds = FLOOR_LAYOUT.slots.filter((s) => s.roomId?.includes("ed-bays-208") && s.kind === "bed");
  assert.equal(roomBeds.length, 2);
});

test("floor 2 is a separate Fitkin layout", () => {
  const f2 = layoutFor(2);
  assert.equal(f2.floor, 2);
  assert.ok(f2.zones.some((z) => z.id === "fitkin-waiting"));
  assert.ok(f2.zones.some((z) => z.id === "obs"));
  const occupied = occupyFloor([
    { id: "p-f2", name: "Linda Hoffman", department: "fitkin", floor: "2", status: "waiting", blockers: [] },
    { id: "p-f1", name: "James Carter", department: "emergency", floor: "1", status: "in_progress", blockers: [] },
  ], {}, f2);
  assert.equal(occupied.placements.filter((pl) => !pl.companion && !pl.staff).length, 1);
  assert.equal(occupied.placements[0].patient.id, "p-f2");
});

test("waiting patients sit in their department; in-progress patients take beds", () => {
  const occupied = occupyFloor([
    { id: "p-wait", name: "Maria Chen", department: "emergency", status: "waiting", wait_minutes: 12, blockers: [] },
    { id: "p-bed", name: "James Carter", department: "emergency", status: "in_progress", wait_minutes: 40, blockers: [] },
  ]);
  const wait = occupied.placements.find((pl) => pl.patient.id === "p-wait");
  const bed = occupied.placements.find((pl) => pl.patient.id === "p-bed");
  assert.equal(wait.slot.kind, "seat");
  assert.equal(wait.zone.department, "emergency");
  assert.equal(bed.slot.kind, "bed");
});

test("imaging blockers pull pending tests into diagnostics", () => {
  const patient = {
    id: "p-ct",
    name: "Sarah Miller",
    department: "emergency",
    status: "pending_test",
    blockers: [{ type: "imaging", title: "CT", status: "open" }],
  };
  assert.equal(zoneForPatient(patient).id, "imaging");
  const occupied = occupyFloor([patient]);
  assert.equal(occupied.placements[0].slot.kind, "treatment");
});

test("two in-progress ED patients can share a room", () => {
  const occupied = occupyFloor([
    { id: "a", name: "James Carter", department: "emergency", status: "in_progress", blockers: [] },
    { id: "b", name: "Hannah Brooks", department: "emergency", status: "in_progress", blockers: [] },
  ]);
  const beds = occupied.placements.filter((pl) => !pl.companion && !pl.staff);
  assert.equal(beds.every((pl) => pl.slot.kind === "bed"), true);
  const rooms = new Set(beds.map((pl) => pl.room?.id).filter(Boolean));
  assert.equal(rooms.size, 1);
  assert.ok(occupied.placements.some((pl) => pl.companion));
});

test("Fitkin observation rooms take two patients plus visitors", () => {
  const f2 = layoutFor(2);
  const occupied = occupyFloor([
    { id: "o1", name: "Omar Haddad", department: "fitkin", floor: "2", status: "in_progress", reason: "Asthma observation", blockers: [] },
    { id: "o2", name: "Ruth Klein", department: "fitkin", floor: "2", status: "in_progress", reason: "Syncope observation", blockers: [] },
  ], {}, f2);
  const patients = occupied.placements.filter((pl) => !pl.companion && !pl.staff);
  assert.equal(patients.length, 2);
  assert.equal(patients[0].room.id, patients[1].room.id);
  assert.ok(occupied.placements.filter((pl) => pl.companion).length >= 2);
  assert.ok(occupied.placements.some((pl) => pl.staff));
});

test("pharmacy patients sit at the Fitkin window", () => {
  const f2 = layoutFor(2);
  const occupied = occupyFloor([{
    id: "rx",
    name: "Jamal Wright",
    department: "fitkin",
    floor: "2",
    status: "waiting",
    reason: "Discharge medications",
    blockers: [{ type: "pharmacy", title: "To-go medications", status: "open" }],
  }], {}, f2);
  const pl = occupied.placements.find((p) => p.patient.id === "rx");
  assert.equal(pl.zone.id, "pharmacy");
});

test("in-progress PFT stays in pulmonary instead of taking an observation bed", () => {
  const f2 = layoutFor(2);
  const occupied = occupyFloor([{
    id: "pft-1",
    name: "Peter Novak",
    department: "fitkin",
    floor: "2",
    status: "in_progress",
    reason: "Scheduled pulmonary function test",
    blockers: [],
  }], {}, f2);
  const pl = occupied.placements.find((p) => p.patient.id === "pft-1");
  assert.equal(pl.zone.id, "pft");
  assert.equal(pl.slot.kind, "treatment");
});

test("watched beds surface vitals on the overlay without being selected", () => {
  const occupied = occupyFloor(
    [{ id: "p-bed", name: "James Carter", department: "emergency", status: "in_progress", blockers: [] }],
    {
      agent: {
        beds: [{
          patientId: "p-bed",
          watching: true,
          exception: true,
          vitals: [
            { measure: "pulse", display: "92 bpm" },
            { measure: "spo2", display: "89%", consequential: true },
            { measure: "bp", display: "118/76 mmHg" },
          ],
        }],
      },
    },
  );
  const pl = occupied.placements.find((p) => p.patient.id === "p-bed");
  assert.equal(pl.vitals.watching, true);
  const overlay = overlayFor(pl, { zoom: "far" });
  assert.equal(overlay.mode, "compact");
  assert.match(overlay.vitals.text, /HR 92/);
  assert.match(overlay.vitals.text, /SpO/);
  assert.equal(overlay.vitals.exception, true);
});

test("overlay copy stays compact for blocked and vitals states", () => {
  const blocked = occupyFloor([{
    id: "p-int",
    name: "Daniel Kim",
    department: "emergency",
    status: "waiting",
    wait_minutes: 23,
    language: "Spanish",
    is_stuck: true,
    blockers: [{ type: "interpreter", title: "Spanish interpreter", status: "open" }],
  }]).placements[0];
  const lines = overlayLines(blocked);
  assert.ok(lines.some((l) => /23/.test(l)));
  assert.ok(lines.some((l) => /interpreter/i.test(l)));

  const watched = {
    ...blocked,
    vitals: {
      watching: true,
      vitals: [
        { measure: "pulse", display: "74 bpm" },
        { measure: "spo2", display: "98%" },
        { measure: "bp", display: "121/78 mmHg" },
      ],
    },
    flags: { ...blocked.flags, exception: false },
  };
  const vitalLines = overlayLines(watched, { selected: true });
  assert.ok(vitalLines.some((l) => /23/.test(l)));
  const quietWatch = overlayFor(watched, { zoom: "mid" });
  assert.equal(quietWatch.mode, "compact");
  assert.match(quietWatch.vitals.text, /HR 74/);
  assert.match(quietWatch.vitals.text, /SpO/);
  assert.equal(quietWatch.vitals.exception, false);
  const flagged = overlayFor({
    ...watched,
    flags: { ...watched.flags, exception: true },
  }, { selected: true });
  assert.match(flagged.vitals.text, /BP 121\/78/);
  const overlay = overlayFor(blocked, { zoom: "far" });
  assert.ok(["compact", "dot", "full"].includes(overlay.mode));
  assert.equal(overlay.vitals, null);
});

test("a census room label lands on that cubicle", () => {
  const occupied = occupyFloor([
    { id: "p-208", name: "Hannah Brooks", department: "emergency", status: "in_progress", room: "208", blockers: [] },
    { id: "p-us1", name: "Thomas Greene", department: "emergency", status: "pending_test", room: "US-1", blockers: [{ type: "imaging", title: "Wrist X-ray", status: "open" }] },
  ]);
  const bay = occupied.placements.find((pl) => pl.patient.id === "p-208");
  const scan = occupied.placements.find((pl) => pl.patient.id === "p-us1");
  assert.equal(bay.room.label, "208");
  assert.equal(scan.room.label, "US-1");
  const f2 = occupyFloor(
    [{ id: "p-501", name: "Omar Haddad", department: "fitkin", floor: "2", status: "in_progress", room: "501", blockers: [] }],
    {},
    layoutFor(2),
  );
  assert.equal(f2.placements[0].room.label, "501");
});
