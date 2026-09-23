/**
 * Hospital time for wait clocks.
 *
 * `waitMinutes` is "how long has this visit been sitting," not wall-clock age.
 * The seed freezes now so a 31-minute bay stays 31 minutes overnight instead
 * of drifting toward 500. Live check-ins still use real time until a freeze
 * is loaded from the census.
 */
let frozenAt = null;

export function now() {
  return frozenAt ?? Date.now();
}

export function isFrozen() {
  return frozenAt != null;
}

export function freezeAt(ms) {
  const t = Number(ms);
  frozenAt = Number.isFinite(t) ? t : Date.now();
  return frozenAt;
}

export function thaw() {
  frozenAt = null;
}

/** SQLite-style UTC timestamp, matching datetime('now'). */
export function toSqlTime(ms = now()) {
  return new Date(ms).toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
}

export function agoSql(minutes, origin = now()) {
  return toSqlTime(origin - Number(minutes) * 60_000);
}

export function loadFrozenClock(value) {
  if (value == null || value === "") {
    thaw();
    return null;
  }
  const ms = typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return freezeAt(ms);
}
