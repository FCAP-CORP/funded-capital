import { NextResponse } from "next/server";
import { verifyQuoSignature } from "@/lib/comms/quoSignature";
import { parseQuoEvent } from "@/lib/comms/quoEvents";
import { handleQuoEvent } from "@/lib/comms/quoWebhook.server";

/**
 * Quo (formerly OpenPhone) webhooks: texts in, delivery receipts, finished calls.
 *
 * `proxy.ts` matches /api but does not guard it, so Clerk lets every request
 * through to here. THE SIGNATURE IS THE ONLY LOCK, which is why it is checked
 * before anything else — before the body is parsed as JSON and long before the
 * database is touched. guards.regress.ts §11 fails the build if that order
 * changes.
 *
 * THE ORDER, AND THE 10-SECOND BUDGET (CLAUDE.md: "verify, claim, enqueue,
 * return 200"):
 *   1. read the raw body, capped — the signature covers the exact bytes;
 *   2. verify the HMAC (lib/comms/quoSignature.ts) — 401 if it fails;
 *   3. parse — 400 for a body that is not an event;
 *   4. claim + process (lib/comms/quoWebhook.server.ts): a few single-row
 *      statements and one db.batch, well inside Quo's timeout;
 *   5. 200 — including for a number that is not in the CRM, because asking Quo
 *      to retry a stranger's text for a day achieves nothing.
 * A database error is a 500 on purpose: Quo retries, and the claim makes the
 * retry safe.
 *
 * NOTHING SENSITIVE GOES BACK. Responses say ok/duplicate and nothing about
 * contacts; failures log the event id and type only, never a body or number.
 */

const MAX_BODY_BYTES = 256 * 1024;

type Raw = { ok: true; text: string } | { ok: false; status: 400 | 413 };

/** The body as text, with a ceiling. Content-Length is only a claim, so the stream is counted too. */
async function readTextCapped(request: Request, limit: number): Promise<Raw> {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > limit) return { ok: false, status: 413 };
  if (!request.body) return { ok: false, status: 400 };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => {});
      return { ok: false, status: 413 };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  return { ok: true, text: new TextDecoder().decode(bytes) };
}

export async function POST(request: Request) {
  const raw = await readTextCapped(request, MAX_BODY_BYTES);
  if (!raw.ok) return NextResponse.json({ ok: false }, { status: raw.status });

  const verdict = verifyQuoSignature({
    headers: request.headers,
    rawBody: raw.text,
    secrets: process.env.QUO_WEBHOOK_SECRET,
    nowMs: Date.now(),
  });
  if (!verdict.ok) {
    // Deliberately uninformative to the caller. The reason goes to the log so
    // a misconfigured secret ("no_secret") is distinguishable from an attack.
    console.warn(`[webhooks/quo] rejected: ${verdict.reason}`);
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(raw.text);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  const parsed = parseQuoEvent(json);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });

  try {
    const result = await handleQuoEvent(parsed.event, json);
    return NextResponse.json({ ok: true, duplicate: result.duplicate });
  } catch (err) {
    console.error(
      // The error's code only: a driver message can quote the query's
      // parameters, which here are phone numbers and message text.
      `[webhooks/quo] processing failed for ${parsed.event.type} ${parsed.event.id}: ${
        err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : err instanceof Error ? err.name : "unknown"
      }`,
    );
    return NextResponse.json({ ok: false, error: "temporarily unavailable" }, { status: 500 });
  }
}
