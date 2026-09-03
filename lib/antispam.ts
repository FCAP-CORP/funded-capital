/**
 * Public-form spam defense.
 *
 * Added 2026-09-03 after a bot flooded /contact and /apply overnight
 * (2026-09-02, ~26 submissions from Tor exit nodes) and burned the entire
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
 * Three layers, cheapest first. None of them add a CAPTCHA, so conversion on
 * the real forms is untouched:
 *   1. Traps  — hidden honeypot fields + a minimum fill time. A human never
 *               trips these; a generic form-filler trips them every time.
 *   2. Scoring — content heuristics for the fingerprint above.
 *   3. Rate limit — per-IP ceiling, best effort within a warm instance.
 *
 * Optional layer 4: Cloudflare Turnstile. Off unless TURNSTILE_SECRET_KEY and
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY are set, so it can be switched on in minutes
 * if this bot adapts, without another code change.
 */

/** Hidden trap field names. Kept here so the form and the server agree. */
export const HONEYPOT_TEXT_FIELD = "website";
export const HONEYPOT_CHECK_FIELD = "contactByFax";
export const FORM_RENDERED_FIELD = "fcRenderedAt";

/** A human needs at least this long to fill a lead form, in ms. */
const MIN_FILL_MS = 3_500;
/** Nothing legitimate sits on a form for 12h then submits; stale = replayed. */
const MAX_FILL_MS = 12 * 60 * 60 * 1000;

/** Per-IP ceiling. Generous — a real person retrying a failed submit is fine. */
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

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
 * adding a database. The traps below are what actually stop the bot.
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
  renderedAt: string;
  ip: string;
  userAgent: string;
}): SpamAssessment {
  const { fields, honeypotText, honeypotCheck, renderedAt, ip, userAgent } = opts;
  const reasons: string[] = [];

  /* --- Layer 1: traps. Any hit is a hard block, no scoring needed. --- */

  if (honeypotText.trim() !== "") {
    return { verdict: "block", score: 100, reasons: ["honeypot_text_filled"] };
  }
  if (honeypotCheck.trim() !== "") {
    return { verdict: "block", score: 100, reasons: ["honeypot_checkbox_ticked"] };
  }

  // A missing token is suspicious but NOT a hard block, deliberately.
  // /apply and /contact are ISR-prerendered with a 300s stale window, so for a
  // few minutes after any deploy the edge can still serve HTML from before the
  // shield existed. Hard-blocking here would silently swallow real leads in
  // that window — exactly the failure this whole file exists to prevent.
  // Scored instead: it quarantines on its own, so the lead is still written
  // down, just held back from Formspree and the team's inbox.
  const rendered = Number(renderedAt);
  const noToken = !renderedAt || Number.isNaN(rendered);

  if (!noToken) {
    const elapsed = Date.now() - rendered;
    if (elapsed < MIN_FILL_MS) {
      // Nobody types eleven fields in under three and a half seconds.
      return { verdict: "block", score: 100, reasons: [`filled_in_${elapsed}ms`] };
    }
    if (elapsed > MAX_FILL_MS) {
      return { verdict: "block", score: 100, reasons: ["stale_render_token"] };
    }
  }

  /* --- Layer 2: rate limit. --- */

  if (rateLimited(ip)) {
    return { verdict: "block", score: 100, reasons: ["rate_limited"] };
  }

  /* --- Layer 3: content scoring. 3+ points quarantines. --- */

  let score = 0;
  const bump = (points: number, why: string) => {
    score += points;
    reasons.push(why);
  };

  const firstName = fields.firstName ?? "";
  const lastName = fields.lastName ?? "";
  const email = fields.email ?? "";
  const message = fields.message ?? fields.additionalInfo ?? "";

  if (noToken) bump(3, "no_render_token");
  if (looksGenerated(firstName)) bump(2, "generated_first_name");
  if (looksGenerated(lastName)) bump(2, "generated_last_name");
  if (hasDotPadding(email)) bump(2, "email_dot_padding");
  // A real inquiry never consists solely of a phone-number-shaped string.
  if (message && isJustDigits(message)) bump(3, "numeric_only_message");
  if (LINK_SPAM.test(message)) bump(3, "link_spam_in_message");
  if (!userAgent || userAgent === "unknown") bump(1, "no_user_agent");

  if (score >= 3) return { verdict: "quarantine", score, reasons };
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
