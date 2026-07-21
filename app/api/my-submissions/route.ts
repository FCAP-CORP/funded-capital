import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";

export interface Submission {
  date: string;
  broker: string;
  borrower: string;
  program: string;
  property: string;
  loanAmount: string;
  status: string;
  folder: string;
}

/**
 * Returns the signed-in broker's own submissions, read from the Google Sheet
 * via the Apps Script `doGet`. The broker email comes from the authenticated
 * session (not the client), so a broker can only ever see their own deals.
 * Failures degrade to an empty list so the dashboard never errors.
 */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ ok: false, submissions: [] as Submission[] }, { status: 401 });

  const email = user.primaryEmailAddress?.emailAddress ?? "";
  const url = process.env.DRIVE_WEBAPP_URL;
  const secret = process.env.DRIVE_WEBAPP_SECRET;
  if (!url || !secret) return NextResponse.json({ ok: true, submissions: [] as Submission[] });

  try {
    const res = await fetch(
      `${url}?secret=${encodeURIComponent(secret)}&action=list&broker=${encodeURIComponent(email)}`,
      { redirect: "follow", cache: "no-store" }
    );
    const text = await res.text();
    let data: { submissions?: Submission[] };
    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json({ ok: true, submissions: [] as Submission[] });
    }
    return NextResponse.json({ ok: true, submissions: data.submissions ?? [] });
  } catch {
    return NextResponse.json({ ok: true, submissions: [] as Submission[] });
  }
}
