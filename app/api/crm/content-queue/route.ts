import { NextResponse } from "next/server";
import {
  QueueApiError,
  apiListQueue,
  apiUpdateRequest,
  type ApiUpdate,
} from "@/lib/marketing/queue.api.server";
import { isContentChannel, type ContentStatus } from "@/lib/marketing/requests";

/**
 * The marketing queue, for a scheduled task.
 *
 * WHY THIS EXISTS. The first design had the task pull production database
 * credentials onto Luis's laptop and query Neon directly. It never ran once:
 * the task has no shell on his machine. But the shape was wrong before it was
 * broken — production secrets copied to a workstation three times a day, to
 * read a list of blog topics.
 *
 * The portal already holds the database connection. This is the seam an outside
 * agent should talk to.
 *
 * IT GUARDS ITSELF COMPLETELY. `proxy.ts` matches /api but its guarded-route
 * list does not include it, so Clerk lets every request through to here. The
 * bearer token in `lib/marketing/token.ts` is the only thing between the
 * internet and this data, and it fails closed when CONTENT_QUEUE_TOKEN is unset
 * or shorter than 32 characters.
 *
 * SCOPE, deliberately tiny: it reads and writes `content_requests`. Blog
 * topics and their status. No borrower, no application, no contact is reachable
 * from here, and none should ever become reachable — that is what the
 * staff-guarded modules and a Clerk session are for.
 *
 * GET  → the open queue, oldest first.
 * POST → { id, status, draftUrl?, draftSummary?, error?, by? }
 *
 * PERFORMANCE: a route handler is dynamic by nature, so there is no
 * `cacheComponents` boundary to think about here — unlike every page in this
 * app. One query per call, both covered by indexes on content_requests.
 */

/** Statuses a task is allowed to set. Not `published` — a person does that. */
const TASK_STATUSES: readonly string[] = ["in_progress", "drafted", "failed"];

function problem(err: unknown) {
  if (err instanceof QueueApiError) {
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
  }
  // Never echo an internal error to an unauthenticated caller.
  console.error("[api/crm/content-queue]", err);
  return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
}

export async function GET() {
  try {
    const items = await apiListQueue();
    return NextResponse.json({ ok: true, count: items.length, items });
  } catch (err) {
    return problem(err);
  }
}

export async function POST(request: Request) {
  try {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ ok: false, error: "Body must be JSON." }, { status: 400 });
    }

    const id = typeof body.id === "string" ? body.id.trim() : "";
    const status = typeof body.status === "string" ? body.status.trim() : "";
    if (!id) return NextResponse.json({ ok: false, error: "id is required." }, { status: 400 });

    /*
     * A task may claim, draft and fail. It may NOT publish.
     *
     * Publishing is Luis pressing a button, on every channel — the blog needs
     * publish-blog.bat, LinkedIn and Klaviyo need him. An endpoint that let a
     * token mark something published would be a quiet way around the rule that
     * nothing reaches the public unattended.
     */
    if (!TASK_STATUSES.includes(status)) {
      return NextResponse.json(
        { ok: false, error: `status must be one of: ${TASK_STATUSES.join(", ")}.` },
        { status: 400 },
      );
    }

    const optional = (v: unknown): string | null =>
      typeof v === "string" && v.trim() ? v.trim().slice(0, 4000) : null;

    const update: ApiUpdate = {
      id,
      status: status as ContentStatus,
      draftUrl: optional(body.draftUrl),
      draftSummary: optional(body.draftSummary),
      error: optional(body.error),
      by: optional(body.by),
    };

    const moved = await apiUpdateRequest(update);
    return NextResponse.json({ ok: true, ...moved });
  } catch (err) {
    return problem(err);
  }
}

/** Exported for the guard suite, which asserts the task cannot publish. */
export const TASK_SETTABLE_STATUSES = TASK_STATUSES;
export { isContentChannel };
