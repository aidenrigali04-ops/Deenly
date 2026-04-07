/**
 * Convert a value from `<input type="datetime-local">` (local wall time, no timezone)
 * to an ISO string in UTC. Avoids `Date.parse` inconsistencies across browsers.
 */
export function datetimeLocalToIso(local: string): string {
  const trimmed = local.trim();
  if (!trimmed) {
    throw new Error("Start and end times are required where marked.");
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed);
  if (!m) {
    throw new Error("Invalid date/time. Use the date and time pickers.");
  }
  const d = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    m[6] != null ? Number(m[6]) : 0,
    0
  );
  if (Number.isNaN(d.getTime())) {
    throw new Error("Invalid date/time.");
  }
  return d.toISOString();
}
