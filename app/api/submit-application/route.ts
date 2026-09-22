import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { recordBrokerApplication, type BrokerPropertyInput } from "@/lib/broker/record";
import { CONSENT_VERSION } from "@/lib/consent";

/**
 * Broker application intake.
 *
 * Only signed-in brokers can post. Documents + an application summary are
 * forwarded to the Google Apps Script Web App, which drops the files into the
 * Drive intake folder and emails the team. The shared secret authenticates the
 * portal to the script; neither the URL nor the secret is ever exposed to the
 * browser.
 *
 * PHASE 2a: the submission is ALSO written into Postgres so it appears in
 * `/crm` immediately, instead of living only in a Google Sheet that the CRM
 * knows nothing about.
 *
 * The two writes run IN PARALLEL and are independent, for two reasons:
 *
 *   1. A broker who has just uploaded twenty megabytes of documents should not
 *      wait for a database round trip on top of the Drive upload.
 *
 *   2. More importantly, a Drive failure must not cost us the record of the
 *      deal — that is precisely the submission Luis most needs to know about.
 *      Running them in sequence would mean a Drive timeout swallowed the
 *      application entirely.
 *
 * Drive remains PRIMARY: its result alone decides what the broker is told. A
 * database failure is logged under a greppable marker and never surfaces as an
 * error to someone who has just spent ten minutes filling in a form.
 */

/** Never let a slow database hold the response open. */
const CRM_WRITE_TIMEOUT_MS = 8000;

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = process.env.DRIVE_WEBAPP_URL;
  const secret = process.env.DRIVE_WEBAPP_SECRET;
  if (!url || !secret) {
    return NextResponse.json({ ok: false, error: "intake_not_configured" }, { status: 500 });
  }

  let body: {
    submissionName?: string;
    summary?: string;
    application?: Record<string, string>;
    files?: { name: string; mimeType: string; data: string }[];
    /** The broker ticking the box for THEMSELVES. Never a borrower's consent. */
    smsConsent?: boolean;
    /** The property schedule on a portfolio deal. */
    properties?: BrokerPropertyInput[];
    isPortfolio?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  // The broker's identity comes from the authenticated session, never the client.
  let brokerEmail = "";
  let brokerName: string | null = null;
  try {
    const user = await currentUser();
    brokerEmail = user?.primaryEmailAddress?.emailAddress ?? "";
    brokerName = user?.fullName
      ?? [user?.firstName, user?.lastName].filter(Boolean).join(" ")
      ?? null;
    if (!brokerName) brokerName = null;
  } catch (e) {
    console.error("[submit-application] currentUser() failed:", e);
  }

  const files = (body.files ?? []).slice(0, 25);
  // Guard payload size (base64 inflates ~33%); Apps Script caps around ~50 MB/run.
  const totalBytes = files.reduce((n, f) => n + (f.data?.length ?? 0), 0);
  if (totalBytes > 40_000_000) {
    return NextResponse.json({ ok: false, error: "files_too_large" }, { status: 413 });
  }

  const submissionName = body.submissionName ?? `Submission ${new Date().toISOString()}`;
  const submittedAt = new Date();

  /* ------------------------------------------------- the primary: Drive */
  const drivePromise = fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      secret,
      action: "submit",
      submissionName,
      summary: body.summary ?? "",
      submittedBy: userId,
      brokerEmail,
      application: body.application ?? {},
      files,
    }),
    // Apps Script responds via a redirect to googleusercontent.com; follow it.
    redirect: "follow",
  });

  /* ---------------------------------------------- alongside it: the CRM */
  const crmPromise = Promise.race([
    recordBrokerApplication({
      clerkUserId: userId,
      brokerEmail,
      brokerName,
      submissionName,
      summary: body.summary ?? "",
      application: body.application ?? {},
      submittedAt,
      fileCount: files.length,
      // The version is taken from the server constant, never from the client —
      // so the version stored is always the wording the server would have
      // served, whatever a stale page might claim.
      smsConsent: body.smsConsent === true,
      consentVersion: CONSENT_VERSION,
      properties: Array.isArray(body.properties) ? body.properties : undefined,
      isPortfolio: body.isPortfolio === true,
    }),
    new Promise<{ ok: false; error: string }>((resolve) =>
      setTimeout(() => resolve({ ok: false, error: "timed out" }), CRM_WRITE_TIMEOUT_MS),
    ),
  ]);

  const [driveSettled, crmSettled] = await Promise.allSettled([drivePromise, crmPromise]);

  /* --------------------------------------------------- what the CRM did */
  let crmApplicationId: string | null = null;
  let crmFailure: string | null = null;

  // Narrowed in separate steps rather than one compound condition: TypeScript
  // cannot tell from `!(fulfilled && ok)` that `value` is the failure variant.
  if (crmSettled.status === "rejected") {
    crmFailure = String(crmSettled.reason);
  } else if (!crmSettled.value.ok) {
    crmFailure = crmSettled.value.error;
  } else {
    crmApplicationId = crmSettled.value.applicationId;
  }

  if (crmFailure !== null) {
    const reason = crmFailure;
    // Greppable, and carries enough to reconstruct the row by hand. The
    // borrower's details are NOT logged — only what identifies the submission.
    console.error(
      "[submit-application] CRM WRITE FAILED:", reason,
      JSON.stringify({ submissionName, brokerEmail, submittedBy: userId, fileCount: files.length }),
    );
  }

  /* ------------------------------------------- Drive decides the answer */
  if (driveSettled.status === "rejected") {
    console.error("[submit-application] Fetch to Apps Script failed:", driveSettled.reason);
    if (crmApplicationId) {
      // The deal is not lost — it is in the CRM. Say so loudly, because the
      // documents did NOT reach Drive and someone has to chase them.
      console.error(
        "[submit-application] DRIVE FAILED BUT CRM RECORDED:", crmApplicationId,
        "— documents did not reach Drive intake.",
      );
    }
    return NextResponse.json({ ok: false, error: "intake_unreachable" }, { status: 502 });
  }

  const res = driveSettled.value;
  const text = await res.text();
  let data: { ok?: boolean; error?: string; folder?: string };
  try {
    data = JSON.parse(text);
  } catch {
    // Apps Script returned HTML (usually a Google login page) instead of JSON —
    // almost always means the Web App "Who has access" is not set to "Anyone".
    console.error("[submit-application] Non-JSON from Apps Script. HTTP", res.status, "body:", text.slice(0, 400));
    if (crmApplicationId) {
      console.error("[submit-application] DRIVE FAILED BUT CRM RECORDED:", crmApplicationId);
    }
    return NextResponse.json({ ok: false, error: "bad_response" }, { status: 502 });
  }

  if (!data.ok) {
    console.error("[submit-application] Apps Script returned error:", data.error);
    if (crmApplicationId) {
      console.error("[submit-application] DRIVE FAILED BUT CRM RECORDED:", crmApplicationId);
    }
  }

  // The response shape the portal already expects is unchanged. The CRM is an
  // internal concern and a broker has no reason to hear about it either way.
  return NextResponse.json(data, { status: data.ok ? 200 : 502 });
}
