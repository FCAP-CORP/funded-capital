import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";

/**
 * Broker application intake.
 * Only signed-in brokers can post. Documents + an application summary are
 * forwarded to the Google Apps Script Web App, which drops the files into the
 * Drive intake folder and emails the team. The shared secret authenticates the
 * portal to the script; neither the URL nor the secret is ever exposed to the browser.
 */
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
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  // The broker's identity comes from the authenticated session, never the client.
  let brokerEmail = "";
  try {
    const user = await currentUser();
    brokerEmail = user?.primaryEmailAddress?.emailAddress ?? "";
  } catch (e) {
    console.error("[submit-application] currentUser() failed:", e);
  }

  const files = (body.files ?? []).slice(0, 25);
  // Guard payload size (base64 inflates ~33%); Apps Script caps around ~50 MB/run.
  const totalBytes = files.reduce((n, f) => n + (f.data?.length ?? 0), 0);
  if (totalBytes > 40_000_000) {
    return NextResponse.json({ ok: false, error: "files_too_large" }, { status: 413 });
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret,
        action: "submit",
        submissionName: body.submissionName ?? `Submission ${new Date().toISOString()}`,
        summary: body.summary ?? "",
        submittedBy: userId,
        brokerEmail,
        application: body.application ?? {},
        files,
      }),
      // Apps Script responds via a redirect to googleusercontent.com; follow it.
      redirect: "follow",
    });
    const text = await res.text();
    let data: { ok?: boolean; error?: string; folder?: string };
    try {
      data = JSON.parse(text);
    } catch {
      // Apps Script returned HTML (usually a Google login page) instead of JSON —
      // almost always means the Web App "Who has access" is not set to "Anyone".
      console.error("[submit-application] Non-JSON from Apps Script. HTTP", res.status, "body:", text.slice(0, 400));
      return NextResponse.json({ ok: false, error: "bad_response" }, { status: 502 });
    }
    if (!data.ok) console.error("[submit-application] Apps Script returned error:", data.error);
    return NextResponse.json(data, { status: data.ok ? 200 : 502 });
  } catch (err) {
    console.error("[submit-application] Fetch to Apps Script failed:", err);
    return NextResponse.json({ ok: false, error: "intake_unreachable" }, { status: 502 });
  }
}
