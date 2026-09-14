/**
 * Phone normalisation to E.164.
 *
 * WHY THIS IS ITS OWN MODULE WITH ITS OWN TEST SUITE:
 * Klaviyo resolves profile identity on phone number. A number stored as
 * "305-555-0101" and the same number stored as "+13055550101" are two different
 * people to it, and the result is duplicate profiles that then receive duplicate
 * sends. Every one of the 500 phone numbers in the legacy CRM was in the
 * unnormalised shape, so this runs over the whole book at migration.
 *
 * The rule inherited from the spam-filter work applies here too: NEVER silently
 * discard data. A number that cannot be normalised returns ok:false and the
 * caller stores the original in `phone_raw` — so a borrower with an odd number is
 * recoverable by hand rather than lost.
 */

export type PhoneResult =
  | { ok: true; e164: string; raw: string }
  | { ok: false; e164: null; raw: string; reason: string };

/** Placeholder sequences that are technically 10 digits but are not phone numbers. */
const OBVIOUS_JUNK = new Set([
  "0000000000", "1111111111", "1234567890", "9999999999", "5555555555",
]);

export function normalisePhone(input: string | null | undefined): PhoneResult {
  const raw = (input ?? "").toString().trim();

  if (!raw || raw.toUpperCase() === "N/A") {
    return { ok: false, e164: null, raw, reason: "empty" };
  }

  // Strip an extension before counting digits — "555-0101 x12" must not become
  // an 12-digit number.
  const withoutExt = raw.replace(/\s*(?:x|ext\.?|extension)\s*\d+\s*$/i, "");

  const hadPlus = withoutExt.trimStart().startsWith("+");
  const digits = withoutExt.replace(/\D/g, "");

  if (digits.length === 0) {
    return { ok: false, e164: null, raw, reason: "no digits" };
  }

  // A leading + means the caller gave us a country code. Anything that is not
  // NANP we keep verbatim rather than guess at.
  if (hadPlus && !(digits.length === 11 && digits.startsWith("1"))) {
    if (digits.length >= 8 && digits.length <= 15) {
      return { ok: true, e164: `+${digits}`, raw };
    }
    return { ok: false, e164: null, raw, reason: `international, ${digits.length} digits` };
  }

  let national: string;
  if (digits.length === 10) {
    national = digits;
  } else if (digits.length === 11 && digits.startsWith("1")) {
    national = digits.slice(1);
  } else {
    return { ok: false, e164: null, raw, reason: `${digits.length} digits, expected 10` };
  }

  if (OBVIOUS_JUNK.has(national)) {
    return { ok: false, e164: null, raw, reason: "placeholder number" };
  }

  // NANP: area code and exchange both start 2-9. This catches transposed or
  // truncated numbers that are the right length but cannot be dialled.
  const areaCode = national[0];
  const exchange = national[3];
  if (areaCode === "0" || areaCode === "1") {
    return { ok: false, e164: null, raw, reason: `invalid area code ${national.slice(0, 3)}` };
  }
  if (exchange === "0" || exchange === "1") {
    return { ok: false, e164: null, raw, reason: `invalid exchange ${national.slice(3, 6)}` };
  }

  return { ok: true, e164: `+1${national}`, raw };
}

/** Display form for UI. Falls back to the raw string when not normalisable. */
export function formatPhone(e164: string | null | undefined, fallback = ""): string {
  if (!e164) return fallback;
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}
