import { NextResponse } from "next/server";
import { SMS_CONSENT_TEXT, CONSENT_VERSION } from "@/lib/consent";

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
  const payload: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (key === "smsConsent" || key === "formType" || key === "consent_page_url") continue;
    if (typeof value === "string") payload[key] = value;
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
