/**
 * The marketing queue, reachable by a scheduled task over HTTP.
 *
 * TOKEN-GUARDED, NOT STAFF-GUARDED, and that difference is the whole reason
 * this file exists separately from `requests.server.ts`. A scheduled Claude
 * task has no browser and no Clerk session, so `assertCrmStaff()` can never
 * pass for it. Rather than weaken that function — which guards the borrower
 * book — this module has its own narrower guard and its own narrower reach.
 *
 * WHAT IT CAN TOUCH: `content_requests`, and nothing else. Blog topics, their
 * status, and — since 24 Sep 2026 — the MDX of a finished blog draft, so the
 * daily task no longer needs Luis's laptop awake to deliver it. If a future
 * edit here reads an application, a contact or a broker, that edit is wrong —
 * move it to a staff-guarded module instead.
 *
 * Every export asserts the token itself. `lib/crm/guards.regress.ts` fails the
 * build if one stops.
 */

import "server-only";
import { headers } from "next/headers";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { bearerFrom, checkToken } from "./token";
import { canTransition, type ContentChannel, type ContentStatus } from "./requests";
import { parseDraftPath, validateDraftBody } from "./draft";

type Row = Record<string, unknown>;
const rowsOf = (r: unknown): Row[] => (r as { rows?: Row[] }).rows ?? (r as Row[]);
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const iso = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

export class QueueApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/**
 * The guard. Reads the header itself rather than trusting a caller to pass it.
 *
 * `proxy.ts` does NOT put /api behind Clerk, so this is the only thing between
 * the internet and this data. That is why it reads its own input: a function
 * that takes "the token the route already checked" is a function that can be
 * called with anything.
 */
async function assertQueueToken(): Promise<void> {
  const provided = bearerFrom((await headers()).get("authorization"));
  const verdict = checkToken(provided, process.env.CONTENT_QUEUE_TOKEN);
  if (!verdict.ok) throw new QueueApiError(verdict.status, verdict.reason);
}

export interface ApiQueueItem {
  id: string;
  channel: ContentChannel;
  topic: string;
  notes: string | null;
  status: ContentStatus;
  requestedAt: string | null;
  claimedAt: string | null;
}

/** Everything still waiting, oldest first. */
export async function apiListQueue(): Promise<ApiQueueItem[]> {
  await assertQueueToken();

  const result = await db.execute(sql`
    SELECT id, channel::text AS channel, topic, notes, status::text AS status,
           requested_at, claimed_at
    FROM content_requests
    WHERE status IN ('requested', 'in_progress')
    ORDER BY requested_at ASC
  `);

  return rowsOf(result).map((r): ApiQueueItem => ({
    id: String(r.id),
    channel: String(r.channel) as ContentChannel,
    topic: String(r.topic ?? ""),
    notes: str(r.notes),
    status: String(r.status) as ContentStatus,
    requestedAt: iso(r.requested_at),
    claimedAt: iso(r.claimed_at),
  }));
}

export interface ApiUpdate {
  id: string;
  status: ContentStatus;
  draftUrl?: string | null;
  draftSummary?: string | null;
  /**
   * The full MDX of a blog draft. Optional, because older task runs and the
   * LinkedIn and email channels mark things drafted without one.
   */
  draftBody?: string | null;
  error?: string | null;
  by?: string | null;
}

/**
 * Move one request along.
 *
 * RE-READS AND RE-CHECKS, like every other write in this codebase. The caller
 * is a task that read the queue some minutes ago; by now Luis may have
 * cancelled the request from the screen. Deciding from what the caller last saw
 * is how a cancelled topic gets marked published.
 *
 * The UPDATE also carries its own `status = <from>` condition, so two runs
 * arriving together cannot both succeed.
 */
export async function apiUpdateRequest(update: ApiUpdate): Promise<{ from: ContentStatus; to: ContentStatus }> {
  await assertQueueToken();

  const current = await db.execute(sql`
    SELECT status::text AS status, channel::text AS channel
    FROM content_requests WHERE id = ${update.id}
  `);
  const existing = rowsOf(current)[0];
  if (!existing) throw new QueueApiError(404, "No request with that id.");

  const from = String(existing.status) as ContentStatus;
  const to = update.status;

  /*
   * A draft body is checked BEFORE anything else is decided, including the
   * "nothing to do" shortcut below. The daily task only posts to LinkedIn when
   * this call says ok — so an ok must never be returned for a body that would
   * have been refused. The path matters most: it is later written to Luis's
   * disk by pull-drafts.mjs, and a bad one refused here never reaches it.
   */
  let draftBody: string | null = null;
  if (update.draftBody !== undefined && update.draftBody !== null) {
    if (to !== "drafted") {
      throw new QueueApiError(400, "A draft body can only be sent when marking a request drafted.");
    }
    if (String(existing.channel) !== "blog") {
      throw new QueueApiError(400, "Only a blog request carries a draft body.");
    }
    const path = parseDraftPath(update.draftUrl);
    if (!path.ok) throw new QueueApiError(400, path.error);
    const body = validateDraftBody(update.draftBody);
    if (!body.ok) throw new QueueApiError(400, body.error);
    draftBody = body.value.body;
  }

  if (from === to) return { from, to };

  if (!canTransition(from, to)) {
    throw new QueueApiError(409, `A request that is "${from}" cannot become "${to}".`);
  }

  // A draft nobody can open is not a draft.
  if (to === "drafted" && !(update.draftUrl ?? "").trim()) {
    throw new QueueApiError(400, "Marking a request drafted requires draftUrl.");
  }
  // A failure nobody can act on is not a report.
  if (to === "failed" && !(update.error ?? "").trim()) {
    throw new QueueApiError(400, "Marking a request failed requires error.");
  }

  const now = new Date().toISOString();
  const by = (update.by ?? "scheduled-task").slice(0, 120);

  const result = await db.execute(sql`
    UPDATE content_requests
    SET status = ${to}::content_status,
        updated_at = ${now},
        claimed_at    = CASE WHEN ${to} = 'in_progress' THEN ${now}::timestamptz ELSE claimed_at END,
        claimed_by    = CASE WHEN ${to} = 'in_progress' THEN ${by} ELSE claimed_by END,
        drafted_at    = CASE WHEN ${to} = 'drafted' THEN ${now}::timestamptz ELSE drafted_at END,
        draft_url     = CASE WHEN ${to} = 'drafted' THEN ${update.draftUrl ?? null} ELSE draft_url END,
        draft_summary = CASE WHEN ${to} = 'drafted' THEN ${update.draftSummary ?? null} ELSE draft_summary END,
        draft_body    = CASE WHEN ${to} = 'drafted' THEN ${draftBody}::text ELSE draft_body END,
        published_at  = CASE WHEN ${to} = 'published' THEN ${now}::timestamptz ELSE published_at END,
        error         = CASE WHEN ${to} = 'failed' THEN ${update.error ?? null} ELSE NULL END
    WHERE id = ${update.id} AND status = ${from}::content_status
    RETURNING id
  `);

  if (!rowsOf(result).length) {
    throw new QueueApiError(409, "That request changed while you were working on it. Read the queue again.");
  }
  return { from, to };
}

export interface ApiDraft {
  id: string;
  topic: string;
  draftUrl: string;
  draftBody: string;
  draftedAt: string | null;
}

/** How many drafts one pull returns. Far more than a daily cadence produces. */
export const DRAFTS_LIMIT = 50;

/**
 * Finished blog drafts, with their MDX, for `scripts/pull-drafts.mjs`.
 *
 * `drafted` and blog only: a published or cancelled request is not something
 * to write to disk, and LinkedIn and email drafts have no body. Every column is
 * named rather than `*`, so a column added to this table later does not start
 * leaving the building on its own.
 *
 * Newest first and bounded. A draft that is already live is harmless here —
 * the script never overwrites a file that exists — but the list should not
 * grow without end while nobody marks them published.
 */
export async function apiListDrafts(): Promise<ApiDraft[]> {
  await assertQueueToken();

  const result = await db.execute(sql`
    SELECT id, topic, draft_url, draft_body, drafted_at
    FROM content_requests
    WHERE status = 'drafted'
      AND channel = 'blog'
      AND draft_body IS NOT NULL
      AND draft_url IS NOT NULL
    ORDER BY drafted_at DESC NULLS LAST
    LIMIT ${DRAFTS_LIMIT}
  `);

  return rowsOf(result).map((r): ApiDraft => ({
    id: String(r.id),
    topic: String(r.topic ?? ""),
    draftUrl: String(r.draft_url),
    draftBody: String(r.draft_body),
    draftedAt: iso(r.drafted_at),
  }));
}
