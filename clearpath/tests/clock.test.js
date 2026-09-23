import test from "node:test";
import assert from "node:assert/strict";
import { agoSql, freezeAt, isFrozen, loadFrozenClock, now, thaw, toSqlTime } from "../src/lib/clock.js";
import { waitMinutes } from "../src/lib/journey.js";

test.afterEach(() => thaw());

test("a frozen clock keeps wait minutes still", () => {
  const origin = Date.parse("2026-09-22T22:00:00Z");
  freezeAt(origin);
  assert.equal(isFrozen(), true);
  assert.equal(now(), origin);
  assert.equal(waitMinutes("2026-09-22 21:29:00"), 31);
  assert.equal(waitMinutes("2026-09-22 16:48:00"), 312);
  assert.equal(waitMinutes(agoSql(8, origin)), 8);
});

test("thaw returns wait clocks to wall time", () => {
  freezeAt(Date.parse("2026-09-22T22:00:00Z"));
  thaw();
  assert.equal(isFrozen(), false);
  const drift = Math.abs(now() - Date.now());
  assert.ok(drift < 50);
});

test("loadFrozenClock accepts an ISO stamp", () => {
  const ms = loadFrozenClock("2026-09-22T18:15:00.000Z");
  assert.equal(ms, Date.parse("2026-09-22T18:15:00.000Z"));
  assert.equal(toSqlTime(ms), "2026-09-22 18:15:00");
});
