import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { activities, contacts } from "@/lib/db/schema";
import {
  classifyMessage, isRejected, planActivityRows,
  type RawMessage, type ClassifiedMessage,
} from "@/lib/crm/activity";

/**
 * Gmail activity ingest.
 *
 * `GmailSync.gs` runs inside the same Apps Script project that already owns the
 * lead pipeline, on a timed trigger, under Luis's own Google account — which is
 * why this needs no new OAuth client and no stored refresh token. It reads
 * message headers, posts them here in batches, and this route decides nothing
 * about mail: lib/crm/activity.ts does all of that, and is fully tested.
 *
 * The route's only jobs are to authenticate the caller, match addresses to
 * contacts, and write rows that cannot duplicate.
 *
 * AT-LEAST-ONCE BY DESIGN. The Apps Script may resend a batch after a timeout
 * or a re-run, and the backfill deliberately overlaps its windows. Every row
 * carries `gmail:<messageId>:<counterparty>` as its dedup key against the
 * unique index on `activities.dedup_key`, so a resend collides and is dropped
 * rather than doubling someone's contact history.
 */

/** One Apps Script call is bounded; a runaway batch must not become a big write. */
const MAX_MESSAGES = 500;

/** Postgres parameter limits make one enormous INSERT a bad idea. */
const CHUNK = 100;

function secretMatches(provided: unknown): boolean {
  const expected = process.env.CRM_SYNC_SECRET;
  // Fails closed. An unset secret means the endpoint accepts nothing at all,
  // never everything — the same rule as the CRM staff allowlist.
  if (!expected || expected.length < 16) return false;
  if (typeof provided !== "string" || provided.length === 0) return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, which would itself leak the
  // length. Compare padded buffers and fold the real check in afterwards.
  const len = Math.max(a.length, b.length);
  const pa = Buffer.alloc(len), pb = Buffer.alloc(len);
  a.copy(pa); b.copy(pb);
  return timingSafeEqual(pa, pb) && a.length === b.length;
}

interface Body {
  secret?: unknown;
  selfAddresses?: unknown;
  messages?: unknown;
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  if (!secretMatches(body.secret)) {
    // Deliberately uninformative. A caller with the wrong secret learns
    // nothing about whether the endpoint or the secret is the problem.
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const selfAddresses = Array.isArray(body.selfAddresses)
    ? body.selfAddresses.filter((a): a is string => typeof a === "string")
    : [];
  if (selfAddresses.length === 0) {
    return NextResponse.json(
      { ok: false, error: "selfAddresses is required — without it, direction cannot be determined" },
      { status: 400 },
    );
  }

  const raw = Array.isArray(body.messages) ? (body.messages as RawMessage[]) : null;
  if (!raw) return NextResponse.json({ ok: false, error: "messages must be an array" }, { status: 400 });
  if (raw.length > MAX_MESSAGES) {
    return NextResponse.json(
      { ok: false, error: `batch too large: ${raw.length} > ${MAX_MESSAGES}` },
      { status: 413 },
    );
  }

  /* -- 1. classify, with no database involved -- */
  const classified: ClassifiedMessage[] = [];
  const skipped: Record<string, number> = {};
  for (const m of raw) {
    const c = classifyMessage(m, { selfAddresses });
    if (isRejected(c)) {
      skipped[c.reason] = (skipped[c.reason] ?? 0) + 1;
      continue;
    }
    classified.push(c);
  }

  if (classified.length === 0) {
    return NextResponse.json({ ok: true, received: raw.length, inserted: 0, matched: 0, skipped });
  }

  /* -- 2. resolve addresses to contacts in ONE query -- */
  const addresses = [...new Set(classified.flatMap((c) => c.counterparties))];
  const found = await db
    .select({ id: contacts.id, email: contacts.email })
    .from(contacts)
    .where(inArray(sql`lower(${contacts.email})`, addresses));

  const contactIdByEmail = new Map<string, string>();
  for (const c of found) {
    if (c.email) contactIdByEmail.set(c.email.toLowerCase(), c.id);
  }

  /* -- 3. plan and write -- */
  const { rows, unmatched } = planActivityRows(classified, contactIdByEmail);

  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const written = await db
      .insert(activities)
      .values(chunk.map((r) => ({
        contactId: r.contactId,
        // Never guessed — see planActivityRows.
        applicationId: null,
        kind: r.kind,
        occurredAt: r.occurredAt,
        source: "gmail",
        subject: r.subject,
        // No body. Ever.
        body: null,
        metadata: r.metadata,
        dedupKey: r.dedupKey,
      })))
      .onConflictDoNothing({ target: activities.dedupKey })
      .returning({ id: activities.id });
    inserted += written.length;
  }

  return NextResponse.json({
    ok: true,
    received: raw.length,
    classified: classified.length,
    planned: rows.length,
    inserted,
    duplicates: rows.length - inserted,
    // Addresses we corresponded with who are not in the CRM. Useful on its own:
    // this is how a lead that never reached the book shows up.
    unmatchedCount: unmatched.length,
    unmatchedSample: unmatched.slice(0, 20),
    skipped,
  });
}
