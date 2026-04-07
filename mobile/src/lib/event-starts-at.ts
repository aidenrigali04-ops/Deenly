/**
 * Parse free-form "Starts at" input for event create. Supports:
 * - Empty → default +1 hour from now
 * - `YYYY-MM-DDTHH:mm` or `YYYY-MM-DD HH:mm` (local wall time)
 * - Time only `HH:mm` or `H:mm` (24h), optional `am`/`pm`
 * - Otherwise falls back to `Date.parse` when unambiguous
 */
export function parseEventStartsAtInput(input: string): Date {
  const trimmed = input.trim();
  if (!trimmed) {
    return new Date(Date.now() + 60 * 60 * 1000);
  }

  const localFull = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed);
  if (localFull) {
    const d = new Date(
      Number(localFull[1]),
      Number(localFull[2]) - 1,
      Number(localFull[3]),
      Number(localFull[4]),
      Number(localFull[5]),
      localFull[6] != null ? Number(localFull[6]) : 0,
      0
    );
    if (!Number.isNaN(d.getTime())) {
      return d;
    }
  }

  const timeOnly = /^\s*(\d{1,2}):(\d{2})(?:\s*(a\.?m\.?|p\.?m\.?))?$/i.exec(trimmed);
  if (timeOnly) {
    let hour = Number(timeOnly[1]);
    const minute = Number(timeOnly[2]);
    const apRaw = timeOnly[3]?.toLowerCase().replace(/\./g, "") ?? "";
    const ap = apRaw.startsWith("p") ? "pm" : apRaw.startsWith("a") ? "am" : "";

    if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute < 0 || minute > 59) {
      throw new Error("Use a valid start time (e.g. 14:30 or 2:30 pm).");
    }

    if (ap === "pm") {
      if (hour < 1 || hour > 12) {
        throw new Error("Use a valid start time (e.g. 14:30 or 2:30 pm).");
      }
      if (hour !== 12) {
        hour += 12;
      }
    } else if (ap === "am") {
      if (hour < 1 || hour > 12) {
        throw new Error("Use a valid start time (e.g. 14:30 or 2:30 pm).");
      }
      if (hour === 12) {
        hour = 0;
      }
    } else {
      if (hour < 0 || hour > 23) {
        throw new Error("Use a valid start time (e.g. 14:30 or 2:30 pm).");
      }
    }

    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
    if (Number.isNaN(d.getTime())) {
      throw new Error("Use a valid start date/time.");
    }
    if (d.getTime() <= Date.now()) {
      d.setDate(d.getDate() + 1);
    }
    return d;
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  throw new Error(
    "Use a full date and time (e.g. 2026-04-18 18:30) or a time today (e.g. 12:30)."
  );
}
