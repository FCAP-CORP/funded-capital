import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { isCrmStaff } from "@/lib/crm/access";
import { mergeResults, parseSearchQuery } from "@/lib/crm/search";
import { contactSearchSql, dealSearchSql } from "@/lib/crm/searchSql";

/**
 * GET /api/crm/search?q=… — the ⌘K palette's borrower / contact / deal search.
 *
 * STAFF ONLY, AND IT CHECKS FOR ITSELF, FIRST. `proxy.ts` matches /api but
 * does not guard it, so Clerk lets every request through to this handler — a
 * signed-out visitor, a broker, anyone. The staff check below is the only thing
 * between them and every borrower's name, email and phone number, so it runs
 * before the query string is even read, and a non-staff caller gets the same
 * bare 404 as any other /crm surface: the route does not advertise itself.
 * lib/crm/guards.ui.regress.ts fails the build if the check moves below the
 * first database access, or disappears.
 *
 * The palette never calls this for a broker (the shell only mounts the search
 * half for staff) — but that is a courtesy, not the control. This is.
 *
 * BOUNDED: at most 20 results (SEARCH_LIMIT, in both statements and again in
 * mergeResults), a 2–80 character query, both reads in ONE round trip via
 * db.batch. Responses are private and never cached.
 */

const NOT_FOUND = () => new NextResponse(null, { status: 404 });
const HEADERS = { "cache-control": "private, no-store" };

type Row = Record<string, unknown>;
const rowsOf = (r: unknown): Row[] => (r as { rows?: Row[] }).rows ?? (r as Row[]);

export async function GET(request: NextRequest) {
  if (!(await isCrmStaff())) return NOT_FOUND();

  const q = parseSearchQuery(request.nextUrl.searchParams.get("q"));
  if (!q.ok) return NextResponse.json({ results: [] }, { headers: HEADERS });

  try {
    const [deals, people] = await db.batch([db.execute(dealSearchSql(q)), db.execute(contactSearchSql(q))]);
    return NextResponse.json({ results: mergeResults(rowsOf(deals), rowsOf(people)) }, { headers: HEADERS });
  } catch (err) {
    console.error("[api/crm/search] query failed", err instanceof Error ? err.message : err);
    return NextResponse.json({ results: [], error: "Search is unavailable right now." }, { status: 500, headers: HEADERS });
  }
}
