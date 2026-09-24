/**
 * The consent gate for texts and emails, and what an inbound reply means.
 *
 * PURE: no database, no clock, no Clerk. Every rule here is pinned by
 * lib/comms/consent.regress.ts.
 *
 * WHERE THE GATE IS ENFORCED. CLAUDE.md: "Any automated SMS send must verify
 * consent at the current version before sending, enforced in the executor
 * rather than in configuration so it cannot be switched off." So `canText` is
 * called by lib/comms/outbox.server.ts on EVERY send and EVERY retry, against a
 * contact re-read from the database a moment earlier. The record card calls it
 * too, but only to grey out the button and explain why — the screen is a
 * courtesy, not the control. guards.regress.ts §11 fails the build if the
 * executor stops calling it before the provider client.
 *
 * THE PERMIT. `canText` returns a `TextPermit` when it says yes, and the only
 * function that talks to Quo takes one as an argument. A code path that skips
 * the gate therefore does not typecheck, short of someone writing a cast —
 * which the guard suite would still catch, because it also reads the source.
 *
 * CONSENT FLOWS INBOUND ONLY. Nothing in this file grants anything. An opt-out
 * beats a consent record; an older wording is not the current wording; a START
 * reply is recorded but NOT applied (see `inboundKeyword`).
 */

/* ------------------------------------------------------------------ texts */

/** What the gate needs to know about a person. Exactly the columns on `contacts`. */
export type SmsGateContact = {
  phone: string | null;
  smsOptedOut: boolean | null;
  smsConsentAt: Date | string | null;
  smsConsentVersion: string | null;
  leadSource?: string | null;
};

export type GateCode =
  | "no_contact"
  | "no_phone"
  | "opted_out"
  | "no_consent"
  | "version_unknown"
  | "version_old"
  | "misconfigured";

declare const PERMIT: unique symbol;

/**
 * Proof that the gate said yes, for this person, at this version.
 *
 * Carries the consent the send relies on so the outbox row can record it —
 * "which wording had they agreed to when we texted them?" is the question an
 * auditor asks, and it must be answerable from the row alone.
 */
export type TextPermit = {
  readonly ok: true;
  readonly phone: string;
  readonly consentVersion: string;
  readonly consentAt: string;
  readonly [PERMIT]: true;
};

export type TextRefusal = { readonly ok: false; readonly code: GateCode; readonly reason: string };

/** E.164, as stored on `contacts.phone`. Anything else is not dialable. */
export const E164 = /^\+[1-9]\d{7,14}$/;

const asIso = (v: Date | string | null): string | null => {
  if (v === null || v === undefined || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/**
 * May Funded Capital text this person right now?
 *
 * The order is deliberate: the reasons are checked from "nothing can ever fix
 * this from here" to "this needs fresh consent", so the sentence Luis reads is
 * the most useful one. An opt-out is reported even when the phone is also bad,
 * because it is the one that must never be worked around.
 *
 * `currentVersion` is required, not defaulted: the executor passes
 * CONSENT_VERSION from lib/consent.ts explicitly, and an empty value refuses
 * everyone rather than matching a contact whose version is also empty.
 */
export function canText(
  contact: SmsGateContact | null | undefined,
  opts: { currentVersion: string },
): TextPermit | TextRefusal {
  const refuse = (code: GateCode, reason: string): TextRefusal => ({ ok: false, code, reason });

  if (typeof opts?.currentVersion !== "string" || opts.currentVersion.trim() === "") {
    return refuse("misconfigured", "Texting is switched off: the current consent wording has no version number.");
  }
  if (!contact) return refuse("no_contact", "There is no contact on this deal, so there is no one to text.");

  if (contact.smsOptedOut !== false) {
    // null is treated as opted out. The column is NOT NULL today; if that ever
    // changes, "unknown" must fail closed rather than read as "not opted out".
    return refuse(
      "opted_out",
      contact.smsOptedOut === true
        ? "They opted out of texts (they replied STOP). Nobody at Funded Capital can undo that — only they can opt back in."
        : "Their text opt-out status is unknown, so texting is blocked until it is confirmed.",
    );
  }

  const phone = typeof contact.phone === "string" ? contact.phone.trim() : "";
  if (!E164.test(phone)) {
    return refuse(
      "no_phone",
      phone
        ? `The phone number on file (${phone}) is not a complete number, so it cannot be texted.`
        : "There is no phone number on file to text.",
    );
  }

  const consentAt = asIso(contact.smsConsentAt);
  if (!consentAt) {
    if (contact.leadSource === "biggerpockets") {
      return refuse(
        "no_consent",
        "BiggerPockets leads have no text consent on file, and texting them is on hold until counsel signs off. Call or email instead.",
      );
    }
    return refuse(
      "no_consent",
      "There is no text consent on file. They need to agree to texts themselves, on our website form, before we can text them. Call or email instead.",
    );
  }

  const version = typeof contact.smsConsentVersion === "string" ? contact.smsConsentVersion.trim() : "";
  if (!version) {
    return refuse(
      "version_unknown",
      "They consented, but we did not record which wording they agreed to, so it cannot be relied on for texting.",
    );
  }
  if (version !== opts.currentVersion) {
    return refuse(
      "version_old",
      `They consented under older wording (version ${version}). Texting needs consent to the current wording (version ${opts.currentVersion}).`,
    );
  }

  return { ok: true, phone, consentVersion: version, consentAt } as TextPermit;
}

/* ----------------------------------------------------------------- emails */

export type EmailGateContact = { email: string | null; emailSubscribed: boolean | null };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * May Funded Capital email this person? Not used to send anything yet.
 *
 * Unknown (`null`) is allowed: a borrower who wrote to us about their loan can
 * be written back to, and Klaviyo is the system that decides marketing
 * eligibility. An explicit unsubscribe (`false`, mirrored IN from Klaviyo) is
 * authoritative and refuses.
 */
export function canEmail(
  contact: EmailGateContact | null | undefined,
): { ok: true; email: string } | { ok: false; reason: string } {
  if (!contact) return { ok: false, reason: "There is no contact on this deal, so there is no one to email." };
  if (contact.emailSubscribed === false) {
    return { ok: false, reason: "They unsubscribed from email. Only they can re-subscribe." };
  }
  const email = typeof contact.email === "string" ? contact.email.trim() : "";
  if (!EMAIL.test(email)) {
    return { ok: false, reason: email ? `The email on file (${email}) is not a valid address.` : "There is no email address on file." };
  }
  return { ok: true, email };
}

/* -------------------------------------------------------- inbound replies */

/**
 * Opt-out words. A whole-message reply of any of these revokes consent.
 *
 * The six industry-standard keywords (CTIA) plus REVOKE and OPT OUT, which the
 * FCC's 2024 revocation order names as words a consumer may use. Adding words
 * here can only ever stop texts; it cannot start them, so erring wide is the
 * safe direction.
 */
export const STOP_KEYWORDS = [
  "STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "REVOKE", "OPTOUT", "OPT OUT", "OPT-OUT",
] as const;

/** Opt-back-in words. Recorded, never applied — see `inboundKeyword`. */
export const START_KEYWORDS = ["START", "UNSTOP"] as const;

export const HELP_KEYWORDS = ["HELP", "INFO"] as const;

/**
 * A reply reduced to the form keywords are compared in: upper case, single
 * spaces, and no surrounding punctuation or quotes — "Stop." and " stop!! "
 * are STOP. Inner punctuation is kept, so "OPT-OUT" still reads as itself.
 */
export function normaliseReply(text: unknown): string {
  if (typeof text !== "string") return "";
  return text
    .normalize("NFKC")
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[\s"'“”‘’.,!?;:()\[\]-]+|[\s"'“”‘’.,!?;:()\[\]-]+$/g, "")
    .toUpperCase();
}

export type InboundKeyword = "stop" | "start" | "help" | "possible_stop" | null;

/** Opt-out phrasing inside a longer reply. Flagged for a person, never auto-applied. */
const POSSIBLE_STOP = [
  /^STOP\b/,
  /\bSTOP\s+(TEXTING|MESSAGING|CONTACTING|CALLING|SENDING)\b/,
  /\bUNSUBSCRIBE\b/,
  /\bOPT[ -]?OUT\b/,
  /\bREVOKE\b/,
  /\bREMOVE ME\b/,
  /\b(DON'?T|DO NOT|NO MORE)\s+(TEXT|MESSAGE|CONTACT|CALL)/,
];

/**
 * What an inbound text means for consent.
 *
 *  stop          — the whole message is an opt-out keyword. The webhook sets
 *                  `smsOptedOut = true` for every contact holding that number.
 *  start         — an opt-back-in keyword. RECORDED ON THE TIMELINE ONLY; the
 *                  opt-out is NOT cleared. Reasons: CLAUDE.md makes consent
 *                  inbound-only and treats CRM code that re-subscribes a
 *                  suppressed person as a compliance incident; a START restores
 *                  the carrier-level block but says nothing about which consent
 *                  WORDING they agreed to, which is what the gate needs; and
 *                  "YES" is deliberately not a keyword at all — it is far too
 *                  common in normal replies. Re-consent comes through the website
 *                  form, which stamps the current version.
 *  help          — HELP/INFO. Quo and the carrier answer it; we record it.
 *  possible_stop — a longer message containing opt-out language ("please stop
 *                  texting me"). Not applied automatically, because "I can't
 *                  stop thinking about this deal" exists; flagged loudly on the
 *                  timeline for a person to act on.
 */
export function inboundKeyword(text: unknown): InboundKeyword {
  const n = normaliseReply(text);
  if (!n) return null;
  if ((STOP_KEYWORDS as readonly string[]).includes(n)) return "stop";
  if ((START_KEYWORDS as readonly string[]).includes(n)) return "start";
  if ((HELP_KEYWORDS as readonly string[]).includes(n)) return "help";
  if (POSSIBLE_STOP.some((re) => re.test(n))) return "possible_stop";
  return null;
}

export function isStopMessage(text: unknown): boolean {
  return inboundKeyword(text) === "stop";
}
