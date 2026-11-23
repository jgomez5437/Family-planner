export function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

// Formats a Date using its LOCAL year/month/day (never UTC-shift the calendar day)
export function toLocalISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayISO(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return toLocalISO(d);
}

// Parses a "YYYY-MM-DD" string as a LOCAL midnight Date
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function fmtTime(t?: string | null): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

export function relativeDay(dateStr: string): string {
  const d0 = parseLocalDate(todayISO(0));
  const d1 = parseLocalDate(dateStr);
  const diff = Math.round((d1.getTime() - d0.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff < 7) return d1.toLocaleDateString(undefined, { weekday: "long" });
  return d1.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function countdownLabel(dateStr: string): string {
  const d0 = parseLocalDate(todayISO(0));
  const d1 = parseLocalDate(dateStr);
  const diff = Math.round((d1.getTime() - d0.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff > 1) return `In ${diff} days`;
  return "";
}

export function fmtShortDate(dateStr: string): string {
  return parseLocalDate(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function fmtDayLong(dateStr: string): string {
  return parseLocalDate(dateStr).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function nowClock(): string {
  const d = new Date();
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const period = h >= 12 ? "PM" : "AM";
  h = h % 12 === 0 ? 12 : h % 12;
  return `${h}:${m} ${period}`;
}

/**
 * Formats an ISO timestamp (or Date/epoch ms) into a live relative label:
 *  - < 60s        -> "Just Now"
 *  - 1m .. 59m    -> "1m" .. "59m"
 *  - 1hr .. 23hr  -> "1hr" .. "23hr"
 *  - >= 24hr      -> "1d", "2d", ...
 *
 * Legacy strings such as "just now" normalize to "Just Now"; unparseable
 * non-ISO labels (e.g. legacy "4:30 PM") are returned as-is.
 */
export function formatRelativeTime(
  input?: string | number | Date | null,
  nowMs: number = Date.now()
): string {
  if (input === null || input === undefined) return "";

  let timestamp: number;
  if (input instanceof Date) {
    timestamp = input.getTime();
  } else if (typeof input === "number") {
    timestamp = input;
  } else {
    const trimmed = input.trim();
    if (!trimmed) return "";
    if (/^just\s*now$/i.test(trimmed)) return "Just Now";
    timestamp = Date.parse(trimmed);
    if (Number.isNaN(timestamp)) return trimmed;
  }

  if (Number.isNaN(timestamp)) return "Just Now";

  const diffSec = Math.max(0, Math.floor((nowMs - timestamp) / 1000));
  if (diffSec < 60) return "Just Now";

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}hr`;

  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d`;
}

