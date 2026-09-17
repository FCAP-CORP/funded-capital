/**
 * Regression suite for the contact classifier.
 *
 * Every case below is a real message shape taken from the mailbox, because the
 * failure this code exists to prevent was caused by reasoning about mail in the
 * abstract. The two that matter most:
 *
 *   - the BiggerPockets lead alert MUST NOT count as contact (it is addressed
 *     to us, about them), and
 *   - a real reply to a borrower MUST count,
 *
 * and those two arrive minutes apart with the same borrower's name in them.
 */

import {
  parseAddress, parseAddressList, isMachineAddress, isMachineSubject, isBulkMail,
  classifyMessage, isRejected, gmailDedupKey, latestByCounterparty, planActivityRows,
  type ClassifiedMessage,
} from "./activity";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};

const SELF = { selfAddresses: ["luis@fundedcapital.com", "processing@fundedcapital.com", "info@fundedcapital.com"] };

console.log("\n=== 1. Address parsing ===");
check("bare address", parseAddress("a@b.com") === "a@b.com", String(parseAddress("a@b.com")));
check("display name", parseAddress("Luis Fajardo <luis@fundedcapital.com>") === "luis@fundedcapital.com", String(parseAddress("Luis Fajardo <luis@fundedcapital.com>")));
check("angle only", parseAddress("<a@b.com>") === "a@b.com", String(parseAddress("<a@b.com>")));
check("uppercase folded", parseAddress("A@B.COM") === "a@b.com", String(parseAddress("A@B.COM")));
check("padded", parseAddress("  a@b.com  ") === "a@b.com", String(parseAddress("  a@b.com  ")));
check("no domain dot rejected", parseAddress("a@localhost") === null, "null");
check("no at rejected", parseAddress("notanemail") === null, "null");
check("empty rejected", parseAddress("") === null, "null");
check("null rejected", parseAddress(null) === null, "null");

console.log("\n=== 2. Address lists ===");
check("two addresses", parseAddressList("a@b.com, c@d.com").length === 2, parseAddressList("a@b.com, c@d.com").join("|"));
// A display name containing a comma is the classic list-splitting bug.
check(
  "COMMA inside a quoted display name",
  parseAddressList('"Fajardo, Luis" <luis@fundedcapital.com>, c@d.com').length === 2,
  parseAddressList('"Fajardo, Luis" <luis@fundedcapital.com>, c@d.com').join("|"),
);
check("duplicates collapse", parseAddressList("a@b.com, A@B.COM").length === 1, "1");
check("empty header", parseAddressList(null).length === 0, "0");
check("junk entries dropped", parseAddressList("a@b.com, garbage").length === 1, "1");

console.log("\n=== 3. Machine senders ===");
check("BiggerPockets alerts domain", isMachineAddress("alerts@t.biggerpockets.com"), "machine");
check("Claude routine digest", isMachineAddress("no-reply-claude@mail.anthropic.com"), "machine");
check("generic noreply", isMachineAddress("noreply@anything.com"), "machine");
check("no-reply with dash suffix", isMachineAddress("no-reply-x@anything.com"), "machine");
check("newsletter platform", isMachineAddress("hello@onepercentimprovements.convertkit.com"), "machine");
check("a real borrower is NOT machine", !isMachineAddress("ryans2011@yahoo.com"), "human");
check("a real broker is NOT machine", !isMachineAddress("marylen@legacyhml.com"), "human");
// "alerts" as a substring of a human name must not trip the filter.
check("alertson@ is a person, not an alert", !isMachineAddress("alertson@gmail.com"), "human");
// Real sender from the live mailbox: noreply is a SUFFIX here, not a prefix.
check("updates-noreply@linkedin.com", isMachineAddress("updates-noreply@linkedin.com"), "machine");
check("chat-noreply@google.com", isMachineAddress("chat-noreply@google.com"), "machine");
check("notifications-abc@x.com", isMachineAddress("notifications-abc@x.com"), "machine");
// Boundary cases that must stay human.
check("noreplyton@ is a person", !isMachineAddress("noreplyton@gmail.com"), "human");
check("bouncer@ is a person", !isMachineAddress("bouncer@gmail.com"), "human");
check("null is machine (fail closed)", isMachineAddress(null), "machine");

console.log("\n=== 3b. Bulk mail declares itself ===");
const base = { messageId: "b", from: "a@b.com", to: "luis@fundedcapital.com", dateMs: Date.now() };
check("List-Unsubscribe present", isBulkMail({ ...base, listUnsubscribe: "<https://x/unsub>" }), "bulk");
check("Precedence: bulk", isBulkMail({ ...base, precedence: "bulk" }), "bulk");
check("Precedence: list", isBulkMail({ ...base, precedence: "list" }), "bulk");
check("no bulk headers", !isBulkMail(base), "not bulk");
check("empty List-Unsubscribe is not bulk", !isBulkMail({ ...base, listUnsubscribe: "  " }), "not bulk");

// The three real senders that slipped every name-shaped rule.
const wgu = classifyMessage({
  messageId: "r1", from: "Enrollment@wgu.edu", to: "luis@fundedcapital.com",
  subject: "School That Fits Your Schedule", dateMs: Date.now(),
  listUnsubscribe: "<mailto:unsub@wgu.edu>",
}, SELF);
check("WGU marketing, human-shaped address", isRejected(wgu), isRejected(wgu) ? wgu.reason : "WRONGLY COUNTED");

const bank = classifyMessage({
  messageId: "r2", from: "facturaelectronica@baccredomatic.cr", to: "luis@fundedcapital.com",
  subject: "Documento Electronico", dateMs: Date.now(), precedence: "bulk",
}, SELF);
check("bank billing blast", isRejected(bank), isRejected(bank) ? bank.reason : "WRONGLY COUNTED");

const li = classifyMessage({
  messageId: "r3", from: "updates-noreply@linkedin.com", to: "luis@fundedcapital.com",
  subject: "Anurag Shukla reacted to this post", dateMs: Date.now(),
}, SELF);
check("LinkedIn digest", isRejected(li), isRejected(li) ? li.reason : "WRONGLY COUNTED");

// A borrower's mail client must never be mistaken for a mailing list.
const human = classifyMessage({
  messageId: "r4", from: "mick-torres@hotmail.com", to: "luis@fundedcapital.com",
  subject: "Re: [140182] - Torres-Quezada", dateMs: Date.now(),
}, SELF);
check("a real borrower reply still counts", !isRejected(human), isRejected(human) ? "WRONGLY REJECTED" : "counted");

console.log("\n=== 4. Machine subjects ===");
check("calendar booking", isMachineSubject("Appointment booked: Client Meetings & Free Consultations (Falasha Ali) @ Thu Sep 10"), "machine");
check("BP lead alert subject", isMachineSubject("🔔 BP LEAD: Bronson Dodder — Houston, TX"), "machine");
check("BP inbound alert subject", isMachineSubject("New lead from BiggerPockets! - Angel Tellez"), "machine");
check("routine digest subject", isMachineSubject("⚡ biggerpockets-daily-drip — routine completed"), "machine");
check("out of office", isMachineSubject("Out of office until Monday"), "machine");
check("a real subject is not machine", !isMachineSubject("3186 W 88th St — DSCR financing for your Cleveland rental purchase"), "human");
check("empty subject is not machine", !isMachineSubject(null), "human");

console.log("\n=== 5. THE CASE THAT CAUSED THIS — alert vs reply ===");
// Both concern Bronson Dodder. Only one is contact with him.
const alert = classifyMessage({
  messageId: "m1",
  from: "alerts@t.biggerpockets.com",
  to: "luis@fundedcapital.com",
  subject: "New lead from BiggerPockets! - Bronson Dodder",
  dateMs: Date.parse("2026-09-14T15:14:00Z"),
}, SELF);
check("the BP alert is NOT contact", isRejected(alert), isRejected(alert) ? alert.reason : "WRONGLY COUNTED");

const reply = classifyMessage({
  messageId: "m2",
  from: "Luis Fajardo <luis@fundedcapital.com>",
  to: "bronsondodder@gmail.com",
  subject: "Your first Houston flip — what I need to quote it",
  dateMs: Date.parse("2026-09-14T18:26:45Z"),
}, SELF);
check("the reply IS contact", !isRejected(reply), isRejected(reply) ? "WRONGLY REJECTED" : "counted");
if (!isRejected(reply)) {
  check("direction is outbound", reply.direction === "email_out", reply.direction);
  check("counterparty is the borrower", reply.counterparties[0] === "bronsondodder@gmail.com", reply.counterparties.join("|"));
}

console.log("\n=== 6. Inbound from a borrower ===");
const inbound = classifyMessage({
  messageId: "m3",
  from: "undergroundlandlord@gmail.com",
  to: "luis@fundedcapital.com",
  subject: "Re: Your Shelby, NC deal — Funded Capital",
  dateMs: Date.parse("2026-09-12T19:35:01Z"),
}, SELF);
check("inbound counted", !isRejected(inbound), isRejected(inbound) ? inbound.reason : "counted");
if (!isRejected(inbound)) {
  check("direction is inbound", inbound.direction === "email_in", inbound.direction);
  check("counterparty is the sender", inbound.counterparties[0] === "undergroundlandlord@gmail.com", inbound.counterparties.join("|"));
}

console.log("\n=== 7. Internal and self-addressed mail ===");
const selfNote = classifyMessage({
  messageId: "m4", from: "luis@fundedcapital.com", to: "luis@fundedcapital.com",
  subject: "Revenue Share - 35% updated", dateMs: Date.now(),
}, SELF);
check("note to self is not contact", isRejected(selfNote), isRejected(selfNote) ? selfNote.reason : "WRONGLY COUNTED");

const internal = classifyMessage({
  messageId: "m5", from: "luis@fundedcapital.com", to: "processing@fundedcapital.com",
  subject: "conditions list", dateMs: Date.now(),
}, SELF);
check("colleague-only mail is not contact", isRejected(internal), isRejected(internal) ? internal.reason : "WRONGLY COUNTED");

console.log("\n=== 8. Several parties on one message ===");
const multi = classifyMessage({
  messageId: "m6",
  from: "luis@fundedcapital.com",
  to: "mick-torres@hotmail.com, claudia@locationtitle.com",
  cc: "processing@fundedcapital.com, noreply@docs.google.com",
  subject: "83 Lamson Street — next steps",
  dateMs: Date.now(),
}, SELF);
check("both externals counted", !isRejected(multi) && multi.counterparties.length === 2, isRejected(multi) ? multi.reason : multi.counterparties.join("|"));
check("our own address excluded", !isRejected(multi) && !multi.counterparties.includes("processing@fundedcapital.com"), "excluded");
check("machine cc excluded", !isRejected(multi) && !multi.counterparties.includes("noreply@docs.google.com"), "excluded");

console.log("\n=== 9. Calendar notifications reach both parties — still not contact ===");
const booking = classifyMessage({
  messageId: "m7",
  from: "luis@fundedcapital.com",
  to: "luis@fundedcapital.com, cuffs2crypto@gmail.com",
  subject: "Appointment booked: Client Meetings & Free Consultations (Falasha Ali) @ Thu Sep 10, 2026",
  dateMs: Date.parse("2026-09-09T21:12:13Z"),
}, SELF);
check("booking notice is not contact", isRejected(booking), isRejected(booking) ? booking.reason : "WRONGLY COUNTED");

console.log("\n=== 10. Malformed input fails closed ===");
check("no message id", isRejected(classifyMessage({ messageId: "", from: "a@b.com", to: "c@d.com", dateMs: 1 }, SELF)), "rejected");
check("bad date", isRejected(classifyMessage({ messageId: "m", from: "a@b.com", to: "c@d.com", dateMs: NaN }, SELF)), "rejected");
check("unparseable sender", isRejected(classifyMessage({ messageId: "m", from: "???", to: "c@d.com", dateMs: 1 }, SELF)), "rejected");
check(
  "NO self addresses configured rejects everything",
  isRejected(classifyMessage({ messageId: "m", from: "a@b.com", to: "c@d.com", dateMs: 1 }, { selfAddresses: [] })),
  "rejected — a misconfigured sync must record nothing, not everything",
);

console.log("\n=== 11. Dedup keys are stable and per-counterparty ===");
check("stable across runs", gmailDedupKey("abc", "x@y.com") === gmailDedupKey("abc", "x@y.com"), "stable");
check("namespaced", gmailDedupKey("abc", "x@y.com").startsWith("gmail:"), gmailDedupKey("abc", "x@y.com"));
check(
  "one message, two recipients, two distinct keys",
  gmailDedupKey("abc", "x@y.com") !== gmailDedupKey("abc", "z@y.com"),
  "distinct",
);

console.log("\n=== 12. Last contact per person ===");
const msgs: ClassifiedMessage[] = [
  { messageId: "a", threadId: null, direction: "email_out", counterparties: ["x@y.com"], subject: "first", occurredAt: new Date("2026-09-01T00:00:00Z") },
  { messageId: "b", threadId: null, direction: "email_in", counterparties: ["x@y.com"], subject: "newest", occurredAt: new Date("2026-09-10T00:00:00Z") },
  { messageId: "c", threadId: null, direction: "email_out", counterparties: ["x@y.com", "q@y.com"], subject: "middle", occurredAt: new Date("2026-09-05T00:00:00Z") },
];
const latest = latestByCounterparty(msgs);
check("newest wins regardless of input order", latest.get("x@y.com")?.subject === "newest", String(latest.get("x@y.com")?.subject));
check("direction of the newest is kept", latest.get("x@y.com")?.direction === "email_in", String(latest.get("x@y.com")?.direction));
check("a second recipient gets its own entry", latest.get("q@y.com")?.subject === "middle", String(latest.get("q@y.com")?.subject));
check("nobody invented", latest.size === 2, String(latest.size));

console.log("\n=== 13. Write planning — the real privacy boundary ===");
const CONTACTS = new Map([
  ["ryans2011@yahoo.com", "contact-ryan"],
  ["mick-torres@hotmail.com", "contact-miguel"],
]);
const planned = planActivityRows([
  { messageId: "p1", threadId: "t1", direction: "email_out", counterparties: ["ryans2011@yahoo.com"], subject: "3 Duquesne St", occurredAt: new Date("2026-08-29T00:00:00Z") },
  { messageId: "p2", threadId: "t2", direction: "email_in", counterparties: ["stranger@nowhere.com"], subject: "hello", occurredAt: new Date("2026-09-01T00:00:00Z") },
  { messageId: "p3", threadId: "t3", direction: "email_out", counterparties: ["mick-torres@hotmail.com", "claudia@locationtitle.com"], subject: "83 Lamson", occurredAt: new Date("2026-09-16T00:00:00Z") },
], CONTACTS);

check("a known contact produces a row", planned.rows.some((r) => r.contactId === "contact-ryan"), String(planned.rows.length));
check("A STRANGER PRODUCES NOTHING", !planned.rows.some((r) => r.metadata.counterparty === "stranger@nowhere.com"), "no row");
check("an unmatched party on a matched message is skipped", !planned.rows.some((r) => r.metadata.counterparty === "claudia@locationtitle.com"), "no row");
check("the matched party on that message is kept", planned.rows.some((r) => r.contactId === "contact-miguel"), "kept");
check("exactly two rows from three messages", planned.rows.length === 2, String(planned.rows.length));
check("unmatched addresses are reported back", planned.unmatched.length === 2, planned.unmatched.join("|"));
check("NO BODY is ever planned", !planned.rows.some((r) => "body" in r), "subject only");
check("applicationId is never guessed", !planned.rows.some((r) => "applicationId" in r), "contact-linked only");
check("kind mirrors direction", planned.rows[0].kind === "email_out", planned.rows[0].kind);

// The same message arriving twice in one batch must not break the insert.
const dupes = planActivityRows([
  { messageId: "same", threadId: null, direction: "email_out", counterparties: ["ryans2011@yahoo.com"], subject: "x", occurredAt: new Date() },
  { messageId: "same", threadId: null, direction: "email_out", counterparties: ["ryans2011@yahoo.com"], subject: "x", occurredAt: new Date() },
], CONTACTS);
check("DUPLICATE inside one batch collapses", dupes.rows.length === 1, String(dupes.rows.length));

// Case folding: Gmail hands back mixed case, contacts are stored lowercased.
const cased = planActivityRows([
  { messageId: "c1", threadId: null, direction: "email_in", counterparties: ["RyanS2011@Yahoo.com"], subject: "x", occurredAt: new Date() },
], CONTACTS);
check("uppercase address still matches", cased.rows.length === 1, String(cased.rows.length));

check("empty input is safe", planActivityRows([], CONTACTS).rows.length === 0, "0");
check("empty contact map writes nothing", planActivityRows([
  { messageId: "z", threadId: null, direction: "email_in", counterparties: ["a@b.com"], subject: null, occurredAt: new Date() },
], new Map()).rows.length === 0, "0 — fails closed");

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail > 0 ? 1 : 0);
