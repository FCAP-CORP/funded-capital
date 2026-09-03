import { NextResponse } from "next/server";
import { SMS_CONSENT_TEXT, CONSENT_VERSION } from "@/lib/consent";
import {
  assessSubmission,
  verifyTurnstile,
  HONEYPOT_TEXT_FIELD,
  HONEYPOT_CHECK_FIELD,
  FORM_RENDERED_FIELD,
} from "@/lib/antispam";

/**
 * Public lead intake with TCPA / A2P 10DLC consent capture.
 *
 * The public marketing forms (Apply, Contact) POST here instead of going
 * straight to Formspree. This server hop is what makes the consent record
 * legally defensible: only the server can see the visitor's real IP and stamp
 * a trustworthy server-side timestamp. For every submission we record:
 *   - whether the visitor checked the SMS/call consent box,
 *   - the exact consent language that was displayed (server-owned, untamperable),
 *   - a UTC timestamp, the submitter IP, user agent, and the page URL.
 * Then we forward the lead + this consent proof to Formspree, where it is
 * stored with the lead record and emailed to the team.
 *
 * A lead STILL submits if the box is left unchecked — we simply record
 * sms_consent = NO so the team knows they do not have texting/auto-call consent
 * for that lead.
 *
 * RELIABILITY (added 2026-08-21 after a lead was lost to a silent failure):
 * Formspree is no longer a single point of failure.
 *   1. Every lead is ALSO written to the Google Drive intake via the same
 *      Apps Script web app the broker portal uses (action: "lead"). That
 *      Sheet is the durable record; Formspree is the notifier.
 *   2. The Formspree forward retries once on transient (network / 5xx) failure.
 *   3. The request only fails (502) when BOTH Formspree and the Drive backup
 *      fail — and in that case the full payload is logged under the marker
 *      "[api/lead] LEAD BACKUP" as a last resort. The forms check res.ok and
 *      show the visitor a phone/email fallback instead of a false thank-you.
 *   4. When Formspree fails but the Drive backup succeeds, the Apps Script
 *      sends the notification email itself (notify: true), so the team still
 *      hears about the lead immediately.
 *
 * SPAM DEFENSE (added 2026-09-03 after the 2026-09-02 Tor bot flood):
 *   5. Every submission is screened by lib/antispam BEFORE anything is
 *      forwarded. This is deliberately the first thing that happens, because
 *      the damage from that attack was not the junk itself — it was 26 bot
 *      submissions eating the whole Formspree monthly quota, after which
 *      Formspree started rejecting real leads.
 *   6. Blocked submissions get a 200 with a normal-looking body. Telling a bot
 *      it was blocked just teaches its author what to change; a silent accept
 *      keeps this one running against a wall.
 *   7. Quarantined (suspicious but not certain) submissions still reach the
 *      Drive sheet, flagged and with the notification suppressed, so a false
 *      positive is recoverable rather than lost.
 *   8. Formspree quota rejections (402/429) are now recognised explicitly and
 *      never retried — retrying a quota error just wastes time on a request
 *      that cannot succeed.
 */

// Formspree endpoints, kept server-side. (These IDs were already public in the
// old client code; centralizing them here just keeps the mapping in one place.)
const FORMSPREE_ENDPOINTS: Record<string, string> = {
  apply: "https://formspree.io/f/mojbjdqv",
  contact: "https://formspree.io/f/xwvzvokq",
};

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

/** Forward the lead to Formspree, retrying once on a transient failure. */
async function sendToFormspree(
  endpoint: string,
  payload: Record<string, string>
): Promise<boolean> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) return true;
      const text = await res.text().catch(() => "");
      // Quota exhaustion is not a transient error and not a code bug — it is
      // an account limit. Call it out by name so it is obvious in the logs.
      if (res.status === 402 || res.status === 429) {
        console.error(
          "[api/lead] FORMSPREE QUOTA EXHAUSTED — the monthly submission limit " +
            "is spent, so Formspree is rejecting real leads. The Drive intake " +
            "is carrying them. Raise the plan limit or move off Formspree."
        );
        return false;
      }
      console.error(
        "[api/lead] Formspree rejected submission. HTTP",
        res.status,
        text.slice(0, 400)
      );
      // A 4xx is a hard rejection — retrying won't change the answer.
      if (res.status < 500) return false;
    } catch (err) {
      console.error("[api/lead] Fetch to Formspree failed:", err);
    }
    if (attempt === 1) await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

/**
 * Write the lead to the Google Sheet via the Drive intake Apps Script.
 * `notify` asks the script to email the team too (used when Formspree failed,
 * so the notification email is never lost — and never duplicated).
 */
async function sendToDriveBackup(
  formType: string,
  payload: Record<string, string>,
  notify: boolean
): Promise<boolean> {
  const url = process.env.DRIVE_WEBAPP_URL;
  const secret = process.env.DRIVE_WEBAPP_SECRET;
  if (!url || !secret) {
    console.error("[api/lead] Drive backup not configured (missing env vars).");
    return false;
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, action: "lead", formType, notify, lead: payload }),
      // Apps Script responds via a redirect to googleusercontent.com; follow it.
      redirect: "follow",
    });
    const text = await res.text();
    let data: { ok?: boolean; error?: string };
    try {
      data = JSON.parse(text);
    } catch {
      console.error(
        "[api/lead] Drive backup returned non-JSON. HTTP",
        res.status,
        text.slice(0, 300)
      );
      return false;
    }
    if (!data.ok) {
      console.error("[api/lead] Drive backup returned error:", data.error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[api/lead] Drive backup unreachable:", err);
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
    FORM_RENDERED_FIELD,
    "cf-turnstile-response",
  ]);
  const payload: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (CONTROL_FIELDS.has(key)) continue;
    if (typeof value === "string") payload[key] = value;
  }

  /* ---------------------------------------------------------------- */
  /* Spam screening — before any quota is spent or any email is sent.  */
  /* ---------------------------------------------------------------- */

  const assessment = assessSubmission({
    fields: payload,
    honeypotText: String(form.get(HONEYPOT_TEXT_FIELD) ?? ""),
    honeypotCheck: String(form.get(HONEYPOT_CHECK_FIELD) ?? ""),
    renderedAt: String(form.get(FORM_RENDERED_FIELD) ?? ""),
    ip: consentIp,
    userAgent,
  });

  const turnstileOk = await verifyTurnstile(
    String(form.get("cf-turnstile-response") ?? ""),
    consentIp
  );

  if (assessment.verdict === "block" || !turnstileOk) {
    // One compact line per blocked hit: enough to watch the attack and confirm
    // no real lead is being caught, without dumping harvested third-party PII
    // into the logs.
    console.warn(
      "[api/lead] SPAM BLOCKED —",
      JSON.stringify({
        formType,
        ip: consentIp,
        reasons: turnstileOk ? assessment.reasons : ["turnstile_failed"],
        email: (payload.email ?? "").slice(0, 60),
      })
    );
    // Look successful. A bot that sees a rejection gets tuned; one that thinks
    // it is winning keeps hammering a wall for free.
    return NextResponse.json({ ok: true });
  }

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

  if (assessment.verdict === "quarantine") {
    // Suspicious, not certain. Keep it out of Formspree (quota) and out of the
    // team's inbox, but write it down so a false positive can be recovered.
    // The flags travel with the record so the row is self-explaining in the Sheet.
    payload.spam_flag = "SUSPECTED SPAM — review before contacting";
    payload.spam_score = String(assessment.score);
    payload.spam_reasons = assessment.reasons.join(", ");
    payload._subject = `[SUSPECTED SPAM] ${formType} submission — not contacted`;
    console.warn(
      "[api/lead] SPAM QUARANTINED —",
      JSON.stringify({ formType, ip: consentIp, ...assessment })
    );
    await sendToDriveBackup(formType, payload, false);
    return NextResponse.json({ ok: true });
  }

  // Flag SMS opt-in leads right in the email subject so the team can spot them.
  payload._subject = `New ${formType} lead${smsConsent ? " — SMS/Call opt-in ✓" : ""}`;

  // 1) Primary: Formspree (stores the lead + emails the team).
  const formspreeOk = await sendToFormspree(endpoint, payload);

  // 2) Backup: always write the lead to the Drive intake Sheet. If Formspree
  //    failed, ask the script to send the notification email too.
  const driveOk = await sendToDriveBackup(formType, payload, !formspreeOk);

  if (formspreeOk || driveOk) {
    if (!formspreeOk) {
      console.error(
        "[api/lead] Formspree failed but lead was captured by the Drive backup."
      );
    }
    if (!driveOk) {
      // Non-fatal: Formspree has the lead. Logged by sendToDriveBackup already.
      console.error("[api/lead] Drive backup missed a lead that Formspree captured.");
    }
    return NextResponse.json({ ok: true });
  }

  // Both channels failed — make the lead recoverable, then surface the error
  // so the form shows the visitor the phone/email fallback.
  console.error(
    "[api/lead] LEAD BACKUP (both channels failed — recover this lead from the log):",
    JSON.stringify(payload)
  );
  return NextResponse.json({ ok: false, error: "forward_failed" }, { status: 502 });
}
