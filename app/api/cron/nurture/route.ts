import { NextResponse } from "next/server";
import { bearerFrom, tokenOk } from "@/lib/marketing/token";
import { runNurtureSync } from "@/lib/nurture/sync.server";

/**
 * Lead nurturing sync, run by Vercel Cron every 15 minutes (vercel.json).
 *
 * Why a cron and not an event: two of its three jobs have no event to hang on.
 * Klaviyo does not call us when someone unsubscribes (we read it back), and a
 * failed Klaviyo call needs retrying later. The third — stopping someone who
 * wrote back — could be event-driven, but replies reach Lending OS through the
 * Gmail sync on its own schedule anyway, so 15 minutes adds little, and the
 * flows are spaced days apart. See lib/nurture/sync.server.ts.
 *
 * CRON_SECRET is checked before anything else, fail-closed and constant-time
 * (guards.regress.ts §14). /api is not behind Clerk, so this line is the door.
 *
 * PERFORMANCE: off every visitor's request path; one query when nobody is
 * enrolled, and a few Klaviyo calls per 100 people when they are.
 */

export const maxDuration = 300;

/** Stop starting new work this long before Vercel would stop the function. */
const BUDGET_MS = 240_000;

export async function GET(request: Request) {
  if (!tokenOk(bearerFrom(request.headers.get("authorization")), process.env.CRON_SECRET)) {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401 });
  }
  try {
    const summary = await runNurtureSync(BUDGET_MS);
    // Counts only — never an address or a key.
    console.log(
      `[cron/nurture] configured=${summary.configured} stopped=${summary.stopped} unsubscribed=${summary.unsubscribedMirrored} ` +
      `added=${summary.added} removed=${summary.removed} failed=${summary.failed} timedOut=${summary.timedOut}`,
    );
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    console.error(`[cron/nurture] failed: ${e instanceof Error ? e.message.slice(0, 200) : "unknown"}`);
    return NextResponse.json({ ok: false, error: "Nurture sync failed; it will run again in 15 minutes." }, { status: 500 });
  }
}
