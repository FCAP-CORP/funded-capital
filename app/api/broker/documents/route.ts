import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { MAX_UPLOAD_BASE64, parseUpload } from "@/lib/crm/docRequests";
import { uploadToRequest, type ForwardInput, type ForwardResult } from "@/lib/broker/docRequests.server";

/**
 * A broker uploads files against one item on their deal's document list.
 *
 * THE PORTAL IS A PIPE: the files go straight on to the Drive intake (the same
 * Apps Script web app as a new application) and only their names are kept.
 *
 * Who may upload is decided in lib/broker/docRequests.server.ts from the
 * SESSION — scope.ts's canActOnApplication — never from anything in this body.
 * A deal or item this person may not act on is a plain 404, the same as one
 * that does not exist.
 *
 * KNOWN LIMIT OF THE INTAKE SCRIPT: it treats every post as a "submission", so
 * each upload also adds a row to the Submissions sheet and emails Luis with the
 * subject "New broker application: Documents for …". The folder name, the row's
 * notes and the email body all say plainly that it is more documents for an
 * existing deal. The `action: "documents"` below is ignored by today's script
 * (it falls through to the submission path) and is there so a future script
 * can file these differently without a change here.
 */

/** Vercel refuses bodies over 4.5 MB before this runs; refuse a little earlier, clearly. */
const MAX_BODY_CHARS = MAX_UPLOAD_BASE64 + 64_000;

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const url = process.env.DRIVE_WEBAPP_URL;
  const secret = process.env.DRIVE_WEBAPP_SECRET;
  if (!url || !secret) return NextResponse.json({ ok: false, error: "intake_not_configured" }, { status: 500 });

  const text = await request.text();
  if (text.length > MAX_BODY_CHARS) return NextResponse.json({ ok: false, error: "files_too_large" }, { status: 413 });
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const parsed = parseUpload(raw);
  if (!parsed.ok) {
    const status = parsed.error === "not_found" ? 404 : parsed.error === "files_too_large" ? 413 : 400;
    return NextResponse.json({ ok: false, error: parsed.error }, { status });
  }

  const forward = async (input: ForwardInput): Promise<ForwardResult> => {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret,
          action: "documents",
          submissionName: input.folderName,
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
        console.error("[broker/documents] Non-JSON from Apps Script. HTTP", res.status);
        return { ok: false, error: "bad_response" };
      }
      if (!data.ok) {
        console.error("[broker/documents] Apps Script returned error:", data.error);
        return { ok: false, error: "intake_error" };
      }
      return { ok: true, folder: typeof data.folder === "string" ? data.folder : null };
    } catch (e) {
      console.error("[broker/documents] Fetch to Apps Script failed:", e instanceof Error ? e.message : e);
      return { ok: false, error: "intake_unreachable" };
    }
  };

  const result = await uploadToRequest(parsed.applicationId, parsed.requestId, parsed.files, forward);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, received: result.received });
}
