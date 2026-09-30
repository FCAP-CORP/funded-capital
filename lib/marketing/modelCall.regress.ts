/**
 * Regression suite for lib/marketing/modelCall.ts — the daily blog's model call.
 * Every post from 26 Sep 2026 failed with "Invalid `signature` in `thinking`
 * block … bound to a different conversation". What must never happen again:
 *   §1 a request goes out without the drop_block binding setting and its beta header;
 *   §2 a thinking-block refusal fails the post instead of retrying plain once;
 *   §3 the plain retry keeps a thinking block, or a non-thinking error is retried.
 */
import { THINKING_BETA, callModel, isThinkingRefusal, requestInit, withoutThinking, type Message } from "./modelCall";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail = "") => { cond ? pass++ : fail++; console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`); };

const history: Message[] = [
  { role: "user", content: "Write the post." },
  { role: "assistant", content: [{ type: "thinking", thinking: "", signature: "abc" }, { type: "server_tool_use", id: "s1" }, { type: "web_search_tool_result", tool_use_id: "s1" }, { type: "redacted_thinking", data: "x" }, { type: "text", text: "partial" }] },
];
const base = { key: "k", model: "claude-opus-5-5", system: "rules", messages: history, search: true, maxTokens: 16000, timeoutMs: 60_000 };

console.log("\n=== 1. Every request opts into drop_block ===");
const init = requestInit(base, false);
const body = JSON.parse(String(init.body));
const headers = init.headers as Record<string, string>;
check("beta header present", headers["anthropic-beta"] === THINKING_BETA, headers["anthropic-beta"]);
check("thinking.type adaptive with block_binding drop_block", body.thinking?.type === "adaptive" && body.thinking?.block_binding?.prefix_mismatch_behavior === "drop_block", JSON.stringify(body.thinking));
check("history sent back unchanged, thinking blocks included", JSON.stringify(body.messages) === JSON.stringify(history), "");
check("web search tool present when asked", body.tools?.[0]?.type === "web_search_20250305", "");

async function main() {
console.log("\n=== 2. A thinking refusal is retried plain, once ===");
const REFUSAL = "messages.1.content.0: Invalid `signature` in `thinking` block. The block is bound to a different conversation.";
const calls: { headers: Record<string, string>; body: { thinking?: unknown; messages: Message[] } }[] = [];
const fake = (responses: { status: number; json: unknown }[]) => (async (_url: unknown, i?: RequestInit) => {
  calls.push({ headers: i!.headers as Record<string, string>, body: JSON.parse(String(i!.body)) });
  const r = responses.shift()!;
  return new Response(JSON.stringify(r.json), { status: r.status });
}) as typeof fetch;
let r = await callModel(base, fake([{ status: 400, json: { error: { message: REFUSAL } } }, { status: 200, json: { content: [{ type: "text", text: "ok" }], stop_reason: "end_turn" } }]));
check("succeeds on the plain retry", r.ok && r.retriedWithoutThinking, JSON.stringify(r).slice(0, 80));
check("exactly two calls", calls.length === 2, String(calls.length));
const plainMsgs = JSON.stringify(calls[1].body.messages);
check("the retry carries no thinking or redacted_thinking block", !/"type":"(redacted_)?thinking"/.test(plainMsgs), "");
check("...but keeps the search blocks and the text", /server_tool_use/.test(plainMsgs) && /web_search_tool_result/.test(plainMsgs) && /partial/.test(plainMsgs), "");
check("...and sends no thinking setting or beta header", calls[1].body.thinking === undefined && !calls[1].headers["anthropic-beta"], "");

calls.length = 0;
r = await callModel(base, fake([{ status: 400, json: { error: { message: REFUSAL } } }, { status: 400, json: { error: { message: REFUSAL } } }]));
check("two refusals → one clear failure, no third call", !r.ok && calls.length === 2 && /bound to a different conversation/.test(r.ok ? "" : r.message), "");

calls.length = 0;
r = await callModel(base, fake([{ status: 529, json: { error: { message: "Overloaded" } } }]));
check("an unrelated error is not retried", !r.ok && calls.length === 1 && !r.ok && r.status === 529, "");
calls.length = 0;
r = await callModel(base, fake([{ status: 401, json: { error: { message: "invalid x-api-key" } } }]));
check("a bad key is not retried", !r.ok && calls.length === 1, "");

calls.length = 0;
r = await callModel({ ...base, plain: true }, fake([{ status: 200, json: { content: [], stop_reason: "end_turn" } }]));
check("once plain, the conversation stays plain", r.ok && calls.length === 1 && calls[0].body.thinking === undefined && !calls[0].headers["anthropic-beta"], "");

console.log("\n=== 3. The helpers ===");
check("withoutThinking leaves user turns alone", JSON.stringify(withoutThinking(history)[0]) === JSON.stringify(history[0]), "");
check("isThinkingRefusal: the real message", isThinkingRefusal(400, REFUSAL), "");
check("isThinkingRefusal: missing beta header message", isThinkingRefusal(400, "thinking.block_binding: Extra inputs are not permitted"), "");
check("isThinkingRefusal: not for other 400s", !isThinkingRefusal(400, "max_tokens: must be at most 32000"), "");
check("isThinkingRefusal: not for 500s", !isThinkingRefusal(500, REFUSAL), "");

}

main().then(() => {
  console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
  process.exit(fail > 0 ? 1 : 0);
});
