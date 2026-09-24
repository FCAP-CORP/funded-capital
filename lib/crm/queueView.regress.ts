/**
 * Regression suite for the dashboard's in-place queue controls.
 *
 * Covers the parts that go wrong quietly: which day a snooze button says it
 * lands on (in New York, not in UTC and not in the browser's zone), the
 * put-down heading, which rows carry the "wrote back" badge, and the wording
 * that keeps a "log a call" button from ever being mistaken for "make a call".
 *
 * `now` is fixed so the suite means the same thing every day it runs.
 */

import {
  LOG_ACTIONS,
  nyDayLabel,
  nyWallClockAsUtc,
  putDownHeading,
  queueRows,
  snoozeOptions,
  stageOptions,
} from "./queueView";
import { snoozePresets, parseSnoozeDate } from "./followup";
import {
  buildWorkQueue,
  snoozedItems,
  snoozesBrokenByInbound,
  QUEUE_DEFAULTS,
  type DashboardApplication,
} from "./dashboard";
import { STAGE_ORDER } from "./view";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};

/** Thursday 24 September 2026, 15:00 UTC — 11:00 in New York, same calendar day. */
const NOW = new Date("2026-09-24T15:00:00.000Z");
/** 02:30 UTC on Thursday 24 Sep is 22:30 on WEDNESDAY 23 Sep in New York. */
const NY_EVENING = new Date("2026-09-24T02:30:00.000Z");
/** 21:30 UTC — evening in UTC, still 17:30 the same day in New York. */
const UTC_EVENING = new Date("2026-09-23T21:30:00.000Z");

const daysAgo = (n: number, from = NOW) => new Date(from.getTime() - n * 86_400_000).toISOString();
const inDays = (n: number, from = NOW) => new Date(from.getTime() + n * 86_400_000).toISOString();

function app(over: Partial<DashboardApplication> = {}): DashboardApplication {
  return {
    id: over.id ?? "a",
    stage: "qualified",
    stageEnteredAt: daysAgo(2),
    submittedAt: daysAgo(10),
    createdAt: daysAgo(10),
    requestedAmount: "250000",
    contactId: `c-${over.id ?? "a"}`,
    name: "Test Borrower",
    email: "t@example.com",
    fundedAt: null,
    decisionedAt: null,
    termSheetIssuedAt: null,
    termSheetSignedAt: null,
    lastContactAt: daysAgo(1),
    lastContactDirection: "email_out",
    nextActionAt: null,
    nextActionSetAt: null,
    nextActionNote: null,
    ...over,
  };
}

console.log("\n=== 1. Day labels are New York days ===");
check("a plain day reads weekday, day, month", nyDayLabel("2026-10-01T13:00:00Z", NOW) === "Thu 1 Oct", nyDayLabel("2026-10-01T13:00:00Z", NOW));
check("02:30 UTC Thursday is still Wednesday in New York", nyDayLabel("2026-09-24T02:30:00Z", NOW) === "Wed 23 Sep", nyDayLabel("2026-09-24T02:30:00Z", NOW));
check("04:30 UTC is New York midnight-thirty, the new day", nyDayLabel("2026-09-24T04:30:00Z", NOW) === "Thu 24 Sep", nyDayLabel("2026-09-24T04:30:00Z", NOW));
check("winter time is handled (EST, UTC-5)", nyDayLabel("2026-12-02T04:30:00Z", NOW) === "Tue 1 Dec", nyDayLabel("2026-12-02T04:30:00Z", NOW));
check("next year's date carries the year", nyDayLabel("2027-01-01T13:00:00Z", NOW) === "Fri 1 Jan 2027", nyDayLabel("2027-01-01T13:00:00Z", NOW));
check("junk reads as a dash, does not throw", nyDayLabel("whenever", NOW) === "—", nyDayLabel("whenever", NOW));
check("null reads as a dash", nyDayLabel(null, NOW) === "—", "—");

console.log("\n=== 2. The New York wall clock ===");
check("22:30 Wed in New York reads as 22:30 Wed", nyWallClockAsUtc(NY_EVENING).toISOString() === "2026-09-23T22:30:00.000Z", nyWallClockAsUtc(NY_EVENING).toISOString());
check("11:00 in New York reads as 11:00", nyWallClockAsUtc(NOW).toISOString() === "2026-09-24T11:00:00.000Z", nyWallClockAsUtc(NOW).toISOString());
check("New York midnight reads as 00:00, not 24:00", nyWallClockAsUtc(new Date("2026-09-24T04:00:00Z")).toISOString() === "2026-09-24T00:00:00.000Z", nyWallClockAsUtc(new Date("2026-09-24T04:00:00Z")).toISOString());

console.log("\n=== 3. Snooze buttons: daytime ===");
const day = snoozeOptions(NOW);
check("five options", day.length === 5, `${day.length}`);
check("labels come from snoozePresets unchanged", day.map((o) => o.label).join("|") === snoozePresets(NOW).map((p) => p.label).join("|"), day.map((o) => o.label).join("|"));
check("in the daytime they match the raw presets exactly", day.every((o, i) => o.iso === snoozePresets(NOW)[i].iso), "same instants");
check("Tomorrow is Friday", day[0].text === "Tomorrow · Fri 25 Sep", day[0].text);
check("In 3 days is Sunday", day[1].text === "In 3 days · Sun 27 Sep", day[1].text);
check("Next week is Thursday 1 Oct", day[2].text === "Next week · Thu 1 Oct", day[2].text);
check("In 2 weeks is Thursday 8 Oct", day[3].text === "In 2 weeks · Thu 8 Oct", day[3].text);
check("In a month is Saturday 24 Oct", day[4].text === "In a month · Sat 24 Oct", day[4].text);
check("each lands 09:00 New York (13:00 UTC, summer)", day.every((o) => o.iso.endsWith("T13:00:00.000Z")), day.map((o) => o.iso.slice(11, 16)).join(","));
check("every option passes the server's own validation", day.every((o) => parseSnoozeDate(o.iso, NOW).ok), "accepted");

console.log("\n=== 4. Snooze buttons: evening in New York, next day in UTC ===");
const eve = snoozeOptions(NY_EVENING);
check("Wednesday 22:30 NY: Tomorrow is THURSDAY", eve[0].text === "Tomorrow · Thu 24 Sep", eve[0].text);
// snoozePresets used to count UTC days and said Friday here. It was fixed at
// the source on 24 Sep 2026; the buttons and the function must now agree, so a
// regression in either shows up as a disagreement.
check("the raw presets agree with the buttons (fixed at the source)", nyDayLabel(snoozePresets(NY_EVENING)[0].iso, NY_EVENING) === "Thu 24 Sep" && snoozePresets(NY_EVENING)[0].iso === eve[0].iso, nyDayLabel(snoozePresets(NY_EVENING)[0].iso, NY_EVENING));
check("Next week is Wednesday 30 Sep", eve[2].text === "Next week · Wed 30 Sep", eve[2].text);
check("every evening option is in the real future", eve.every((o) => Date.parse(o.iso) > NY_EVENING.getTime()), "future");
check("every evening option passes the server's validation", eve.every((o) => parseSnoozeDate(o.iso, NY_EVENING).ok), "accepted");
check("the label is the day the instant falls on in New York", eve.every((o) => o.day === nyDayLabel(o.iso, NY_EVENING)), "consistent");

console.log("\n=== 5. Snooze buttons: evening in UTC, same day in New York ===");
const ue = snoozeOptions(UTC_EVENING);
check("Wednesday 17:30 NY: Tomorrow is Thursday", ue[0].text === "Tomorrow · Thu 24 Sep", ue[0].text);
check("and agrees with the raw presets", ue.every((o, i) => o.iso === snoozePresets(UTC_EVENING)[i].iso), "same instants");

console.log("\n=== 6. Snooze buttons: New York winter ===");
const WINTER = new Date("2026-12-10T03:00:00.000Z"); // 22:00 Wed 9 Dec in New York
const win = snoozeOptions(WINTER);
check("Wednesday 22:00 EST: Tomorrow is Thursday 10 Dec", win[0].text === "Tomorrow · Thu 10 Dec", win[0].text);
check("the month option crosses into January with a year", win[4].text === "In a month · Fri 8 Jan 2027", win[4].text);
check("all winter options in the future", win.every((o) => Date.parse(o.iso) > WINTER.getTime()), "future");

console.log("\n=== 7. The put-down heading ===");
check("nothing put down: no heading at all", putDownHeading([], NOW) === null, String(putDownHeading([], NOW)));
check("one: '1 put down · back …'", putDownHeading([{ until: "2026-09-25T13:00:00Z" }], NOW) === "1 put down · back Fri 25 Sep", String(putDownHeading([{ until: "2026-09-25T13:00:00Z" }], NOW)));
const many = [
  { until: "2026-10-08T13:00:00Z" },
  { until: "2026-09-25T13:00:00Z" },
  { until: "2026-10-01T13:00:00Z" },
];
check("many: count and the SOONEST return", putDownHeading(many, NOW) === "3 put down · next back Fri 25 Sep", String(putDownHeading(many, NOW)));
check("order of input does not matter", putDownHeading([...many].reverse(), NOW) === putDownHeading(many, NOW), "stable");
check("an early-UTC return shows its New York day", putDownHeading([{ until: "2026-09-26T02:00:00Z" }], NOW) === "1 put down · back Fri 25 Sep", String(putDownHeading([{ until: "2026-09-26T02:00:00Z" }], NOW)));
check("junk dates still count, without a day", putDownHeading([{ until: "junk" }, { until: "nope" }], NOW) === "2 put down", String(putDownHeading([{ until: "junk" }, { until: "nope" }], NOW)));

// End-to-end with the real rules: six parked deals.
const parkedBook = [1, 2, 3, 4, 5, 6].map((n) =>
  app({ id: `p${n}`, name: `Parked ${n}`, nextActionAt: inDays(n), nextActionSetAt: daysAgo(1) }),
);
const parked = snoozedItems(parkedBook, NOW);
check("six real snoozes produce the six-count heading", putDownHeading(parked, NOW) === "6 put down · next back Fri 25 Sep", String(putDownHeading(parked, NOW)));

console.log("\n=== 8. The wrote-back badge ===");
// In the queue for its own reason (term sheet cold), snooze broken by an email.
const cold = app({
  id: "cold", name: "Cold Sheet", termSheetIssuedAt: daysAgo(20),
  nextActionAt: inDays(5), nextActionSetAt: daysAgo(3),
  lastContactAt: daysAgo(1), lastContactDirection: "email_in",
});
// Texted back after being put down: no queue reason of its own.
const texted = app({
  id: "texted", name: "Texted Back",
  nextActionAt: inDays(5), nextActionSetAt: daysAgo(3),
  lastContactAt: daysAgo(0), lastContactDirection: "sms_in",
});
// Still properly put down: the inbound came BEFORE the snooze.
const quiet = app({
  id: "quiet", name: "Still Parked",
  nextActionAt: inDays(5), nextActionSetAt: daysAgo(1),
  lastContactAt: daysAgo(2), lastContactDirection: "email_in",
});
// Never snoozed, in the queue because nobody ever wrote to them.
const fresh = app({ id: "fresh", name: "Never Touched", lastContactAt: null, lastContactDirection: null });
// Funded, snooze broken — servicing, never work.
const funded = app({
  id: "funded", name: "Funded Loan", stage: "funded",
  nextActionAt: inDays(5), nextActionSetAt: daysAgo(3),
  lastContactAt: daysAgo(0), lastContactDirection: "sms_in",
});

const book = [cold, texted, quiet, fresh, funded];
const queue = buildWorkQueue(book, QUEUE_DEFAULTS, NOW);
const broken = snoozesBrokenByInbound(book, NOW);
const rows = queueRows(queue, book, broken, NOW);
const byId = new Map(rows.map((r) => [r.applicationId, r]));

check("precondition: the texted-back deal is in NEITHER real list", !queue.some((q) => q.applicationId === "texted") && !snoozedItems(book, NOW).some((s) => s.applicationId === "texted"), "invisible without queueRows");
check("a queued deal whose snooze was broken gets the badge", byId.get("cold")?.wroteBack === true, String(byId.get("cold")?.wroteBack));
check("and keeps its own reason", byId.get("cold")?.reason === "term_sheet_cold", String(byId.get("cold")?.reason));
check("the texted-back deal is added to the table", byId.has("texted"), "present");
check("with the badge and no invented reason", byId.get("texted")?.wroteBack === true && byId.get("texted")?.reason === null, JSON.stringify(byId.get("texted")));
check("and it comes first", rows[0].applicationId === "texted", rows.map((r) => r.applicationId).join(","));
check("a deal still properly put down is not in the table", !byId.has("quiet"), "absent");
check("a deal in the queue with no snooze has no badge", byId.get("fresh")?.wroteBack === false, String(byId.get("fresh")?.wroteBack));
check("a funded loan never enters the table", !byId.has("funded"), "absent");
check("no deal appears twice", new Set(rows.map((r) => r.applicationId)).size === rows.length, `${rows.length}`);
check("every queue row survives, in order, after the added ones", rows.filter((r) => r.reason !== null).map((r) => r.applicationId).join(",") === queue.map((q) => q.applicationId).join(","), queue.map((q) => q.applicationId).join(","));
check("a broken id that is not in the book is ignored", queueRows(queue, book, [...broken, "ghost"], NOW).length === rows.length, "ignored");
check("empty book, empty table", queueRows([], [], [], NOW).length === 0, "0");

console.log("\n=== 9. Log buttons record, they never send ===");
check("three log buttons: call, email, text", LOG_ACTIONS.map((a) => a.kind).join(",") === "call,email_out,sms_out", LOG_ACTIONS.map((a) => a.kind).join(","));
check("every label starts with 'Log '", LOG_ACTIONS.every((a) => a.label.startsWith("Log ")), LOG_ACTIONS.map((a) => a.label).join(" | "));
check("no bare Call / Email / Text / Send label", LOG_ACTIONS.every((a) => !/^(call|email|text|sms|send)$/i.test(a.label.trim())), "none");
check("every hint says it does not send or place anything", LOG_ACTIONS.every((a) => /does not (place|send)/.test(a.hint)), "all say so");
check("a note is not a one-click log", !LOG_ACTIONS.some((a) => (a.kind as string) === "note"), "separate");

console.log("\n=== 10. Stage menu ===");
check("every stage, in pipeline order", stageOptions("lead").map((o) => o.value).join(",") === STAGE_ORDER.join(","), `${stageOptions("lead").length}`);
check("labels, not raw values", stageOptions("lead")[2].label === "Term Sheet Issued", stageOptions("lead")[2].label);
check("an unknown current stage stays selectable", stageOptions("mystery").some((o) => o.value === "mystery"), "kept");
check("a known stage is not duplicated", stageOptions("underwriting").filter((o) => o.value === "underwriting").length === 1, "once");

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail > 0 ? 1 : 0);
