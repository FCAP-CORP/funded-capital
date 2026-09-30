/**
 * One call to the Anthropic Messages API for the daily blog, with the thinking
 * block binding handled.
 *
 * WHY THIS EXISTS (30 Sep 2026). Every blog after the switch to Opus 5.5 failed
 * with "Invalid `signature` in `thinking` block. The block is bound to a
 * different conversation." The model returns thinking blocks; when a long web
 * search pauses the turn (`pause_turn`) the route sends the assistant content
 * back to continue, and the API checks each thinking block against the exact
 * prefix it was produced under. Any mismatch was a hard 400, and the post was
 * marked failed.
 *
 * Two layers, so a future API change cannot silently stop the blog again:
 *   1. Every request opts into `prefix_mismatch_behavior: "drop_block"` (beta
 *      `thinking-binding-controls-2026-08-01`): a thinking block that no longer
 *      matches is dropped by the API instead of failing the request.
 *   2. If the API still refuses anything about thinking or that beta, the call
 *      is retried ONCE with every thinking block removed from the history and
 *      no thinking settings — which the API always accepts ("if you never send
 *      thinking blocks back, the prefix check has nothing to reject").
 *
 * PURE apart from the injected fetch. Pinned by modelCall.regress.ts.
 */

export const THINKING_BETA = "thinking-binding-controls-2026-08-01";

export type Block = { type: string; text?: string; [k: string]: unknown };
export type Message = { role: "user" | "assistant"; content: string | Block[] };

export type ModelReply = { content?: Block[]; stop_reason?: string; error?: { message?: string } };

export type CallOptions = {
  key: string;
  model: string;
  system: string;
  messages: Message[];
  search: boolean;
  maxTokens: number;
  timeoutMs: number;
  /** Already fell back once in this conversation: stay plain for the rest of it. */
  plain?: boolean;
};

export type CallResult =
  | { ok: true; reply: ModelReply; retriedWithoutThinking: boolean }
  | { ok: false; status: number; message: string };

const THINKING_TYPES = new Set(["thinking", "redacted_thinking"]);

/** Every message with thinking blocks removed. Allowed by the API when ALL are removed. */
export function withoutThinking(messages: readonly Message[]): Message[] {
  return messages.map((m) =>
    m.role === "assistant" && Array.isArray(m.content)
      ? { ...m, content: m.content.filter((b) => !THINKING_TYPES.has(b.type)) }
      : m,
  );
}

/** A refusal that the plain retry can cure: anything about thinking blocks or the binding beta. */
export function isThinkingRefusal(status: number, message: string): boolean {
  if (status !== 400) return false;
  return /thinking|block_binding|signature|bound to a different conversation|anthropic-beta|thinking-binding/i.test(message);
}

export function requestInit(o: CallOptions, plain: boolean): RequestInit {
  return {
    method: "POST",
    headers: {
      "x-api-key": o.key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      ...(plain ? {} : { "anthropic-beta": THINKING_BETA }),
    },
    body: JSON.stringify({
      model: o.model,
      max_tokens: o.maxTokens,
      system: o.system,
      messages: plain ? withoutThinking(o.messages) : o.messages,
      ...(plain ? {} : { thinking: { type: "adaptive", block_binding: { prefix_mismatch_behavior: "drop_block" } } }),
      ...(o.search ? { tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 8 }] } : {}),
    }),
  };
}

export async function callModel(o: CallOptions, doFetch: typeof fetch = fetch): Promise<CallResult> {
  const attempt = async (plain: boolean) => {
    const res = await doFetch("https://api.anthropic.com/v1/messages", { ...requestInit(o, plain), signal: AbortSignal.timeout(o.timeoutMs) });
    const reply = (await res.json().catch(() => ({}))) as ModelReply;
    return { res, reply };
  };
  if (o.plain) {
    const { res, reply } = await attempt(true);
    return res.ok ? { ok: true, reply, retriedWithoutThinking: true } : { ok: false, status: res.status, message: reply.error?.message ?? `HTTP ${res.status}` };
  }
  let { res, reply } = await attempt(false);
  if (!res.ok && isThinkingRefusal(res.status, reply.error?.message ?? "")) {
    console.warn(`[cron/daily-blog] thinking refusal, retrying plain: ${(reply.error?.message ?? "").slice(0, 160)}`);
    ({ res, reply } = await attempt(true));
    if (res.ok) return { ok: true, reply, retriedWithoutThinking: true };
  }
  if (!res.ok) return { ok: false, status: res.status, message: reply.error?.message ?? `HTTP ${res.status}` };
  return { ok: true, reply, retriedWithoutThinking: false };
}
