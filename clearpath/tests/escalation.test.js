import assert from "node:assert/strict";
import test from "node:test";
import {
  ESCALATION_LADDER,
  dueEscalationLevel,
  escalationRung,
  typicalMinutesFor,
} from "../src/lib/journey.js";

const transport = { type: "transport", status: "pending", created_at: null };
const imaging = { type: "imaging", status: "pending", created_at: null };

test("a dependency inside its typical window escalates to nobody", () => {
  assert.equal(dueEscalationLevel(transport, 10), 0, "transport typical is 15 min");
  assert.equal(dueEscalationLevel(imaging, 40), 0, "imaging typical is 50 min");
});

test("lateness is relative to the dependency, not a fixed number of minutes", () => {
  // 20 minutes is late for transport and early for imaging.
  assert.equal(dueEscalationLevel(transport, 20), 1);
  assert.equal(dueEscalationLevel(imaging, 20), 0);
});

test("each rung widens the circle rather than re-paging the same team", () => {
  const typical = typicalMinutesFor(transport);
  assert.equal(dueEscalationLevel(transport, typical * 1), 1);
  assert.equal(dueEscalationLevel(transport, typical * 2), 2);
  assert.equal(dueEscalationLevel(transport, typical * 3), 3);

  const audiences = ESCALATION_LADDER.map((r) => r.audience({ owner_role: "Patient transport" }));
  assert.deepEqual(audiences, ["Patient transport", "Charge nurse", "Patient flow lead"]);
});

test("level never exceeds the top of the ladder", () => {
  const typical = typicalMinutesFor(transport);
  assert.equal(dueEscalationLevel(transport, typical * 50), ESCALATION_LADDER.length);
});

test("urgency changes the pace, so a high-urgency patient is chased sooner", () => {
  const high = { ...imaging, urgency: "high" };
  const low = { ...imaging, urgency: "low" };
  const typical = typicalMinutesFor(imaging);

  // High urgency runs at 0.6x the window, so it is late before the typical time.
  assert.equal(dueEscalationLevel(high, typical * 0.7), 1);
  assert.equal(dueEscalationLevel(imaging, typical * 0.7), 0, "medium is still inside its window");
  assert.equal(dueEscalationLevel(low, typical * 1.1), 0, "low urgency gets more room");
});

test("an explicit eta overrides the type default", () => {
  const withEta = { type: "imaging", status: "pending", eta_minutes: 5 };
  assert.equal(typicalMinutesFor(withEta), 5);
  assert.equal(dueEscalationLevel(withEta, 6), 1, "late against its own eta, not imaging's 50 min");
});

test("resolved dependencies stop escalating", () => {
  assert.equal(dueEscalationLevel({ ...transport, status: "resolved" }, 999), 0);
});

test("rung lookup is total", () => {
  assert.equal(escalationRung(1).label, "Owner notified");
  assert.equal(escalationRung(99).level, 1, "unknown levels fall back rather than throwing");
});
