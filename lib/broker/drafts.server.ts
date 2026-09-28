/**
 * A broker's OWN saved applications: save as they type, pick up later,
 * discard, and close on submit.
 *
 * BROKER-REACHABLE, so it asserts nothing about staff (an `assertCrmStaff()`
 * here would throw for every broker) and may not import the staff modules —
 * guards.regress.ts §5 checks both. What it asserts instead is OWNERSHIP:
 *
 *   - `draftOwner()` runs first in every export. The owner is the Clerk user
 *     of this request — never an id from the browser — and must be staff or an
 *     ACTIVE broker (a suspended broker cannot save).
 *   - Every statement that touches `application_drafts` carries
 *     `clerk_user_id = ${me.userId}` (guard §15). A draft id alone opens
 *     nothing: someone else's id simply matches no row.
 *   - Firm colleagues do not see each other's drafts. Luis sees them only
 *     through the staff-only list in admin.server.ts.
 *
 * WIPED WHEN CLOSED. Submit, discard, or 90 days untouched sets `data` to {}
 * so the borrower's details do not sit in an abandoned draft.
 */

import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { isCrmStaff } from "@/lib/crm/access";
import { resolveBrokerViewer } from "./viewer";
import {
  DRAFT_TTL_DAYS, MAX_OPEN_DRAFTS, draftHasContent, draftLabel, isDraftId, parseDraft, type DraftData, type MyDraft,
} from "./drafts";

type Row = Record<string, unknown>;
const rowsOf = (r: unknown): Row[] => (r as { rows?: Row[] }).rows ?? (r as Row[]);
const iso = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

type Owner = { userId: string; email: string | null; name: string | null };

/** Who may keep drafts: staff, or an active broker. The id comes from the session only. */
async function draftOwner(): Promise<Owner | null> {
  const { userId } = await auth();
  if (!userId) return null;
  if (!(await isCrmStaff())) {
    const viewer = await resolveBrokerViewer();
    if (!viewer || viewer.userId !== userId || viewer.status !== "active") return null;
  }
  let email: string | null = null;
  let name: string | null = null;
  try {
    const u = await currentUser();
    email = u?.primaryEmailAddress?.emailAddress?.toLowerCase() ?? null;
    name = u?.fullName || [u?.firstName, u?.lastName].filter(Boolean).join(" ") || null;
  } catch {
    // A name is a nicety for the staff list; the draft saves without it.
  }
  return { userId, email, name };
}

export type SaveResult = { ok: true; id: string; savedAt: string } | { ok: false; error: string; gone?: boolean };

/**
 * Create (id null) or update this person's draft. An update to an id that is
 * not theirs, or no longer open, changes nothing and says so (`gone`), and the
 * form starts a new draft on the next keystroke rather than writing into
 * someone else's.
 */
export async function saveMyDraft(id: string | null, raw: unknown): Promise<SaveResult> {
  const me = await draftOwner();
  if (!me) return { ok: false, error: "Sign in again to keep saving." };
  const parsed = parseDraft(raw);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const d = parsed.value;
  if (!draftHasContent(d)) return { ok: false, error: "Nothing to save yet." };
  const data = JSON.stringify(d);
  const label = draftLabel(d);

  if (id !== null) {
    if (!isDraftId(id)) return { ok: false, error: "That draft could not be found.", gone: true };
    const r = rowsOf(await db.execute(sql`
      UPDATE application_drafts
      SET data = ${data}::jsonb, label = ${label}, step = ${d.step}, updated_at = now(),
          broker_email = COALESCE(${me.email}, broker_email), broker_name = COALESCE(${me.name}, broker_name)
      WHERE id = ${id}::uuid AND clerk_user_id = ${me.userId} AND status = 'open'
      RETURNING id, updated_at
    `));
    if (r.length === 0) return { ok: false, error: "That draft was closed. Keep typing and a new one starts.", gone: true };
    return { ok: true, id: String(r[0].id), savedAt: iso(r[0].updated_at) ?? new Date().toISOString() };
  }

  const [, , inserted] = await db.batch([
    // Housekeeping for this person only: expire and wipe their own untouched drafts…
    db.execute(sql`
      UPDATE application_drafts SET status = 'expired', data = '{}'::jsonb, closed_at = now(), updated_at = now()
      WHERE clerk_user_id = ${me.userId} AND status = 'open'
        AND updated_at < now() - make_interval(days => ${DRAFT_TTL_DAYS})
    `),
    // …and keep at most MAX_OPEN_DRAFTS - 1 open before adding this one.
    db.execute(sql`
      UPDATE application_drafts SET status = 'expired', data = '{}'::jsonb, closed_at = now(), updated_at = now()
      WHERE clerk_user_id = ${me.userId} AND status = 'open' AND id IN (
        SELECT id FROM application_drafts
        WHERE clerk_user_id = ${me.userId} AND status = 'open'
        ORDER BY updated_at DESC
        OFFSET ${MAX_OPEN_DRAFTS - 1}
      )
    `),
    db.execute(sql`
      INSERT INTO application_drafts (clerk_user_id, broker_email, broker_name, data, label, step)
      VALUES (${me.userId}, ${me.email}, ${me.name}, ${data}::jsonb, ${label}, ${d.step})
      RETURNING id, updated_at
    `),
  ] as unknown as Parameters<typeof db.batch>[0]);
  const row = rowsOf(inserted)[0];
  return { ok: true, id: String(row.id), savedAt: iso(row.updated_at) ?? new Date().toISOString() };
}

export type LoadedDraft = { id: string; data: DraftData; savedAt: string | null };

/** One of this person's open drafts, re-validated on the way out. */
export async function loadMyDraft(id: string): Promise<LoadedDraft | null> {
  const me = await draftOwner();
  if (!me || !isDraftId(id)) return null;
  const r = rowsOf(await db.execute(sql`
    SELECT id, data, updated_at FROM application_drafts
    WHERE id = ${id}::uuid AND clerk_user_id = ${me.userId} AND status = 'open'
      AND updated_at >= now() - make_interval(days => ${DRAFT_TTL_DAYS})
  `))[0];
  if (!r) return null;
  let raw: unknown = r.data;
  if (typeof raw === "string") { try { raw = JSON.parse(raw); } catch { raw = null; } }
  const parsed = parseDraft(raw);
  return parsed.ok ? { id: String(r.id), data: parsed.value, savedAt: iso(r.updated_at) } : null;
}

export type { MyDraft };

/** This person's open drafts, newest first. */
export async function listMyDrafts(): Promise<MyDraft[]> {
  const me = await draftOwner();
  if (!me) return [];
  const rows = rowsOf(await db.execute(sql`
    SELECT id, label, step, updated_at FROM application_drafts
    WHERE clerk_user_id = ${me.userId} AND status = 'open'
      AND updated_at >= now() - make_interval(days => ${DRAFT_TTL_DAYS})
    ORDER BY updated_at DESC
    LIMIT ${MAX_OPEN_DRAFTS}
  `));
  return rows.map((r) => ({ id: String(r.id), label: String(r.label ?? "Unfinished application"), step: Number(r.step ?? 1), savedAt: iso(r.updated_at) }));
}

/** Throw a draft away. Its contents are wiped at once. */
export async function discardMyDraft(id: string): Promise<boolean> {
  const me = await draftOwner();
  if (!me || !isDraftId(id)) return false;
  const r = rowsOf(await db.execute(sql`
    UPDATE application_drafts SET status = 'discarded', data = '{}'::jsonb, closed_at = now(), updated_at = now()
    WHERE id = ${id}::uuid AND clerk_user_id = ${me.userId} AND status = 'open'
    RETURNING id
  `));
  return r.length > 0;
}

/**
 * The application was submitted: close the draft and wipe its copy of the
 * borrower's details (the real submission now lives in the pipeline and
 * Drive). Called by /api/submit-application after Drive accepted it.
 */
export async function markMyDraftSubmitted(id: unknown): Promise<void> {
  const me = await draftOwner();
  if (!me || !isDraftId(id)) return;
  await db.execute(sql`
    UPDATE application_drafts SET status = 'submitted', data = '{}'::jsonb, closed_at = now(), updated_at = now()
    WHERE id = ${id}::uuid AND clerk_user_id = ${me.userId} AND status = 'open'
  `);
}
