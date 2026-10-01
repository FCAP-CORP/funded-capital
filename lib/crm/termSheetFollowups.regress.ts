/**
 * Regression suite for term-sheet follow-ups (lib/crm/termSheetFollowups.ts).
 *
 * What must never happen, in the order it would hurt:
 *   §1  a follow-up is offered to someone who replied, unsubscribed, has no
 *       address, was stopped, or whose deal already moved on;
 *   §2  the series runs out of order, repeats a step, or crowds a touch Luis
 *       just made himself;
 *   §3  a re-issued term sheet inherits the old series.
 */
import { EMAIL_TEMPLATES, fillTemplate, templateByKey } from "./emailTemplates";
import { parseEmailDraft } from "../comms/email";
import { CHECKIN_STEP, MIN_GAP_DAYS, NOT_NOW_DAYS, TS_SERIES, followupFor, isCheckin, isFollowupTemplate, sortDue, type FollowupStep, type TsDeal } from "./termSheetFollowups";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};

const NOW = new Date("2026-09-29T14:00:00.000Z");
const ago = (days: number, hours = 0) => new Date(NOW.getTime() - days * 86_400_000 - hours * 3_600_000).toISOString();
const ahead = (days: number) => new Date(NOW.getTime() + days * 86_400_000).toISOString();

const deal = (o: Partial<TsDeal> = {}): TsDeal => ({
  applicationId: "a1",
  stage: "term_sheet_issued",
  termSheetAt: ago(3),
  followupStoppedAt: null,
  snoozedUntil: null,
  email: "tony@example.com",
  emailSubscribed: null,
  lastInboundAt: null,
  lastOutboundAt: null,
  sent: [],
  ...o,
});
const state = (d: TsDeal) => {
  const r = followupFor(d, NOW);
  return r.state === "off" ? `off:${r.why}` : `${r.state}:${r.step.templateKey}`;
};

console.log("\n=== 1. Who is never offered a follow-up ===");
check("a term sheet 3 days old with no reply → ts-1 due", state(deal()) === "due:ts-1", state(deal()));
check("deal moved to signed → off", state(deal({ stage: "term_sheet_signed" })) === "off:not_at_term_sheet", state(deal({ stage: "term_sheet_signed" })));
check("deal lost → off", state(deal({ stage: "closed_lost" })) === "off:not_at_term_sheet", "");
check("still a lead → off", state(deal({ stage: "lead" })) === "off:not_at_term_sheet", "");
check("no term sheet date → off", state(deal({ termSheetAt: null })) === "off:no_date", "");
check("they emailed back after the term sheet → off", state(deal({ lastInboundAt: ago(1) })) === "off:replied", state(deal({ lastInboundAt: ago(1) })));
check("…a message from BEFORE the term sheet does not count as a reply", state(deal({ lastInboundAt: ago(10) })) === "due:ts-1", state(deal({ lastInboundAt: ago(10) })));
check("unsubscribed → off", state(deal({ emailSubscribed: false })) === "off:cannot_email", "");
check("no email → off", state(deal({ email: null })) === "off:cannot_email", "");
check("broken email → off", state(deal({ email: "tony at example" })) === "off:cannot_email", "");
check("Luis stopped it → off", state(deal({ followupStoppedAt: ago(1) })) === "off:stopped", "");
check("all four sent → off", state(deal({ termSheetAt: ago(30), sent: TS_SERIES.map((s, i) => ({ templateKey: s.templateKey, at: ago(28 - i * 5) })) })) === "off:finished", "");

console.log("\n=== 2. Order and spacing ===");
check("1 day after the term sheet: ts-1 is upcoming, not due", state(deal({ termSheetAt: ago(1) })) === "upcoming:ts-1", state(deal({ termSheetAt: ago(1) })));
const at2 = followupFor(deal({ termSheetAt: ago(2) }), NOW);
check("exactly 2 days: ts-1 due", at2.state === "due", at2.state);
check("ts-1 sent → ts-2 next, due on day 5", (() => {
  const r = followupFor(deal({ termSheetAt: ago(4), sent: [{ templateKey: "ts-1", at: ago(2) }], lastOutboundAt: ago(2) }), NOW);
  return r.state === "upcoming" && r.step.templateKey === "ts-2" && r.dueAt === ago(-1);
})(), "");
check("ts-2 due on day 6 after ts-1 on day 2", state(deal({ termSheetAt: ago(6), sent: [{ templateKey: "ts-1", at: ago(4) }], lastOutboundAt: ago(4) })) === "due:ts-2", "");
check("a step is never offered twice", state(deal({ termSheetAt: ago(6), sent: [{ templateKey: "ts-1", at: ago(4) }, { templateKey: "ts-2", at: ago(1) }], lastOutboundAt: ago(1) })) === "upcoming:ts-3", "");
check("steps skipped (ts-2 sent by hand) → next is ts-3", state(deal({ termSheetAt: ago(12), sent: [{ templateKey: "ts-2", at: ago(5) }], lastOutboundAt: ago(5) })) === "due:ts-3", "");
const call = followupFor(deal({ termSheetAt: ago(6), sent: [{ templateKey: "ts-1", at: ago(4) }], lastOutboundAt: ago(0, 3) }), NOW);
check(`Luis called 3 hours ago → ts-2 waits ${MIN_GAP_DAYS} days from the call`, call.state === "upcoming" && call.dueAt === new Date(Date.parse(ago(0, 3)) + MIN_GAP_DAYS * 86_400_000).toISOString(), call.state);
const snoozed = followupFor(deal({ snoozedUntil: ahead(NOT_NOW_DAYS) }), NOW);
check(`"Not now" (${NOT_NOW_DAYS} days) hides it until then`, snoozed.state === "upcoming" && snoozed.dueAt === ahead(NOT_NOW_DAYS), snoozed.state);
check("an expired snooze does not hold it back", state(deal({ snoozedUntil: ago(1) })) === "due:ts-1", "");
check("other templates never count as series steps", state(deal({ sent: [{ templateKey: "term-sheet", at: ago(1) }], lastOutboundAt: ago(1) })) === "upcoming:ts-1", "");
check("days since term sheet is reported", (() => { const r = followupFor(deal({ termSheetAt: ago(9) }), NOW); return r.state !== "off" && r.daysSinceTermSheet === 9; })(), "");

console.log("\n=== 3. A re-issued term sheet starts again ===");
check("ts-1..ts-3 sent for an OLD term sheet → the new one starts at ts-1", state(deal({ termSheetAt: ago(3), sent: [{ templateKey: "ts-1", at: ago(20) }, { templateKey: "ts-2", at: ago(17) }, { templateKey: "ts-3", at: ago(12) }] })) === "due:ts-1", "");
check("a stop for the OLD term sheet does not stop the new one", state(deal({ termSheetAt: ago(3), followupStoppedAt: ago(10) })) === "due:ts-1", "");
check("a reply to the OLD term sheet does not stop the new one", state(deal({ termSheetAt: ago(3), lastInboundAt: ago(5) })) === "due:ts-1", "");

console.log("\n=== 4. The emails themselves ===");
for (const s of TS_SERIES) {
  const t = EMAIL_TEMPLATES.find((x) => x.key === s.templateKey);
  check(`${s.templateKey} exists in the record card's templates`, !!t, "");
  if (!t) continue;
  const f = fillTemplate(t, { firstName: "Tony", street: "358 Cozart Ave SW", address: "358 Cozart Ave SW, Concord NC", program: "Fix & Flip", senderFirstName: "Luis" });
  check(`${s.templateKey} passes the send rules`, parseEmailDraft(f.subject, f.body).ok, f.subject);
  check(`${s.templateKey} names the property`, f.body.includes("358 Cozart Ave SW"), "");
}
check("isFollowupTemplate", isFollowupTemplate("ts-3") && !isFollowupTemplate("term-sheet") && !isFollowupTemplate(null), "");
check("the series is spaced out and in order", TS_SERIES.every((s, i) => i === 0 || s.afterDays > TS_SERIES[i - 1].afterDays), TS_SERIES.map((s) => s.afterDays).join(","));

console.log("\n=== 5. Sorting ===");
const S1 = TS_SERIES[0];
type Row = { id: string; dueAt: string; daysSinceTermSheet: number; step: FollowupStep };
const sorted = sortDue<Row>([
  { id: "a", dueAt: ago(1), daysSinceTermSheet: 3, step: S1 },
  { id: "b", dueAt: ago(1), daysSinceTermSheet: 12, step: S1 },
  { id: "c", dueAt: ago(2), daysSinceTermSheet: 3, step: S1 },
]);
check("longest-waiting term sheet first, then earliest due", sorted.map((x) => x.id).join("") === "bca", sorted.map((x) => x.id).join(""));
const mixed = sortDue<Row>([
  { id: "old400", dueAt: ago(1), daysSinceTermSheet: 400, step: CHECKIN_STEP },
  { id: "live5", dueAt: ago(1), daysSinceTermSheet: 5, step: TS_SERIES[1] },
  { id: "old40", dueAt: ago(1), daysSinceTermSheet: 40, step: CHECKIN_STEP },
  { id: "live12", dueAt: ago(1), daysSinceTermSheet: 12, step: TS_SERIES[2] },
]);
check("live term sheets come before old check-ins; old ones newest first", mixed.map((x) => x.id).join(",") === "live12,live5,old40,old400", mixed.map((x) => x.id).join(","));

console.log("\n=== 6. Catch-up and old term sheets (1 Oct 2026) ===");
check("12 days, nothing sent → ts-3 (catch up), never 'did it arrive?' late", state(deal({ termSheetAt: ago(12) })) === "due:ts-3", state(deal({ termSheetAt: ago(12) })));
check("6 days, nothing sent → ts-2", state(deal({ termSheetAt: ago(6) })) === "due:ts-2", state(deal({ termSheetAt: ago(6) })));
check("20 days, ts-1 sent → ts-4 (skips ts-2 and ts-3)", state(deal({ termSheetAt: ago(20), sent: [{ templateKey: "ts-1", at: ago(18) }] })) === "due:ts-4", state(deal({ termSheetAt: ago(20), sent: [{ templateKey: "ts-1", at: ago(18) }] })));
check("12 days, ts-3 already sent → ts-4 upcoming (not due till day 17)", state(deal({ termSheetAt: ago(12), sent: [{ templateKey: "ts-3", at: ago(1) }] })) === "upcoming:ts-4", state(deal({ termSheetAt: ago(12), sent: [{ templateKey: "ts-3", at: ago(1) }] })));
check("172 days old, nothing sent → one check-in, not ts-1", state(deal({ termSheetAt: ago(172) })) === "due:ts-checkin", state(deal({ termSheetAt: ago(172) })));
check("31 days → check-in", state(deal({ termSheetAt: ago(31) })) === "due:ts-checkin", state(deal({ termSheetAt: ago(31) })));
check("30 days exactly → still the series (ts-4)", state(deal({ termSheetAt: ago(30) })) === "due:ts-4", state(deal({ termSheetAt: ago(30) })));
check("after the check-in is sent → nothing more", state(deal({ termSheetAt: ago(172), sent: [{ templateKey: "ts-checkin", at: ago(3) }] })) === "off:finished", "");
check("a check-in sent for an EARLIER term sheet does not count", state(deal({ termSheetAt: ago(60), sent: [{ templateKey: "ts-checkin", at: ago(90) }] })) === "due:ts-checkin", "");
check("series already closed the loop (ts-4 sent) → no check-in", state(deal({ termSheetAt: ago(45), sent: [{ templateKey: "ts-4", at: ago(28) }] })) === "off:finished", "");
check("an old term sheet whose borrower replied → off", state(deal({ termSheetAt: ago(172), lastInboundAt: ago(100) })) === "off:replied", "");
check("an old term sheet, called yesterday → check-in waits the 2-day gap", state(deal({ termSheetAt: ago(172), lastOutboundAt: ago(1) })) === "upcoming:ts-checkin", state(deal({ termSheetAt: ago(172), lastOutboundAt: ago(1) })));
check("the check-in is a follow-up template and is counted", isFollowupTemplate("ts-checkin") && isCheckin(CHECKIN_STEP) && !isCheckin(TS_SERIES[3]), "");
const ck = templateByKey("ts-checkin");
check("ts-checkin exists in the record card's templates", !!ck, "");
if (ck) {
  const f = fillTemplate(ck, { firstName: "Sarah", street: "12 Elm St", address: "12 Elm St, Tampa FL", program: "Fix & Flip", senderFirstName: "Luis" });
  check("...asks how it turned out and invites the next deal", /How did 12 Elm St turn out\?/.test(f.subject) && /working on something new/.test(f.body), f.subject);
  check("...and never says the term sheet just went out", !/reached you|did it arrive|just sent/i.test(f.body), "");
}

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail > 0 ? 1 : 0);
