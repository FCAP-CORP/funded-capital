/**
 * Public-form spam defense.
 *
 * ---------------------------------------------------------------------------
 * THIRD VERSION, 2026-09-03. The design principle changed; read this first.
 * ---------------------------------------------------------------------------
 *
 * A bot flooded /contact and /apply on 2026-09-02 (~82 submissions from Tor
 * exit nodes) and burned the entire Formspree monthly quota, after which real
 * leads were rejected. The first two versions of this file answered that with
 * content heuristics: does the name look generated, is the email dot-padded,
 * was the form filled suspiciously fast.
 *
 * Those heuristics were measured, and they failed in both directions.
 * Against 65 real-world surnames and the 18 the attacker actually used:
 *
 *     REAL NAMES  — false positives: Schmidt, Schwartz, McKnight, Brnjac
 *     BOT NAMES   — caught 13/18 (72%); missed Uycdmd, Sxivskun, Ybqneie,
 *                   Rmuubtts, Fuciaqig
 *
 * A rule that flags Schmidt while missing a quarter of the real bots has no
 * business deciding whether a lead reaches a human. And structurally, any bot
 * that skipped hidden fields and waited five seconds scored ZERO — the whole
 * approach only ever stopped unsophisticated attackers.
 *
 * So the guessing was demoted. Vercel BotID (see instrumentation-client.ts)
 * now proves the submission came from a real browser via a cryptographic
 * challenge, and this file does two much smaller jobs:
 *
 *   1. hardBlockReason() — ONE unambiguous trap: a hidden checkbox that only a
 *      script blindly filling every input would tick. Autofill fills text
 *      fields; it does not tick boxes. Zero plausible human cause.
 *   2. advisoryFlags()   — everything else. These annotate the record for a
 *      human to eyeball. They route NOTHING. A flag has never cost anyone a
 *      lead and never will.
 *
 * The rule to preserve: a signal that cannot be proven safe does not get to
 * make a decision. If you find yourself wanting to promote an advisory flag
 * into a routing rule, measure it against real data first — that measurement
 * is what demoted the last set.
 */

/* Trap field names. Deliberately opaque: a name like "website", "url",
 * "company" or "address" is exactly what a password manager looks for, and an
 * earlier version named the text honeypot "website" and blocked a real
 * submission because autofill filled it. If you rename these, keep them
 * meaningless — that is the whole point. */
export const HONEYPOT_TEXT_FIELD = "fc_x1";
export const HONEYPOT_CHECK_FIELD = "fc_x2";
/** Milliseconds the visitor spent on the form, measured in the browser. */
export const FORM_ELAPSED_FIELD = "fc_x3";

/** Below this, a fill time is worth noting on the record. Advisory only. */
const FAST_FILL_MS = 3_500;

/** Per-IP ceiling per hour. Volumetric, content-blind, so it is safe to act on. */
const RATE_LIMIT_MAX = 8;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

/* ------------------------------------------------------------------ */
/* Rate limiting                                                       */
/* ------------------------------------------------------------------ */

/**
 * In-memory sliding window. Serverless instances are ephemeral, so this is a
 * speed bump rather than a wall — it blunts a burst from one IP without adding
 * a database. Unlike the content rules this one is safe to act on, because it
 * measures behaviour rather than guessing at identity: no real applicant
 * submits the same form nine times in an hour.
 */
const hits = new Map<string, number[]>();

export function isRateLimited(ip: string): boolean {
  if (!ip || ip === "unknown") return false;
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);

  // Opportunistic cleanup so the map cannot grow without bound.
  if (hits.size > 5_000) {
    for (const [key, times] of hits) {
      if (times.every((t) => now - t >= RATE_LIMIT_WINDOW_MS)) hits.delete(key);
    }
  }
  return recent.length > RATE_LIMIT_MAX;
}

/* ------------------------------------------------------------------ */
/* The one hard block                                                  */
/* ------------------------------------------------------------------ */

/**
 * The only condition that discards a submission outright.
 *
 * A hidden checkbox has no reason to be ticked. Password managers and browser
 * autofill populate text inputs; none of them tick boxes. Only a script that
 * sets every field it finds does that — and the 2026-09-02 attacker ticked the
 * real SMS consent box on 100% of its submissions, which is exactly this
 * behaviour.
 *
 * Returns a reason string, or null when the submission is fine.
 */
export function hardBlockReason(honeypotCheck: string): string | null {
  return honeypotCheck.trim() !== "" ? "honeypot_checkbox_ticked" : null;
}

/* ------------------------------------------------------------------ */
/* Advisory flags — these annotate, they never decide                  */
/* ------------------------------------------------------------------ */

const VOWELS = /[aeiouy]/i;

/**
 * Rough "looks machine-generated" test. Kept ONLY as an advisory note, because
 * it is measurably unreliable: it flags Schmidt, Schwartz, McKnight and Brnjac
 * as generated. Useful as a hint on a row a human is reading; useless as a
 * gate. Do not promote this to a routing rule.
 */
function looksGenerated(name: string): boolean {
  const word = name.trim();
  if (word.length < 5) return false;
  if (!/^[A-Za-z]+$/.test(word)) return false;
  if (!VOWELS.test(word)) return true;
  if (/[^aeiouy\s]{5,}/i.test(word)) return true;
  const vowelCount = (word.match(/[aeiouy]/gi) ?? []).length;
  return vowelCount / word.length < 0.2;
}

/** Gmail dot-alias padding, used to mail-bomb one real inbox from many "addresses". */
function hasDotPadding(email: string): boolean {
  const local = email.split("@")[0] ?? "";
  return (local.match(/\./g) ?? []).length >= 3;
}

function isJustDigits(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && /^[\d\s()+-]+$/.test(trimmed);
}

const LINK_SPAM = /(https?:\/\/|\[url=|\bviagra\b|\bcasino\b|\bcrypto airdrop\b|\bseo services\b)/i;

/**
 * Human-readable notes about a submission, written onto the record so whoever
 * works the lead can see what looked odd. Never used to block, quarantine, or
 * suppress anything.
 */
export function advisoryFlags(opts: {
  fields: Record<string, string>;
  honeypotText: string;
  elapsedMs: string;
  userAgent: string;
}): string[] {
  const { fields, honeypotText, elapsedMs, userAgent } = opts;
  const flags: string[] = [];

  // Autofill can fill this, so it is a note and nothing more.
  if (honeypotText.trim() !== "") flags.push("hidden text field was filled");

  const elapsed = Number(elapsedMs);
  if (!elapsedMs || Number.isNaN(elapsed)) {
    flags.push("no timing signal");
  } else if (elapsed < FAST_FILL_MS) {
    flags.push(`form filled in ${elapsed}ms`);
  }

  const message = fields.message ?? fields.additionalInfo ?? "";
  if (looksGenerated(fields.firstName ?? "")) flags.push("first name looks generated");
  if (looksGenerated(fields.lastName ?? "")) flags.push("last name looks generated");
  if (hasDotPadding(fields.email ?? "")) flags.push("email has dot-alias padding");
  if (message && isJustDigits(message)) flags.push("message is only digits");
  if (LINK_SPAM.test(message)) flags.push("message contains link spam");
  if (!userAgent || userAgent === "unknown") flags.push("no user agent");

  return flags;
}
