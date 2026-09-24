/**
 * Regression suite for Quo webhook events → CRM writes (the pure mapper).
 *
 * The payloads below are Quo's own published examples, in both shapes: the
 * one webhooks made in the Quo app send (`data.object`, support.quo.com) and
 * the dated-API one (`data.resource` + `data.context`, quo.com/docs
 * 2026-03-30). If either shape is misread, texts and calls simply stop
 * appearing on the timeline — no error anywhere — so each field that matters
 * is pinned.
 */

import { durationLabel, callSummary, parseQuoEvent, planQuoEvent, type QuoEvent, type QuoPlan } from "./quoEvents";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};
const NOW = new Date("2026-09-24T15:00:00.000Z");

function ev(json: unknown): QuoEvent {
  const r = parseQuoEvent(json);
  if (!r.ok) throw new Error(`parse failed: ${r.error}`);
  return r.event;
}
const plan = (json: unknown): QuoPlan => planQuoEvent(ev(json), NOW);

/* -------- Quo's published examples, older shape (webhooks made in the app) -------- */

// Ids below are placeholders. Quo's own ids start with "AC" + 32 hex, which GitHub's
// secret scanner reads as a Twilio account SID and blocks the push, so none are used.
const legacyReceived = {
  id: "EVc67ec998b35c41d388af50799aeeba3e", object: "event", apiVersion: "v2",
  createdAt: "2022-01-23T16:55:52.557Z", type: "message.received",
  data: { object: {
    id: "MSG-TEST-RECEIVED-0001", object: "message", from: "+14155550100", to: "+13105550199",
    direction: "incoming", body: "Hello", media: [{ url: "https://x/y", type: "image/jpeg" }], status: "received",
    createdAt: "2022-01-23T16:55:52.420Z", userId: "USu5AsEHuQ", phoneNumberId: "PNtoDbDhuz", conversationId: "CN78",
  } },
};
const legacyDelivered = {
  id: "EVdefd85c2c3b740429cf28ade5b69bcba", object: "event", apiVersion: "v2",
  createdAt: "2022-01-23T17:05:56.220Z", type: "message.delivered",
  data: { object: {
    id: "MSG-TEST-DELIVERED-0002", object: "message", from: "+13105550199", to: "+14155550100",
    direction: "outgoing", body: "Have a nice day", media: [], status: "delivered", createdAt: "2022-01-23T17:05:45.195Z",
  } },
};
const legacyMissedWithVm = {
  id: "EVd39d3c8d6f244d21a9131de4fc9350d0", object: "event", apiVersion: "v2",
  createdAt: "2022-01-24T19:22:25.427Z", type: "call.completed",
  data: { object: {
    id: "CALL-TEST-MISSED-0003", object: "call", from: "+14145550100", to: "+13105550199",
    direction: "incoming", media: [], voicemail: { url: "https://m.openph.one/static/85.mp3", type: "audio/mpeg", duration: 7 },
    status: "completed", createdAt: "2022-01-24T19:21:59.545Z", answeredAt: null, completedAt: "2022-01-24T19:22:19.000Z",
  } },
};
const legacyOutgoingAnswered = {
  id: "EV348de11e4b134fa48017ac45a251dd3e", object: "event", apiVersion: "v2",
  createdAt: "2022-01-24T19:28:45.370Z", type: "call.completed",
  data: { object: {
    id: "CALL-TEST-ANSWERED-0004", object: "call", from: "+13105550199", to: "+14155550100",
    direction: "outgoing", media: [], voicemail: null, status: "completed", createdAt: "2022-01-24T19:28:33.892Z",
    answeredAt: "2022-01-24T19:28:42.000Z", completedAt: "2022-01-24T19:28:45.000Z",
  } },
};

/* -------- Quo's published examples, dated-API shape -------- */

const ctx = (sender: string, recipients: string[]) => ({
  orgId: "OR123", phoneNumberId: "PN123", conversationId: "CN123", userId: "US123",
  contacts: { ids: ["CT123"], lookupStatus: "matched" }, senderIdentifier: sender, recipientIdentifiers: recipients,
});
const callCtx = { orgId: "OR123", phoneNumberId: "PN123", conversationId: "CN123", phoneNumberType: "shared", userId: "US123",
  contacts: { ids: ["CT123"], lookupStatus: "matched" },
  participants: { workspace: ["+15550000001"], external: ["+15550000002"], resolution: "available" } };
const newReceived = {
  id: "EV-new-1", apiVersion: "2026-03-30", createdAt: "2026-04-13T12:00:00.000Z", type: "message.received",
  data: { resource: { id: "AC-message", direction: "incoming", text: "hello", media: [], status: "received", createdAt: "2026-04-13T12:00:00.000Z" },
    context: ctx("+15550001111", ["+15550002222"]), links: { quo: null } },
};
const newUndelivered = {
  id: "EV-new-2", apiVersion: "2026-03-30", createdAt: "2026-04-13T12:00:00.000Z", type: "message.undelivered",
  data: { resource: { id: "AC-message2", direction: "outgoing", text: "hello", media: [], status: "undelivered", errorCode: "30007", createdAt: "2026-04-13T12:00:00.000Z" },
    context: ctx("+15550002222", ["+15550001111"]), links: { quo: null } },
};
const newCall = {
  id: "EV-new-3", apiVersion: "2026-03-30", createdAt: "2026-04-13T12:00:56.000Z", type: "call.completed",
  data: { resource: { id: "AC-call", direction: "incoming", status: "answered", createdAt: "2026-04-13T11:59:55.000Z",
    answeredAt: "2026-04-13T12:00:00.000Z", completedAt: "2026-04-13T12:00:55.000Z", updatedAt: null, duration: 55, hasVoicemail: false },
    context: callCtx, links: { quo: null } },
};

console.log("\n=== 1. Parsing: id and type are required ===");
check("not an object → error", !parseQuoEvent("x").ok && !parseQuoEvent(null).ok && !parseQuoEvent([1]).ok, "");
check("no id → error", !parseQuoEvent({ type: "message.received" }).ok, "");
check("no type → error", !parseQuoEvent({ id: "EV1" }).ok, "");
check("absurdly long id → error", !parseQuoEvent({ id: "E".repeat(500), type: "x" }).ok, "");
check("an unknown type with no data still parses (it is stored, then ignored)", parseQuoEvent({ id: "EV9", type: "contact.updated" }).ok, "");

console.log("\n=== 2. message.received → sms_in (older shape) ===");
{
  const p = plan(legacyReceived);
  check("action is sms_in", p.action === "sms_in", p.action);
  if (p.action === "sms_in") {
    check("the phone matched is the SENDER (the borrower), in E.164", p.phone === "+14155550100", String(p.phone));
    check("dedup key is Quo's message id: quo:msg:<id>", p.activity.dedupKey === "quo:msg:MSG-TEST-RECEIVED-0001", p.activity.dedupKey);
    check("kind sms_in, source quo", p.activity.kind === "sms_in" && p.activity.source === "quo", "");
    check("body is the text", p.activity.body === "Hello", String(p.activity.body));
    check("occurred at the message's own time", p.activity.occurredAt.toISOString() === "2022-01-23T16:55:52.420Z", p.activity.occurredAt.toISOString());
    check("metadata keeps Quo's ids and the attachment count", p.activity.metadata.quoEventId === legacyReceived.id && p.activity.metadata.mediaCount === 1, JSON.stringify(p.activity.metadata));
    check("an ordinary reply carries no keyword", p.keyword === null && !("keyword" in p.activity.metadata), String(p.keyword));
  }
}

console.log("\n=== 3. message.received → sms_in (dated-API shape) ===");
{
  const p = plan(newReceived);
  check("action is sms_in", p.action === "sms_in", p.action);
  if (p.action === "sms_in") {
    check("sender comes from context.senderIdentifier", p.phone === "+15550001111", String(p.phone));
    check("body comes from resource.text", p.activity.body === "hello", String(p.activity.body));
    check("dedup key from resource.id", p.activity.dedupKey === "quo:msg:AC-message", p.activity.dedupKey);
    check("our number recorded from recipientIdentifiers", p.activity.metadata.to === "+15550002222", String(p.activity.metadata.to));
  }
}

console.log("\n=== 4. Keywords reach the plan ===");
for (const [text, kw] of [["STOP", "stop"], [" stop. ", "stop"], ["Unsubscribe", "stop"], ["START", "start"], ["please stop texting me", "possible_stop"], ["HELP", "help"], ["sounds good", null]] as const) {
  const j = structuredClone(legacyReceived);
  j.data.object.body = text;
  const p = plan(j);
  check(`${JSON.stringify(text)} → keyword ${kw}`, p.action === "sms_in" && p.keyword === kw && (kw === null || p.activity.metadata.keyword === kw), p.action === "sms_in" ? String(p.keyword) : p.action);
}
{
  const j = structuredClone(legacyReceived);
  j.data.object.body = "";
  const p = plan(j);
  check("a picture with no words still gets a line on the timeline", p.action === "sms_in" && /picture message/.test(String(p.activity.body)), p.action === "sms_in" ? String(p.activity.body) : "");
  const k = structuredClone(legacyReceived);
  k.data.object.body = "x".repeat(5000);
  const q = plan(k);
  check("a runaway body is capped at 2,000 characters", q.action === "sms_in" && q.activity.body!.length === 2000, "");
}

console.log("\n=== 5. Delivery receipts → outbox status ===");
{
  const p = plan(legacyDelivered);
  check("message.delivered → sms_status delivered", p.action === "sms_status" && p.status === "delivered", p.action);
  if (p.action === "sms_status") {
    check("matched on Quo's message id", p.providerMessageId === "MSG-TEST-DELIVERED-0002", p.providerMessageId);
    check("the phone is the RECIPIENT (the borrower) for an outgoing text", p.phone === "+14155550100", String(p.phone));
    check("carries an sms_out activity for texts sent from the Quo app", p.activity?.kind === "sms_out" && p.activity.metadata.sentFrom === "quo", JSON.stringify(p.activity?.metadata));
    check("...keyed on the same quo:msg:<id> a CRM send uses, so the two converge", p.activity?.dedupKey === "quo:msg:MSG-TEST-DELIVERED-0002", String(p.activity?.dedupKey));
    check("the text is carried for matching an unconfirmed CRM send", p.text === "Have a nice day", p.text);
  }
  const u = plan(newUndelivered);
  check("message.undelivered (dated API) → undelivered, no activity", u.action === "sms_status" && u.status === "undelivered" && u.activity === null, u.action);
  check("...with the carrier's error code", u.action === "sms_status" && u.errorCode === "30007", u.action === "sms_status" ? String(u.errorCode) : "");
  const f = structuredClone(newUndelivered) as typeof newUndelivered;
  f.type = "message.failed";
  const fp = plan(f);
  check("message.failed → failed", fp.action === "sms_status" && fp.status === "failed", fp.action);
}

console.log("\n=== 6. call.completed → call activity ===");
{
  const missed = plan(legacyMissedWithVm);
  check("missed incoming call (older shape) → call", missed.action === "call", missed.action);
  if (missed.action === "call") {
    const m = missed.activity.metadata;
    check("the caller's number is the counterparty", missed.phone === "+14145550100", String(missed.phone));
    check("not answered (answeredAt null)", m.answered === false && m.status === "unanswered", JSON.stringify(m));
    check("voicemail detected from the voicemail object", m.voicemail === true, "");
    check("summary reads 'Missed · voicemail left'", missed.activity.subject === "Missed · voicemail left", String(missed.activity.subject));
    check("dedup key is Quo's call id", missed.activity.dedupKey === "quo:call:CALL-TEST-MISSED-0003", missed.activity.dedupKey);
    check("direction incoming, Quo call id kept", m.direction === "incoming" && m.quoCallId === "CALL-TEST-MISSED-0003", "");
  }
  const out = plan(legacyOutgoingAnswered);
  if (out.action === "call") {
    const m = out.activity.metadata;
    check("outgoing answered call: counterparty is the number DIALLED", out.phone === "+14155550100", String(out.phone));
    check("duration computed from answeredAt → completedAt (3 s)", m.durationSec === 3 && m.answered === true, JSON.stringify(m));
    check("summary 'Answered · 3 s'", out.activity.subject === "Answered · 3 s", String(out.activity.subject));
  } else check("outgoing answered call → call", false, out.action);
  const n = plan(newCall);
  if (n.action === "call") {
    check("dated API: counterparty from participants.external", n.phone === "+15550000002", String(n.phone));
    check("dated API: duration field used as given (55 s)", n.activity.metadata.durationSec === 55, "");
    check("dated API: status 'answered' is answered", n.activity.metadata.answered === true && n.activity.subject === "Answered · 55 s", String(n.activity.subject));
  } else check("dated API call.completed → call", false, n.action);
  const noAns = structuredClone(newCall);
  noAns.data.resource.status = "unanswered";
  (noAns.data.resource as { answeredAt: string | null }).answeredAt = null;
  (noAns.data.resource as { duration: number | null }).duration = null;
  noAns.data.resource.direction = "outgoing";
  const na = plan(noAns);
  check("outgoing unanswered → 'No answer'", na.action === "call" && na.activity.subject === "No answer", na.action === "call" ? String(na.activity.subject) : na.action);
}

console.log("\n=== 7. Everything else is stored and ignored ===");
for (const type of ["call.ringing", "call.recording.completed", "call.summary.completed", "contact.updated", "task.created", "brand.new.event"]) {
  const p = plan({ id: `EV-${type}`, type, data: {} });
  check(`${type} → ignore`, p.action === "ignore", p.action);
}
{
  const noId = structuredClone(legacyReceived) as { data: { object: Record<string, unknown> } };
  delete noId.data.object.id;
  check("message.received without a message id → ignore, not a half row", plan({ ...legacyReceived, data: noId.data }).action === "ignore", "");
  const noDir = structuredClone(legacyOutgoingAnswered) as { data: { object: Record<string, unknown> } };
  delete noDir.data.object.direction;
  check("call.completed without a direction → ignore", plan({ ...legacyOutgoingAnswered, data: noDir.data }).action === "ignore", "");
}

console.log("\n=== 8. Numbers that are not phone numbers ===");
{
  const j = structuredClone(newReceived);
  j.data.context.senderIdentifier = "internal:US999";
  const p = plan(j);
  check("a non-phone sender identifier → phone null (nobody is matched)", p.action === "sms_in" && p.phone === null, p.action === "sms_in" ? String(p.phone) : "");
  const k = structuredClone(legacyReceived);
  k.data.object.from = "(415) 555-0100";
  const q = plan(k);
  check("a formatted US number is normalised to E.164", q.action === "sms_in" && q.phone === "+14155550100", q.action === "sms_in" ? String(q.phone) : "");
}

console.log("\n=== 9. Labels ===");
check("durationLabel 0 → '0 s'", durationLabel(0) === "0 s", String(durationLabel(0)));
check("durationLabel 252 → '4 min 12 s'", durationLabel(252) === "4 min 12 s", String(durationLabel(252)));
check("durationLabel 3720 → '1 h 02 min'", durationLabel(3720) === "1 h 02 min", String(durationLabel(3720)));
check("durationLabel null/negative → null", durationLabel(null) === null && durationLabel(-1) === null, "");
check("an AI-handled outgoing call says so", callSummary({ direction: "outgoing", status: "ai-handled", answered: false, durationSec: null, voicemail: false }).includes("AI"), "");

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail > 0 ? 1 : 0);
