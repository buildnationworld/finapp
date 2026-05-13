/**
 * Parse a money amount written as `Ksh 1,500.00`, `KES1500`, `Ksh.500`,
 * `1,500/=`, etc. Returns the numeric value or `null` on failure.
 */
export function parseAmount(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse the local-time datestrings that mobile-money SMS use. Examples:
 *   15/2/24 at 3:45 PM
 *   15/02/2024 at 15:45
 *   20/02/2024 14:32
 *   on 19/2/24 at 5:00 PM
 *   26-02-2024 13:45
 *
 * Timezone is assumed to be Africa/Nairobi (EAT, UTC+3). The Date returned
 * is the UTC instant equivalent — callers should not re-localize.
 */
const EAT_OFFSET_MIN = 180; // Africa/Nairobi is UTC+3, no DST

export function parseSmsDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const text = raw.trim();

  const re =
    /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})(?:[,\s]+(?:at\s+)?(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?)?/;
  const m = re.exec(text);
  if (!m) return null;

  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  let hour = m[4] ? Number(m[4]) : 0;
  const minute = m[5] ? Number(m[5]) : 0;
  const second = m[6] ? Number(m[6]) : 0;
  const ap = m[7]?.toUpperCase();
  if (ap === "PM" && hour < 12) hour += 12;
  if (ap === "AM" && hour === 12) hour = 0;

  if (
    !Number.isFinite(day) ||
    !Number.isFinite(month) ||
    !Number.isFinite(year) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  // Build the UTC instant that represents this local Africa/Nairobi time.
  const utcMs = Date.UTC(year, month - 1, day, hour, minute, second) - EAT_OFFSET_MIN * 60_000;
  const d = new Date(utcMs);
  return Number.isFinite(d.getTime()) ? d : null;
}

/** Best-effort normalization of Kenyan phone numbers to +2547xxxxxxxx. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return null;
  if (digits.startsWith("+254") && digits.length === 13) return digits;
  if (digits.startsWith("254") && digits.length === 12) return `+${digits}`;
  if (digits.startsWith("07") && digits.length === 10) return `+254${digits.slice(1)}`;
  if (digits.startsWith("01") && digits.length === 10) return `+254${digits.slice(1)}`;
  if (digits.startsWith("7") && digits.length === 9) return `+254${digits}`;
  return null;
}

/** Strip trailing punctuation and collapse whitespace in a counterparty name. */
export function cleanName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/\s+/g, " ")
    .replace(/[.,;:]+$/g, "")
    .trim();
  return cleaned ? cleaned : null;
}
