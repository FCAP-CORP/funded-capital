/**
 * Regression suite for texts and calls on the record card's timeline
 * (lib/crm/record.ts, buildTimeline).
 *
 * The quiet failures: a text shown twice (once from the outbox, once from its
 * activity); a text that never went shown as if it had; a STOP reply that
 * looks like any other message; a retry button on a text whose outcome is
 * unknown, which would invite a double-send.
 */

import { buildTimeline, TIMELINE_TEXT_PREVIEW, type ActivityInput, type OutboundInput } from "../crm/record";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};

const NOW = new Date("2026-09-24T15:00:00.000Z");
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString();
const act = (id: string, kind: string, min: number, extra: Partial<ActivityInput> = {}): ActivityInput => ({
  id, kind, occurredAt: ago(min), source: "quo", subject: null, body: null, metadata: {}, ...extra,
});
const ob = (id: string, status: string, min: number, extra: Partial<OutboundInput> = {}): OutboundInput => ({
  id, status, body: `text ${id}`, error: null, createdAt: ago(min), lastAttemptAt: ago(min), ...extra,
});
const build = (acts: ActivityInput[], outbound: OutboundInput[]) =>
  buildTimeline(acts, [], { totalActivities: acts.length, totalTransitions: 0 }, undefined, { outbound, now: NOW });

console.log("\n=== 1. A sent text appears ONCE, with its delivery status ===");
{
  const t = build(
    [act("a1", "sms_out", 5, { source: "crm", body: "Hi there", metadata: { outboundId: "o1", quoMessageId: "AC1" } })],
    [ob("o1", "delivered", 5, { body: "Hi there" })],
  );
  check("one item, not two", t.items.length === 1, t.items.map((i) => i.key).join(","));
  check("...from the activity", t.items[0]?.key === "a:a1", String(t.items[0]?.key));
  check("...showing 'Delivered' from the outbox row", t.items[0]?.status?.label === "Delivered" && t.items[0]?.status?.tone === "ok", JSON.stringify(t.items[0]?.status));
  check("...no retry on a delivered text", !t.items[0]?.retryId, "");
  const sent = build([act("a1", "sms_out", 5, { source: "crm", metadata: { outboundId: "o1" } })], [ob("o1", "sent", 5)]);
  check("'sent' before the receipt arrives", sent.items[0]?.status?.label === "Sent", String(sent.items[0]?.status?.label));
}

console.log("\n=== 2. Texts that did not go are shown from the outbox ===");
{
  const t = build([], [
    ob("f", "failed", 3, { error: "Quo refused it: the A2P 10DLC texting registration for this number is not approved." }),
    ob("b", "blocked", 2, { error: "They opted out of texts." }),
    ob("s", "sending", 1),
    ob("old", "sending", 60),
  ]);
  const by = (k: string) => t.items.find((i) => i.key === `o:${k}`);
  check("all four appear", t.items.length === 4, t.items.map((i) => i.key).join(","));
  check("failed: red, with Quo's reason", by("f")?.status?.tone === "bad" && /A2P/.test(by("f")!.status!.label), String(by("f")?.status?.label));
  check("failed: Retry offered", by("f")?.retryId === "f", String(by("f")?.retryId));
  check("blocked: titled 'Text not sent', with the gate's reason", by("b")?.title === "Text not sent" && /opted out/.test(by("b")!.status!.label), String(by("b")?.status?.label));
  check("blocked: no Retry (it needs consent, not another attempt)", !by("b")?.retryId, "");
  check("sending a minute ago: 'outcome unknown', NO Retry", /unknown/i.test(by("s")!.status!.label) && !by("s")?.retryId, String(by("s")?.status?.label));
  check("sending an hour ago: Retry offered (stale)", by("old")?.retryId === "old", "");
  check("the outbox rows count towards 'older' arithmetic", t.older === 0, String(t.older));
}

console.log("\n=== 3. A healed send is not shown twice ===");
{
  // Quo's delivery webhook completed a send whose answer we never got: the row
  // was `sending`, and now there is an activity for it too.
  const t = build(
    [act("a9", "sms_out", 4, { metadata: { outboundId: "o9", sentFrom: "crm" } })],
    [ob("o9", "sending", 4)],
  );
  check("only the activity is shown", t.items.length === 1 && t.items[0].key === "a:a9", t.items.map((i) => i.key).join(","));
}

console.log("\n=== 4. Inbound texts and what they mean for consent ===");
{
  const t = build([
    act("s", "sms_in", 1, { body: "STOP", metadata: { keyword: "stop" } }),
    act("st", "sms_in", 2, { body: "START", metadata: { keyword: "start" } }),
    act("p", "sms_in", 3, { body: "please stop texting me", metadata: { keyword: "possible_stop" } }),
    act("n", "sms_in", 4, { body: "Sounds good" }),
  ], []);
  const by = (k: string) => t.items.find((i) => i.key === `a:${k}`)!;
  check("STOP is flagged red: opted out, texting blocked", by("s").status?.tone === "bad" && /Opted out/.test(by("s").status!.label), String(by("s").status?.label));
  check("START says the opt-out is NOT lifted automatically", by("st").status?.tone === "warn" && /NOT lifted/.test(by("st").status!.label), String(by("st").status?.label));
  check("possible opt-out asks a person to read and honor it", /honor/.test(String(by("p").status?.label)), String(by("p").status?.label));
  check("an ordinary reply has no badge", by("n").status === null, JSON.stringify(by("n").status));
  check("inbound texts are titled 'Text from them'", by("n").title === "Text from them", by("n").title);
}

console.log("\n=== 5. Long texts fold; short ones do not ===");
{
  const long = "x".repeat(TIMELINE_TEXT_PREVIEW + 1);
  const t = build([act("l", "sms_in", 1, { body: long }), act("s", "sms_in", 2, { body: "short" })], [ob("o", "failed", 3, { body: long })]);
  check("a long inbound text is folded", t.items.find((i) => i.key === "a:l")?.long === true, "");
  check("a short one is not", t.items.find((i) => i.key === "a:s")?.long === false, "");
  check("a long unsent text is folded too", t.items.find((i) => i.key === "o:o")?.long === true, "");
  check("the full body is kept for 'Show all'", t.items.find((i) => i.key === "a:l")?.body === long, "");
}

console.log("\n=== 6. Calls from Quo ===");
{
  const t = build([
    act("in", "call", 1, { subject: "Missed · voicemail left", metadata: { direction: "incoming", answered: false } }),
    act("out", "call", 2, { subject: "Answered · 4 min 12 s", metadata: { direction: "outgoing", answered: true, durationSec: 252 } }),
    act("logged", "call", 3, { source: "crm", subject: "Called", metadata: { by: "user_1" } }),
  ], []);
  const by = (k: string) => t.items.find((i) => i.key === `a:${k}`)!;
  check("incoming missed: 'Call from them', flagged that they tried to reach you", by("in").title === "Call from them" && /tried to reach you/.test(String(by("in").status?.label)), `${by("in").title} / ${by("in").status?.label}`);
  check("outgoing answered: 'Call to them' with the duration line", by("out").title === "Call to them" && by("out").subject === "Answered · 4 min 12 s" && by("out").status === null, `${by("out").title} / ${by("out").subject}`);
  check("a hand-logged call is unchanged: 'Call', no repeated 'Called'", by("logged").title === "Call" && by("logged").subject === null, `${by("logged").title} / ${by("logged").subject}`);
}

console.log("\n=== 7. Older callers still work ===");
{
  const t = buildTimeline([act("a", "note", 1, { source: "crm", body: "hi", metadata: undefined })], [], { totalActivities: 1, totalTransitions: 0 });
  check("buildTimeline with no outbox and no metadata", t.items.length === 1 && t.items[0].status === null && !t.items[0].retryId, JSON.stringify(t.items[0]));
  const texts = build([act("x", "sms_out", 1, { source: "crm", subject: "Texted", metadata: { by: "u" } })], []);
  check("a hand-logged 'Log text' gets no delivery badge", texts.items[0].status === null, JSON.stringify(texts.items[0].status));
  const fromQuo = build([act("q", "sms_out", 1, { body: "sent from phone", metadata: { status: "delivered", sentFrom: "quo" } })], []);
  check("a text sent from the Quo app says so, with its status", fromQuo.items[0].title === "Text to them (from Quo)" && fromQuo.items[0].status?.label === "Delivered", fromQuo.items[0].title);
}

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail > 0 ? 1 : 0);
