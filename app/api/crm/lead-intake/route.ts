import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import {
  MAX_BP_LEADS_PER_REQUEST, validateBpItem, type BpIntakeItem,
} from "@/lib/leads/biggerpockets";
import { ingestBpLeads, summarise, type BpResult } from "@/lib/leads/biggerpockets.server";

/**
 * BiggerPockets lead intake.
 *
 * The BiggerPockets Apps Script (every-minute trigger, runs as Luis) parses
 * each "New lead from BiggerPockets!" email, writes the Google Sheet row,
 * sends the acknowledgement, creates the Quo contact and alerts Luis — and
 * then posts the parsed lead here, so it lands in /crm the same minute. The
 * same endpoint takes the one-off backfill of every lead since the 14 Sep
 * migration, 25 at a time. See apps-script/BiggerPocketsToLendingOS.gs.
 *
 *   POST { secret, source: "biggerpockets", via?: "live"|"backfill",
 *          leads: [ { ...parseBpLead_() fields, gmailMessageId, receivedAt } ] }
 *   ->   { ok, results: [ { gmailMessageId, status: "created"|"duplicate"|"error",
 *                           applicationId?, contactId?, note?, error? } ],
 *          created, duplicate, error }
 *
 * `ok` is true when no lead errored. A per-lead error is still HTTP 200 —
 * the other leads in the batch were written, and the Apps Script needs the
 * per-lead detail, not a status code.
 *
 * AUTHENTICATED EXACTLY LIKE /api/crm/activity: the shared CRM_SYNC_SECRET in
 * the body, compared in constant time, failing CLOSED when the variable is
 * unset or shorter than 16 characters. It is the same secret the Gmail
 * activity sync already holds in the same Apps Script project — no new
 * credential to create, store or rotate. `proxy.ts` does not guard /api, so
 * this check is the only thing between the internet and the contacts table;
 * lib/crm/guards.regress.ts §10 fails the build if it stops running before
 * the first database access.
 *
 * The body is size-capped BEFORE it is parsed or the secret is checked (the
 * content-queue route's reader), so an unauthenticated caller cannot make this
 * function buffer an arbitrary amount of memory.
 *
 * PERFORMANCE: a route handler is dynamic by nature; nothing here touches the
 * `cacheComponents` rules. Four reads per request plus one transaction per lead.
 */

/** 50 leads with every field at its cap is ~1.3 MB; an honest request is ~2 KB per lead. */
const MAX_REQUEST_BYTES = 512 * 1024;

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

type Read = { ok: true; value: unknown } | { ok: false; status: 400 | 413; error: string };

const TOO_LARGE = `The request is too large (limit ${MAX_REQUEST_BYTES / 1024} KB). Send fewer leads per call.`;

/**
 * `request.json()` with a ceiling — the same reader as
 * app/api/crm/content-queue/route.ts. Content-Length is checked first because
 * it is free, but it is only a claim, so the stream is counted as it arrives.
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

export async function POST(request: Request) {
  const read = await readJsonCapped(request, MAX_REQUEST_BYTES);
  if (!read.ok) return NextResponse.json({ ok: false, error: read.error }, { status: read.status });
  if (!read.value || typeof read.value !== "object" || Array.isArray(read.value)) {
    return NextResponse.json({ ok: false, error: "Body must be a JSON object." }, { status: 400 });
  }
  const body = read.value as Record<string, unknown>;

  if (!secretMatches(body.secret)) {
    // Deliberately uninformative. A caller with the wrong secret learns
    // nothing about whether the endpoint or the secret is the problem.
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (body.source !== "biggerpockets") {
    return NextResponse.json({ ok: false, error: 'source must be "biggerpockets"' }, { status: 400 });
  }
  if (!Array.isArray(body.leads)) {
    return NextResponse.json({ ok: false, error: "leads must be an array" }, { status: 400 });
  }
  if (body.leads.length > MAX_BP_LEADS_PER_REQUEST) {
    return NextResponse.json(
      { ok: false, error: `batch too large: ${body.leads.length} > ${MAX_BP_LEADS_PER_REQUEST}` },
      { status: 413 },
    );
  }
  const via = body.via === "live" || body.via === "backfill" ? body.via : "unknown";

  /* -- 1. validate each lead on its own, with no database involved -- */
  const now = new Date();
  const results: (BpResult | null)[] = [];
  const valid: { at: number; item: BpIntakeItem }[] = [];
  body.leads.forEach((raw, at) => {
    const v = validateBpItem(raw, now);
    if (v.ok) {
      valid.push({ at, item: v.item });
      results.push(null);
    } else {
      // A malformed lead is reported, never silently dropped — and it does not
      // stop the rest of the batch. The sheet row still holds it.
      results.push({ gmailMessageId: v.gmailMessageId, status: "error", error: v.error });
    }
  });

  /* -- 2. write (one transaction per lead, never throws) -- */
  if (valid.length) {
    const written = await ingestBpLeads(db, valid.map((v) => v.item), via);
    valid.forEach((v, i) => { results[v.at] = written[i]; });
  }

  const final = results as BpResult[];
  const counts = summarise(final);
  return NextResponse.json({ ok: counts.error === 0, results: final, ...counts });
}
