/**
 * Reading and writing marketing requests. STAFF ONLY.
 *
 * Every function asserts staff itself, like admin.server.ts and invites.server.ts
 * and for the same reason: "the caller already checked" is not an assumption
 * this file makes. `lib/crm/guards.regress.ts` enforces it.
 *
 * NOTHING HERE CALLS A MODEL. This module records what Luis asked for and what
 * came back. The writing happens in a scheduled Claude task, using the brand
 * voice and research skills that already exist — one definition of the voice
 * rather than two, and no API key in the web app.
 */

import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { contentRequests } from "@/lib/db/schema";
import { assertCrmStaff } from "@/lib/crm/access";
import {
  canTransition,
  validateRequest,
  type ContentChannel,
  type ContentStatus,
} from "./requests";
import { parseCarouselSpec, type CarouselSpec } from "./carousel";

type Row = Record<string, unknown>;
const rowsOf = (r: unknown): Row[] => (r as { rows?: Row[] }).rows ?? (r as Row[]);
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const iso = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

export type Result<T = null> = { ok: true; value: T } | { ok: false; error: string };

export interface RequestRow {
  id: string;
  channel: ContentChannel;
  topic: string;
  notes: string | null;
  status: ContentStatus;
  requestedBy: string | null;
  requestedAt: string | null;
  claimedAt: string | null;
  draftedAt: string | null;
  draftUrl: string | null;
  draftSummary: string | null;
  /**
   * The MDX of a blog draft still waiting to go live, so it can be read on the
   * page. Null for every other row — see listRequests.
   */
  draftBody: string | null;
  /** True when a LinkedIn carousel is attached; the slides are drawn on request. */
  hasCarousel: boolean;
  publishedAt: string | null;
  publishedUrl: string | null;
  error: string | null;
}

/**
 * Newest first. Bounded, because this list only ever needs to be scannable.
 *
 * THE DRAFT BODY IS FETCHED ONLY WHERE IT CAN BE SHOWN. A post is 9-20 KB; a
 * hundred of them is two megabytes read from Neon on every page load for text
 * nobody is looking at. Only a drafted blog row can be opened on the page, so
 * every other row gets NULL from the database rather than being trimmed after.
 */
export async function listRequests(limit = 100): Promise<RequestRow[]> {
  await assertCrmStaff();

  const rows = await db
    .select({
      id: contentRequests.id,
      channel: contentRequests.channel,
      topic: contentRequests.topic,
      notes: contentRequests.notes,
      status: contentRequests.status,
      requestedBy: contentRequests.requestedBy,
      requestedAt: contentRequests.requestedAt,
      claimedAt: contentRequests.claimedAt,
      draftedAt: contentRequests.draftedAt,
      draftUrl: contentRequests.draftUrl,
      draftSummary: contentRequests.draftSummary,
      draftBody: sql<string | null>`CASE WHEN ${contentRequests.status} = 'drafted' AND ${contentRequests.channel} = 'blog' THEN ${contentRequests.draftBody} END`,
      // A yes/no, not the spec: the page links to the slides, it does not draw them.
      hasCarousel: sql<boolean>`(${contentRequests.carouselSpec} IS NOT NULL)`,
      publishedAt: contentRequests.publishedAt,
      publishedUrl: contentRequests.publishedUrl,
      error: contentRequests.error,
    })
    .from(contentRequests)
    .orderBy(desc(contentRequests.requestedAt))
    .limit(limit);

  return rows.map((r): RequestRow => ({
    id: r.id,
    channel: r.channel as ContentChannel,
    topic: r.topic,
    notes: r.notes,
    status: r.status as ContentStatus,
    requestedBy: r.requestedBy,
    requestedAt: iso(r.requestedAt),
    claimedAt: iso(r.claimedAt),
    draftedAt: iso(r.draftedAt),
    draftUrl: r.draftUrl,
    draftSummary: r.draftSummary,
    draftBody: r.draftBody ?? null,
    hasCarousel: r.hasCarousel === true,
    publishedAt: iso(r.publishedAt),
    publishedUrl: r.publishedUrl,
    error: r.error,
  }));
}

/**
 * Newest publication per channel, from what this portal has recorded.
 *
 * The blog's real history lives in the MDX files, not here — the page reads
 * that separately and labels the two differently, because a date from this
 * table only knows about posts the portal was told about.
 */
export async function lastPublishedByChannel(): Promise<Record<string, string | null>> {
  await assertCrmStaff();

  const result = await db.execute(sql`
    SELECT channel::text AS channel, max(published_at) AS last_published
    FROM content_requests
    WHERE published_at IS NOT NULL
    GROUP BY channel
  `);

  const out: Record<string, string | null> = {};
  for (const r of rowsOf(result)) {
    const channel = str(r.channel);
    if (channel) out[channel] = iso(r.last_published);
  }
  return out;
}

export async function createRequest(
  rawChannel: string,
  rawTopic: string,
  rawNotes: string | null,
  staffUserId: string,
): Promise<Result<string>> {
  await assertCrmStaff();

  const draft = validateRequest(rawChannel, rawTopic, rawNotes);
  if (!draft.ok) return { ok: false, error: draft.error };

  const id = crypto.randomUUID();
  await db.insert(contentRequests).values({
    id,
    channel: draft.value.channel,
    topic: draft.value.topic,
    notes: draft.value.notes,
    requestedBy: staffUserId,
  });

  return { ok: true, value: id };
}

/**
 * Move a request along.
 *
 * RE-READS THE ROW AND RE-CHECKS THE MOVE. The screen's buttons are built from
 * a status that was true when the page rendered; by the time a click arrives a
 * scheduled task may have moved it. Deciding from what the screen showed is how
 * a published post gets marked "cancelled" ten minutes after it went live.
 *
 * The UPDATE also carries its own `status = <from>` condition, so two clicks
 * arriving together cannot both succeed — the same belt-and-braces `claimDeal`
 * uses.
 */
export async function setRequestStatus(
  id: string,
  to: ContentStatus,
  patch: { publishedUrl?: string | null } = {},
): Promise<Result> {
  await assertCrmStaff();

  const existing = await db
    .select({ status: contentRequests.status })
    .from(contentRequests)
    .where(eq(contentRequests.id, id))
    .limit(1);

  if (!existing.length) return { ok: false, error: "That request no longer exists." };

  const from = existing[0].status as ContentStatus;
  if (from === to) return { ok: true, value: null };
  if (!canTransition(from, to)) {
    return { ok: false, error: `A request that is "${from}" cannot become "${to}".` };
  }

  const now = new Date();
  const updated = await db
    .update(contentRequests)
    .set({
      status: to,
      updatedAt: now,
      ...(to === "published" ? { publishedAt: now, publishedUrl: patch.publishedUrl ?? null } : {}),
      // Retrying clears the previous failure so the row stops reporting an
      // error it is no longer in.
      ...(to === "requested" ? { error: null, claimedAt: null, claimedBy: null } : {}),
    })
    .where(and(eq(contentRequests.id, id), eq(contentRequests.status, from)))
    .returning({ id: contentRequests.id });

  if (!updated.length) {
    return { ok: false, error: "Someone or something changed that request while you were looking at it. Reload and try again." };
  }
  return { ok: true, value: null };
}

/**
 * A stored carousel, for Luis to preview and download from /crm/marketing.
 * Staff-only like everything in this file; the scheduled task reads the same
 * data through the token-guarded apiGetCarousel instead.
 */
export async function getCarouselForStaff(id: string): Promise<{ spec: CarouselSpec; topic: string } | { error: string } | null> {
  await assertCrmStaff();

  const rows = await db
    .select({ spec: contentRequests.carouselSpec, topic: contentRequests.topic })
    .from(contentRequests)
    .where(eq(contentRequests.id, id))
    .limit(1);
  const row = rows[0];
  if (!row || row.spec === null || row.spec === undefined) return null;
  const parsed = parseCarouselSpec(row.spec);
  if (!parsed.ok) return { error: parsed.error };
  return { spec: parsed.value, topic: row.topic };
}
