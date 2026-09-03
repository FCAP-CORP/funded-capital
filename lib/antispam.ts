/**
 * Public-form spam defense.
 *
 * Added 2026-09-03 after a bot flooded /contact and /apply overnight
 * (2026-09-02, ~82 submissions from Tor exit nodes) and burned the entire
 * Formspree monthly quota, which then started rejecting REAL leads.
 *
 * The attack signature, for reference:
 *   - Tor exit IPs (185.220.101.x, 192.42.116.x, 171.25.193.x, 23.129.64.x …)
 *   - identical user agent on every hit
 *   - consonant-soup names ("Pvpplccf Uycdmd", "Sxivskun Ztvrimxn")
 *   - real, harvested third-party emails, often with dot-alias padding
 *     ("m.at.t.hewsha.f.fe.r@gmail.com") — i.e. we were being used to
 *     mail-bomb other people
 *   - message field containing nothing but a random 10-digit number
 *   - the SMS consent box ticked EVERY time (bots tick every checkbox)
 *
 * ---------------------------------------------------------------------------
 * REWRITTEN 2026-09-03, same night, after the first version blocked a REAL
 * submission. Two defects, both worth remembering:
 *
 * 1. The text honeypot was named "website". Password managers and Chrome
 *    autofill recognise that name and fill it even when the field is
 *    off-screen — so a visitor with autofill enabled tripped the trap just by
 *    letting their browser help them. Honeypot names must now be semantically
 *    meaningless, and every known autofill opt-out attribute is set on them.
 *
 * 2. The fill-timer compared a browser Date.now() against a server Date.now().
 *    Those are different clocks. A visitor whose machine clock ran a few
 *    minutes fast produced a negative elapsed time and was treated as an
 *    instant submit. The timer now measures elapsed time entirely inside the
 *    browser with performance.now(), which is monotonic and immune to clock
 *    skew and timezones.
 *
 * The deeper lesson is in the verdicts. The first version silently discarded a
 * submission on any single trap, which meant a false positive was invisible to
 * everyone — no row, no alert, no error for the visitor. A blocked bot costs
 * nothing; a discarded borrower costs a deal. So now:
 *
 *   - Only ONE condition discards outright: the checkbox honeypot. No autofill
 *     mechanism ticks a hidden checkbox — only a script that blindly fills
 *     every input does. That signal has no plausible human cause.
 *   - EVERYTHING else that looks wrong is quarantined, not dropped. A
 *     quarantined lead is written down, flagged, and kept out of the inbox —
 *     recoverable by a human who reads the flag.
 *
 * Optional extra layer: Cloudflare Turnstile. Off unless TURNSTILE_SECRET_KEY
 * and NEXT_PUBLIC_TURNSTILE_SITE_KEY are set, so it can be switched on in
 * minutes if this bot adapts, without another code change.
 */

/* Trap field names. Deliberately opaque: a name like "website", "url",
 * "company" or "address" is exactly what a password manager looks for. These
 * match nothing in any autofill heuristic. If you ever rename them, keep them
 * meaningless — that is the whole point. */
export const HONEYPOT_TEXT_FIELD = "fc_x1";
export const HONEYPOT_CHECK_FIELD = "fc_x2";
/** Milliseconds the visitor spent on the form, measured in the browser. */
export const FORM_ELAPSED_FIELD = "fc_x3";

/** A human needs at least this long to fill a lead form, in ms. */
const MIN_FILL_MS = 3_500;
/** Nothing legitimate sits on a form for 12h then submits; stale = replayed. */
const MAX_FILL_MS = 12 * 60 * 60 * 1000;

/** Per-IP ceiling. Generous — a real person retrying a failed submit is fine. */
const RATE_LIMIT_MAX = 8;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

/** Points at or above this are held back for review rather than delivered. */
const QUARANTINE_AT = 4;

export type Verdict = "allow" | "quarantine" | "block";

export interface SpamAssessment {
  verdict: Verdict;
  score: number;
  reasons: string[];
}

/* ------------------------------------------------------------------ */
/* Rate limiting                                                       */
/* ------------------------------------------------------------------ */

/**
 * In-memory sliding window. Serverless instances are ephemeral, so this is a
 * speed bump rather than a wall — it blunts bursts from a single IP without
 * adding a database. The traps below are what actually stop a bot.
 */
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
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
/* Content heuristics                                                  */
/* ------------------------------------------------------------------ */

const VOWELS = /[aeiouy]/i;

/**
 * True for machine-generated names like "Pvpplccf" or "Ztvrimxn".
 * Deliberately conservative: short names and names with normal vowel spacing
 * always pass, so real names (including non-English ones) are not caught.
 */
function looksGenerated(name: string): boolean {
  const word = name.trim();
  if (word.length < 5) return false;
  if (!/^[A-Za-z]+$/.test(word)) return false;
  if (!VOWELS.test(word)) return true;
  // Five or more consonants in a row does not occur in real given names.
  if (/[^aeiouy\s]{5,}/i.test(word)) return true;
  const vowelCount = (word.match(/[aeiouy]/gi) ?? []).length;
  return vowelCount / word.length < 0.2;
}

/** Gmail dot-alias padding, used to mail-bomb one real inbox from many "addresses". */
function hasDotPadding(email: string): boolean {
  const local = email.split("@")[0] ?? "";
  const dots = (local.match(/\./g) ?? []).length;
  return dots >= 3;
}

function isJustDigits(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && /^[\d\s()+-]+$/.test(trimmed);
}

const LINK_SPAM = /(https?:\/\/|\[url=|\bviagra\b|\bcasino\b|\bcrypto airdrop\b|\bseo services\b)/i;

/* ------------------------------------------------------------------ */
/* Assessment                                                          */
/* ------------------------------------------------------------------ */

export function assessSubmission(opts: {
  fields: Record<string, string>;
  honeypotText: string;
  honeypotCheck: string;
  elapsedMs: string;
  ip: string;
  userAgent: string;
}): SpamAssessment {
  const { fields, honeypotText, honeypotCheck, elapsedMs, ip, userAgent } = opts;

  /* --- The one hard block. --- */

  // A hidden checkbox has no reason to be ticked. Autofill fills text inputs;
  // it does not tick boxes. Only a script that sets every field does that, and
  // our attacker ticked the real consent box on 100% of its submissions.
  if (honeypotCheck.trim() !== "") {
    return { verdict: "block", score: 100, reasons: ["honeypot_checkbox_ticked"] };
  }

  /* --- Everything else is scored. Nothing here can discard a lead. --- */

  let score = 0;
  const reasons: string[] = [];
  const bump = (points: number, why: string) => {
    score += points;
    reasons.push(why);
  };

  // Still a strong signal, but autofill can trip it, so it quarantines on its
  // own rather than dropping the submission.
  if (honeypotText.trim() !== "") bump(QUARANTINE_AT, "honeypot_text_filled");

  // Elapsed time is measured in the browser with performance.now(), so it is
  // monotonic: no clock skew, no timezone, never negative.
  const elapsed = Number(elapsedMs);
  if (!elapsedMs || Number.isNaN(elapsed) || elapsed < 0) {
    // Our forms always send this. Missing usually means a POST that did not
    // come from a rendered page — but it also happens for a few minutes after
    // a deploy, while the edge still serves pre-shield HTML, so it is scored.
    bump(3, "no_timing_signal");
  } else if (elapsed < MIN_FILL_MS) {
    bump(QUARANTINE_AT, `filled_in_${elapsed}ms`);
  } else if (elapsed > MAX_FILL_MS) {
    bump(3, "stale_form");
  }

  if (rateLimited(ip)) bump(QUARANTINE_AT, "rate_limited");

  const firstName = fields.firstName ?? "";
  const lastName = fields.lastName ?? "";
  const email = fields.email ?? "";
  const message = fields.message ?? fields.additionalInfo ?? "";

  if (looksGenerated(firstName)) bump(2, "generated_first_name");
  if (looksGenerated(lastName)) bump(2, "generated_last_name");
  if (hasDotPadding(email)) bump(2, "email_dot_padding");
  // A real inquiry never consists solely of a phone-number-shaped string.
  if (message && isJustDigits(message)) bump(3, "numeric_only_message");
  if (LINK_SPAM.test(message)) bump(3, "link_spam_in_message");
  if (!userAgent || userAgent === "unknown") bump(1, "no_user_agent");

  if (score >= QUARANTINE_AT) return { verdict: "quarantine", score, reasons };
  return { verdict: "allow", score, reasons };
}

/* ------------------------------------------------------------------ */
/* Optional: Cloudflare Turnstile                                      */
/* ------------------------------------------------------------------ */

/**
 * Verifies a Turnstile token when the feature is configured. Returns true when
 * Turnstile is not configured, so the site keeps working until keys are added.
 */
export async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;
  try {
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, response: token, remoteip: ip }),
      }
    );
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch (err) {
    console.error("[antispam] Turnstile verification failed:", err);
    // Fail open: a Cloudflare outage must never block real leads. The traps
    // and scoring above are still doing their job.
    return true;
  }
}
