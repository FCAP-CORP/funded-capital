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

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[api/lead] Formspree rejected submission. HTTP", res.status, text.slice(0, 400));
      return NextResponse.json({ ok: false, error: "forward_failed" }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/lead] Fetch to Formspree failed:", err);
    return NextResponse.json({ ok: false, error: "unreachable" }, { status: 502 });
  }
}
