import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { recordBrokerApplication, recordDriveFolder, type BrokerPropertyInput } from "@/lib/broker/record";
import { CONSENT_VERSION } from "@/lib/consent";
import { markMyDraftSubmitted } from "@/lib/broker/drafts.server";
import { MAX_UPLOAD_BASE64 } from "@/lib/crm/docRequests";
import { MAX_REQUEST_CHARS, applicationFileCount, parsePart } from "@/lib/broker/applicationParts";
import { forwardMyApplicationPart, type PartForwardInput, type PartForwardResult } from "@/lib/broker/applicationParts.server";

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
 *
 * FILES IN PARTS (30 Sep 2026). Vercel refuses any request body over 4.5 MB
 * before this code runs, so the browser packs the files (lib/broker/
 * applicationParts.ts). Request 1 is the application plus the first batch and
 * is handled exactly as before — it now also returns `applicationId` so the
 * rest can follow. Each further batch is a FOLLOW-UP (`part` in the body):
 * signed in → parsed → lib/broker/applicationParts.server.ts checks the
 * application is this user's own and under two hours old (else a 404, and Drive
 * is never called) → Drive → one activity line. No file is ever stored here.
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

  // Read as text first so the size is checked before anything is parsed.
  const bodyText = await request.text();
  if (bodyText.length > MAX_REQUEST_CHARS) {
    return NextResponse.json({ ok: false, error: "files_too_large" }, { status: 413 });
  }
  let raw: unknown;
  try {
    raw = JSON.parse(bodyText);
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  /* ------------------------------------ a follow-up batch of more files */
  if ("part" in raw) {
    return handlePart(raw, userId, url, secret);
  }

  const body = raw as {
    submissionName?: string;
    summary?: string;
    application?: Record<string, string>;
    files?: { name: string; mimeType: string; data: string }[];
    /** The broker ticking the box for THEMSELVES. Never a borrower's consent. */
    smsConsent?: boolean;
    /** The property schedule on a portfolio deal. */
    properties?: BrokerPropertyInput[];
    isPortfolio?: boolean;
    /** The saved draft this came from, if any — closed and wiped once Drive accepts. */
    draftId?: string;
    /** How many files the WHOLE application is sending; this request carries the first batch. */
    totalFiles?: number;
  };

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

  const files = (Array.isArray(body.files) ? body.files : []).slice(0, 25);
  // One packed batch at most (base64 characters). Vercel stops anything much
  // bigger before it gets here; this makes the refusal a clear one.
  const totalBytes = files.reduce((n, f) => n + (typeof f?.data === "string" ? f.data.length : 0), 0);
  if (totalBytes > MAX_UPLOAD_BASE64) {
    return NextResponse.json({ ok: false, error: "files_too_large" }, { status: 413 });
  }
  // The whole application's file count, not just this first batch's.
  const fileCount = applicationFileCount(body.totalFiles, files.length);

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
      fileCount,
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
      JSON.stringify({ submissionName, brokerEmail, submittedBy: userId, fileCount }),
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

  // Now that Drive has reported a folder, attach it to the CRM record so the
  // broker dashboard can offer a Documents link. Awaited rather than
  // fire-and-forget: a serverless function can be frozen the moment it
  // responds, and a dangling promise would simply never run.
  if (data.ok && data.folder && crmApplicationId) {
    await recordDriveFolder(crmApplicationId, data.folder);
  }

  // The saved draft, if this came from one, is now a real submission: close it
  // and wipe its copy of the borrower's details. Only this broker's own draft
  // can match (drafts.server.ts checks the owner itself). Never fails the
  // response — a leftover draft is a nuisance, a failed submit is not.
  if (data.ok && body.draftId) {
    await markMyDraftSubmitted(body.draftId).catch((e) => console.error("[submit-application] draft close failed:", e instanceof Error ? e.message : e));
  }

  // The response shape the portal already expects, plus the CRM application id
  // when there is one: the browser needs it to send the rest of the files. A
  // broker is never told whether the CRM write worked — without an id the page
  // simply lists any remaining files for them to email.
  const reply = data.ok && crmApplicationId ? { ...data, applicationId: crmApplicationId } : data;
  return NextResponse.json(reply, { status: data.ok ? 200 : 502 });
}

/**
 * A follow-up batch of files for the application this broker just submitted.
 *
 * Who may send one is decided in lib/broker/applicationParts.server.ts from the
 * SESSION — the application must be this user's own and under two hours old —
 * never from anything in this body. Anything else is a plain 404 and Drive is
 * never called.
 */
async function handlePart(raw: unknown, userId: string, url: string, secret: string) {
  const parsed = parsePart(raw);
  if (!parsed.ok) {
    const status = parsed.error === "not_found" ? 404 : parsed.error === "files_too_large" ? 413 : 400;
    return NextResponse.json({ ok: false, error: parsed.error }, { status });
  }

  const forward = async (input: PartForwardInput): Promise<PartForwardResult> => {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret,
          // KNOWN LIMIT OF THE INTAKE SCRIPT: today's script ignores `action`
          // and `folderUrl` and files every post as a new submission — its own
          // Drive folder ("… - files 2 of 3"), a Submissions sheet row, and an
          // email "New broker application: … - files 2 of 3". The folder name,
          // summary and notes all say it is more files for the application just
          // submitted. A future script can append to `folderUrl` instead,
          // without a change here.
          action: "append",
          folderUrl: input.folderUrl,
          submissionName: input.submissionName,
          summary: input.summary,
          submittedBy: userId,
          brokerEmail: input.brokerEmail,
          application: input.application,
          files: input.files,
        }),
        // Apps Script answers with a redirect to googleusercontent.com; follow it.
        redirect: "follow",
      });
      const body = await res.text();
      let data: { ok?: boolean; folder?: string; error?: string };
      try {
        data = JSON.parse(body);
      } catch {
        console.error("[submit-application] part: non-JSON from Apps Script. HTTP", res.status);
        return { ok: false, error: "bad_response" };
      }
      if (!data.ok) {
        console.error("[submit-application] part: Apps Script returned error:", data.error);
        return { ok: false, error: "intake_error" };
      }
      return { ok: true, folder: typeof data.folder === "string" ? data.folder : null };
    } catch (e) {
      console.error("[submit-application] part: fetch to Apps Script failed:", e instanceof Error ? e.message : e);
      return { ok: false, error: "intake_unreachable" };
    }
  };

  const result = await forwardMyApplicationPart(parsed.value, forward);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, folder: result.folder });
}
