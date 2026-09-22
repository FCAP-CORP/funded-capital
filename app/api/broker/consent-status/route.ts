import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { BROKER_SMS_CONSENT_TEXT, CONSENT_VERSION } from "@/lib/consent";

/**
 * Has this broker already agreed to be contacted, and in which wording?
 *
 * The apply form asks for consent ONCE. Without this, it would either nag a
 * broker on every submission or quietly stop asking anyone — so the form needs
 * to know, and only the server can answer.
 *
 * The consent TEXT is served from here rather than hard-coded in the form, for
 * the same reason lib/consent.ts exists at all: the words shown and the words
 * stored must never drift.
 *
 * Degrades to "already consented" on failure. That is the conservative default:
 * showing a checkbox we cannot record is worse than not showing one, because a
 * broker would believe they had opted in when nothing was stored.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, consented: true }, { status: 401 });
  }

  try {
    const url = process.env.DATABASE_URL;
    if (!url) return NextResponse.json({ ok: true, consented: true });

    const db = drizzle(neon(url), { schema });
    const rows = await db
      .select({ at: schema.brokerUsers.smsConsentAt, version: schema.brokerUsers.smsConsentVersion })
      .from(schema.brokerUsers)
      .where(eq(schema.brokerUsers.clerkUserId, userId))
      .limit(1);

    // Consent to the CURRENT wording. A broker who agreed to superseded language
    // is asked again, which is what makes bumping CONSENT_VERSION meaningful.
    const consented = Boolean(rows.length && rows[0].at && rows[0].version === CONSENT_VERSION);

    return NextResponse.json({
      ok: true,
      consented,
      text: consented ? null : BROKER_SMS_CONSENT_TEXT,
      version: CONSENT_VERSION,
    });
  } catch (err) {
    console.error("[broker/consent-status] lookup failed:", err);
    return NextResponse.json({ ok: true, consented: true });
  }
}
