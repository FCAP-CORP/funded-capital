import { NextResponse } from "next/server";
import { checkBotId } from "botid/server";
import { SMS_CONSENT_TEXT, CONSENT_VERSION } from "@/lib/consent";
import {
  hardBlockReason,
  advisoryFlags,
  isRateLimited,
  HONEYPOT_TEXT_FIELD,
  HONEYPOT_CHECK_FIELD,
  FORM_ELAPSED_FIELD,
} from "@/lib/antispam";

/**
 * Public lead intake with TCPA / A2P 10DLC consent capture.
 *
 * The public marketing forms (Apply, Contact) POST here instead of going
 * straight to a form service. This server hop is what makes the consent record
 * legally defensible: only the server can see the visitor's real IP and stamp
 * a trustworthy server-side timestamp. For every submission we record:
 *   - whether the visitor checked the SMS/call consent box,
 *   - the exact consent language that was displayed (server-owned, untamperable),
 *   - a UTC timestamp, the submitter IP, user agent, and the page URL.
 *
 * ---------------------------------------------------------------------------
 * PIPELINE ORDER — reversed 2026-09-03. Read this before changing anything.
 * ---------------------------------------------------------------------------
 * Formspree used to be primary and the Google Drive intake the backup. On
 * 2026-09-02 a bot flood spent the entire Formspree monthly allowance (50 on
 * the free tier) in one day, after which Formspree began rejecting REAL leads.
 * The Drive backup caught them, which is the only reason nothing was lost.
 *
 * The lesson was not "buy more Formspree quota" — it was that a metered
 * third-party service should never sit in the primary path of a lead. So:
 *
 *   1. PRIMARY  — the Google Drive intake (Apps Script). Unmetered, already
 *      the durable record of record, and it sends the team notification
 *      itself. One retry on a transient failure.
 *   2. BACKSTOP — Formspree, called ONLY when Drive fails. At normal volume
 *      that is a handful of submissions a year, so the monthly allowance is
 *      no longer something an attacker (or a good month) can exhaust.
 *   3. LAST RESORT — if both fail, the full payload is logged under the marker
 *      "[api/lead] LEAD BACKUP" and the response is a 502, so the form keeps
 *      the visitor's answers on screen and shows the phone/email fallback
 *      instead of a false thank-you.
 *
 * CONVERSION IMPACT of the reversal — all three point the same way:
 *   - Nothing the visitor sees changed. Same fields, same copy, same button,
 *     no CAPTCHA. There is no mechanism by which form completion can move.
 *   - The happy path is now ONE network hop instead of two (it used to await
 *     Formspree and then Drive), so the thank-you page arrives sooner. Faster
 *     submits convert better, so if anything moves, it moves up.
 *   - DRIVE_TIMEOUT_MS caps how long a visitor can ever wait on a hung Apps
 *     Script before we fall through to the backstop. Previously a slow Drive
 *     call had no ceiling at all.
 *
 * SPAM DEFENSE — rebuilt 2026-09-03 around Vercel BotID.
 *
 * Screening runs before any forwarding, and there are now exactly three things
 * that can change a submission's fate. Everything else is a note on the record:
 *
 *   BLOCK      the hidden checkbox honeypot was ticked. No autofill mechanism
 *              ticks a box; only a script setting every field does. Discarded,
 *              logged, and answered with a normal-looking 200 — telling a bot
 *              it was blocked just teaches its author what to change.
 *   QUARANTINE BotID says the request did not come from a real browser, or one
 *              IP has posted more than eight times in an hour. Recorded and
 *              flagged, notification suppressed, nobody contacted. Quarantine
 *              rather than discard because BotID's false-positive rate is low
 *              but not zero, and a row costs nothing while a lost borrower
 *              costs a deal.
 *   ALLOW      everything else, carrying any advisory flags for a human to read.
 *
 * The content heuristics that used to decide this were measured against real
 * names and flagged Schmidt and Schwartz while missing 28% of the actual bot
 * names. They are now advisory only. Do not promote them back without data.
 */

/** Formspree endpoints, kept server-side. Backstop only — see the note above. */
const FORMSPREE_ENDPOINTS: Record<string, string> = {
  apply: "https://formspree.io/f/mojbjdqv",
  contact: "https://formspree.io/f/xwvzvokq",
};

/**
 * How long a visitor may wait on the Drive intake before we give up and use
 * the backstop. Generous enough for a normal Apps Script round trip (~1-2s),
 * short enough that a hung script never costs us the submission.
 */
const DRIVE_TIMEOUT_MS = 8_000;

/** Best-effort real client IP from the platform's proxy headers. */
function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("x-vercel-forwarded-for") ??
    "unknown"
  );
}

/**
 * PRIMARY: write the lead to the Google Sheet via the Drive intake Apps Script.
 * `notify` asks the script to email the team as well.
 *
 * Retries once on a transient failure. It carries the whole pipeline now, so
 * it gets the retry that used to belong to Formspree.
 */
async function sendToDriveIntake(
  formType: string,
  payload: Record<string, string>,
  notify: boolean
): Promise<boolean> {
  const url = process.env.DRIVE_WEBAPP_URL;
  const secret = process.env.DRIVE_WEBAPP_SECRET;
  if (!url || !secret) {
    console.error("[api/lead] Drive intake not configured (missing env vars).");
    return false;
  }

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, action: "lead", formType, notify, lead: payload }),
        // Apps Script responds via a redirect to googleusercontent.com; follow it.
        redirect: "follow",
        // Hard ceiling on how long the visitor waits. Without this, a hung
        // Apps Script leaves the button spinning until the platform gives up.
        signal: AbortSignal.timeout(DRIVE_TIMEOUT_MS),
      });
      const text = await res.text();
      let data: { ok?: boolean; error?: string };
      try {
        data = JSON.parse(text);
      } catch {
        // Apps Script returned HTML (usually a Google login page) instead of
        // JSON — almost always means the Web App "Who has access" is not
        // set to "Anyone". Not transient; do not retry.
        console.error(
          "[api/lead] Drive intake returned non-JSON. HTTP",
          res.status,
          text.slice(0, 300)
        );
        return false;
      }
      if (data.ok) return true;
      console.error("[api/lead] Drive intake returned error:", data.error);
      return false;
    } catch (err) {
      // Network error or timeout — this is the case worth retrying.
      console.error(
        `[api/lead] Drive intake unreachable (attempt ${attempt}/2):`,
        err
      );
    }
    if (attempt === 1) await new Promise((r) => setTimeout(r, 800));
  }
  return false;
}

/**
 * BACKSTOP: forward the lead to Formspree. Reached only when the Drive intake
 * has already failed, so this is a rescue path, not the normal one.
 */
async function sendToFormspreeBackstop(
  endpoint: string,
  payload: Record<string, string>
): Promise<boolean> {
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(DRIVE_TIMEOUT_MS),
    });
    if (res.ok) {
      console.error(
        "[api/lead] Drive intake failed; Formspree backstop caught this lead."
      );
      return true;
    }
    if (res.status === 402 || res.status === 429) {
      console.error(
        "[api/lead] BACKSTOP UNAVAILABLE — Drive intake failed AND the " +
          "Formspree allowance is spent. Both lead channels are down."
      );
      return false;
    }
    const text = await res.text().catch(() => "");
    console.error(
      "[api/lead] Formspree backstop rejected submission. HTTP",
      res.status,
      text.slice(0, 400)
    );
    return false;
  } catch (err) {
    console.error("[api/lead] Formspree backstop unreachable:", err);
    return false;
  }
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const formType = String(form.get("formType") ?? "apply");
  const endpoint = FORMSPREE_ENDPOINTS[formType] ?? FORMSPREE_ENDPOINTS.apply;

  // An unchecked checkbox submits no value at all, so presence === opted in.
  const raw = form.get("smsConsent");
  const smsConsent = raw != null && raw !== "" && raw !== "false";

  // Consent proof — the who / what / when / where of the opt-in.
  const consentIp = clientIp(request);
  const consentTimestamp = new Date().toISOString();
  const userAgent = request.headers.get("user-agent") ?? "unknown";
  const pageUrl = String(
    form.get("consent_page_url") ?? request.headers.get("referer") ?? ""
  );

  // Collect the lead fields the visitor typed. Strip control fields; we re-add
  // explicit, auditable consent fields below.
  const CONTROL_FIELDS = new Set([
    "smsConsent",
    "formType",
    "consent_page_url",
    HONEYPOT_TEXT_FIELD,
    HONEYPOT_CHECK_FIELD,
    FORM_ELAPSED_FIELD,
  ]);
  const payload: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (CONTROL_FIELDS.has(key)) continue;
    if (typeof value === "string") payload[key] = value;
  }

  /* ---------------------------------------------------------------- */
  /* Screening — before anything is forwarded or emailed.              */
  /* ---------------------------------------------------------------- */

  // 1. The one hard block. Free, and checked first so an obvious bot never
  //    costs us a BotID verification.
  const blocked = hardBlockReason(String(form.get(HONEYPOT_CHECK_FIELD) ?? ""));
  if (blocked) {
    console.warn(
      "[api/lead] SPAM BLOCKED —",
      JSON.stringify({ formType, ip: consentIp, reason: blocked })
    );
    return NextResponse.json({ ok: true });
  }

  // 2. Proof, not inference: BotID verifies a cryptographic challenge the
  //    browser solved. Fails OPEN — a BotID outage must never cost a lead, and
  //    the honeypot above is still standing either way.
  let botVerdict = false;
  try {
    const verification = await checkBotId();
    botVerdict = verification.isBot === true;
  } catch (err) {
    console.error("[api/lead] BotID check failed; allowing through:", err);
  }

  // 3. Volumetric, content-blind, and therefore safe to act on.
  const rateLimited = isRateLimited(consentIp);

  // 4. Notes for whoever reads the row. These decide nothing.
  const flags = advisoryFlags({
    fields: payload,
    honeypotText: String(form.get(HONEYPOT_TEXT_FIELD) ?? ""),
    elapsedMs: String(form.get(FORM_ELAPSED_FIELD) ?? ""),
    userAgent,
  });

  const quarantine = botVerdict || rateLimited;

  // --- Proof-of-consent record (server-authoritative) ---
  payload.sms_consent = smsConsent ? "YES — opted in to calls/texts" : "NO — not opted in";
  // Only meaningful when they actually opted in, but we always log the language
  // and version so the record is self-describing.
  payload.consent_text = SMS_CONSENT_TEXT;
  payload.consent_version = CONSENT_VERSION;
  payload.consent_timestamp_utc = consentTimestamp;
  payload.consent_ip = consentIp;
  payload.consent_user_agent = userAgent;
  payload.consent_page_url = pageUrl;

  if (quarantine) {
    // Held back, never dropped: the row is written so a false positive can be
    // found and worked by hand, but nothing is sent to the lead or the team.
    const why = botVerdict ? "BotID: not a verified browser" : "too many submissions from one IP";
    payload.spam_flag = `HELD FOR REVIEW — ${why}`;
    payload.spam_reasons = flags.length ? flags.join(", ") : "(no other flags)";
    payload._subject = `[HELD FOR REVIEW] ${formType} submission — nobody contacted`;
    console.warn(
      "[api/lead] QUARANTINED —",
      JSON.stringify({ formType, ip: consentIp, botVerdict, rateLimited, flags })
    );
    await sendToDriveIntake(formType, payload, false);
    return NextResponse.json({ ok: true });
  }

  // A clean lead still carries its notes, so anything odd is visible on the
  // row rather than silently influencing whether the lead was delivered.
  if (flags.length) {
    payload.review_flags = flags.join(", ");
    console.info(
      "[api/lead] delivered with advisory flags —",
      JSON.stringify({ formType, flags })
    );
  }

  // Flag SMS opt-in leads right in the subject so the team can spot them.
  payload._subject = `New ${formType} lead${smsConsent ? " — SMS/Call opt-in ✓" : ""}`;

  // 1) PRIMARY: the Drive intake stores the lead and notifies the team.
  const driveOk = await sendToDriveIntake(formType, payload, true);
  if (driveOk) return NextResponse.json({ ok: true });

  // 2) BACKSTOP: only reached when Drive is down.
  const formspreeOk = await sendToFormspreeBackstop(endpoint, payload);
  if (formspreeOk) return NextResponse.json({ ok: true });

  // 3) Both channels failed — make the lead recoverable, then surface the
  //    error so the form shows the visitor the phone/email fallback.
  console.error(
    "[api/lead] LEAD BACKUP (both channels failed — recover this lead from the log):",
    JSON.stringify(payload)
  );
  return NextResponse.json({ ok: false, error: "forward_failed" }, { status: 502 });
}
