import { NextResponse } from "next/server";
import {
  QueueApiError,
  apiListDrafts,
  apiListQueue,
  apiUpdateRequest,
  type ApiUpdate,
} from "@/lib/marketing/queue.api.server";
import { isContentChannel, type ContentStatus } from "@/lib/marketing/requests";
import { MAX_DRAFT_BYTES } from "@/lib/marketing/draft";

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
 * GET               → the open queue, oldest first.
 * GET ?view=drafts  → finished blog drafts WITH their MDX, for pull-drafts.mjs.
 * POST → { id, status, draftUrl?, draftSummary?, draftBody?, error?, by? }
 *
 * `draftBody` is the whole MDX of a blog draft, sent with `drafted`. It is why
 * the daily task no longer needs Luis's laptop awake: the draft lands here and
 * he pulls it down when he chooses to publish. It is validated in
 * queue.api.server.ts (path and shape) before anything is written.
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

/**
 * Largest request body this route will read.
 *
 * A draft may be up to MAX_DRAFT_BYTES of MDX, and JSON escaping can inflate
 * it — every newline and quote doubles, and a client that escapes non-ASCII
 * (Python's json.dumps does by default) turns one character into six. Twice
 * the draft plus room for the other fields covers any honest request by a wide
 * margin; anything bigger is refused before it is parsed, so a hostile caller
 * cannot make this function buffer an arbitrary amount of memory — even
 * without the token, because this check runs first.
 *
 * Not exported: a route file should export its handlers and nothing new.
 */
const MAX_REQUEST_BYTES = MAX_DRAFT_BYTES * 2 + 16_384;

type Read = { ok: true; value: unknown } | { ok: false; status: 400 | 413; error: string };

const TOO_LARGE = `The request is too large. A draft must be under ${Math.floor(MAX_DRAFT_BYTES / 1024)} KB.`;

/**
 * `request.json()` with a ceiling.
 *
 * Content-Length is checked first because it is free, but it is only a claim —
 * a chunked request has none, and a dishonest one can lie — so the stream is
 * also counted as it arrives and abandoned the moment it passes the limit.
 */
async function readJsonCapped(request: Request, limit: number): Promise<Read> {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > limit) {
    return { ok: false, status: 413, error: TOO_LARGE };
  }
  if (!request.body) return { ok: false, status: 400, error: "Body must be JSON." };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => {});
      return { ok: false, status: 413, error: TOO_LARGE };
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { ok: false, status: 400, error: "Body must be JSON." };
  }
}

export async function GET(request: Request) {
  try {
    const view = new URL(request.url).searchParams.get("view");

    if (view === "drafts") {
      const items = await apiListDrafts();
      // `view` is echoed so the pull script can tell this apart from an older
      // deployment that ignores the parameter and returns the queue instead.
      return NextResponse.json({ ok: true, view: "drafts", count: items.length, items });
    }
    if (view !== null && view !== "queue") {
      return NextResponse.json({ ok: false, error: 'view must be "queue" or "drafts".' }, { status: 400 });
    }

    const items = await apiListQueue();
    return NextResponse.json({ ok: true, count: items.length, items });
  } catch (err) {
    return problem(err);
  }
}

export async function POST(request: Request) {
  try {
    const read = await readJsonCapped(request, MAX_REQUEST_BYTES);
    if (!read.ok) return NextResponse.json({ ok: false, error: read.error }, { status: read.status });
    if (!read.value || typeof read.value !== "object" || Array.isArray(read.value)) {
      return NextResponse.json({ ok: false, error: "Body must be a JSON object." }, { status: 400 });
    }
    const body = read.value as Record<string, unknown>;

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

    /*
     * The draft body is passed through WHOLE — not trimmed, not cut at 4000
     * characters like the short fields. An empty string is passed too, so it
     * is refused as an empty draft rather than quietly treated as "no draft",
     * which would report success for a post that never arrived.
     */
    if (body.draftBody !== undefined && body.draftBody !== null && typeof body.draftBody !== "string") {
      return NextResponse.json({ ok: false, error: "draftBody must be a string." }, { status: 400 });
    }

    const update: ApiUpdate = {
      id,
      status: status as ContentStatus,
      draftUrl: optional(body.draftUrl),
      draftSummary: optional(body.draftSummary),
      draftBody: typeof body.draftBody === "string" ? body.draftBody : null,
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
