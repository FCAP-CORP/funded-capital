/**
 * The Quo (formerly OpenPhone) API client. One job: send one text.
 *
 * SERVER ONLY, AND IT KNOWS NOTHING ABOUT CONSENT. It does not read the
 * database and it does not decide who may be texted. `quoSend` takes a
 * `TextPermit` — the value `canText()` returns when it says yes — so it cannot
 * be called without the consent gate having run first, and the only caller is
 * the executor in lib/comms/outbox.server.ts (guards.regress.ts §11 checks
 * both).
 *
 * THE API KEY. Read from `QUO_API_KEY` at call time and sent in the
 * `Authorization` header with NO "Bearer" prefix — Quo's documented scheme.
 * It is never logged, never put in an error message, and never returned. The
 * errors this produces are sentences for Luis, built from Quo's status code.
 *
 * TIMEOUT. 8 seconds, so a slow Quo cannot hold a server action open. A
 * timeout is reported as "outcome unknown" rather than "failed": Quo may have
 * accepted the text before the connection gave out, and calling that a
 * failure invites a resend that texts the borrower twice.
 *
 * Endpoint: POST https://api.openphone.com/v1/messages { content, from, to: [..] }
 * → 202 { data: { id: "AC…", status } }. Quo's current docs list the host as
 * api.quo.com; api.openphone.com is the long-standing address and still what
 * the rest of Funded Capital's tooling uses. Change QUO_API_BASE if it moves.
 */

import "server-only";
import type { TextPermit } from "./consent";
import { describeQuoFailure } from "./sms";

export const QUO_API_BASE = "https://api.openphone.com/v1";

/** Funded Capital's main line. Overridden by QUO_FROM_NUMBER. */
export const DEFAULT_FROM_NUMBER = "+13058575620";

export const QUO_TIMEOUT_MS = 8000;

export type QuoSendResult =
  | { ok: true; messageId: string | null; status: string | null }
  | { ok: false; outcome: "rejected" | "unknown"; error: string; httpStatus: number | null };

/**
 * The number texts go out from: QUO_FROM_NUMBER if it is a valid E.164 number
 * or a Quo phone-number id (PN…), otherwise the main line.
 */
export function quoFromNumber(env: string | undefined = process.env.QUO_FROM_NUMBER): string {
  const v = (env ?? "").trim();
  if (/^\+[1-9]\d{7,14}$/.test(v) || /^PN[A-Za-z0-9]+$/.test(v)) return v;
  return DEFAULT_FROM_NUMBER;
}

export type QuoSendOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  apiKey?: string;
  from?: string;
};

/**
 * Send one text. Never throws: every outcome is a value the executor records.
 */
export async function quoSend(
  permit: TextPermit,
  content: string,
  opts: QuoSendOptions = {},
): Promise<QuoSendResult> {
  if (!permit || permit.ok !== true || typeof permit.phone !== "string") {
    return { ok: false, outcome: "rejected", error: "Not sent: the consent check did not approve this text.", httpStatus: null };
  }
  const apiKey = (opts.apiKey ?? process.env.QUO_API_KEY ?? "").trim();
  if (!apiKey) {
    return { ok: false, outcome: "rejected", error: "Texting is not set up: QUO_API_KEY is missing in Vercel.", httpStatus: null };
  }

  const doFetch = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? QUO_TIMEOUT_MS);

  let res: Response;
  try {
    res = await doFetch(`${QUO_API_BASE}/messages`, {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ content, from: opts.from ?? quoFromNumber(), to: [permit.phone] }),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (err) {
    clearTimeout(timer);
    const timedOut = controller.signal.aborted || (err instanceof Error && err.name === "AbortError");
    const f = describeQuoFailure(null, null, timedOut ? "timeout" : "network");
    return { ok: false, outcome: f.outcome, error: f.error, httpStatus: null };
  }

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  clearTimeout(timer);

  if (res.status >= 200 && res.status < 300) {
    const data = (json && typeof json === "object" ? (json as { data?: unknown }).data : null) as
      | { id?: unknown; status?: unknown }
      | null
      | undefined;
    const id = data && typeof data.id === "string" && data.id ? data.id : null;
    const status = data && typeof data.status === "string" ? data.status : null;
    return { ok: true, messageId: id, status };
  }

  const f = describeQuoFailure(res.status, json, "http");
  return { ok: false, outcome: f.outcome, error: f.error, httpStatus: res.status };
}
