/**
 * Regression suite for the dashboard's numbers, calendars and wording.
 *
 * WHAT THIS PROTECTS. A dashboard is read, not checked. A week boundary taken
 * in UTC, a month comparison that quietly compares 24 days with 31, a funded
 * total of "$0" that is really "never recorded" — none of those throw, and all
 * of them read like facts about the business. Every one is pinned here.
 *
 * `now` is fixed so the suite means the same thing on any day it runs. The
 * daylight-saving cases use the real 2026 changeovers: 8 March (spring
 * forward) and 1 November (fall back), both Sundays.
 */

import {
  addDays,
  attention,
  buildDashboardModel,
  compactMoney,
  dateLine,
  dueTasks,
  followUpsLine,
  followUpsToday,
  fundedKpi,
  fundedYearToDate,
  greeting,
  initials,
  leadSourceMix,
  mondayOf,
  nyClock,
  nyMidnight,
  openFilesByApplication,
  openPipelineKpi,
  percentages,
  queueTabs,
  sourceGroup,
  stageBars,
  subLine,
  submittedKpi,
  submittedMonthToDate,
  termSheetKpi,
  trendPeak,
  waitTone,
  weeklyTrend,
  type DashboardRow,
  type DueTaskInput,
  type QueueTab,
} from "./dashboardView";
import type { QueueRowView } from "./queueView";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};
const eq = (name: string, got: unknown, want: unknown) =>
  check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

/** Thursday 24 September 2026, 09:30 in New York (13:30 UTC, EDT). */
const NOW = new Date("2026-09-24T13:30:00.000Z");
const at = (iso: string) => new Date(iso);

let seq = 0;
function row(over: Partial<DashboardRow> = {}): DashboardRow {
  seq++;
  return {
    id: `app-${seq}`,
    stage: "lead",
    stageEnteredAt: "2026-09-20T12:00:00.000Z",
    submittedAt: "2026-09-20T12:00:00.000Z",
    createdAt: "2026-09-20T12:00:00.000Z",
    requestedAmount: "100000",
    contactId: `c-${seq}`,
    name: `Borrower ${seq}`,
    email: `b${seq}@example.com`,
    fundedAt: null,
    decisionedAt: null,
    termSheetIssuedAt: null,
    termSheetSignedAt: null,
    lastContactAt: "2026-09-23T12:00:00.000Z",
    lastContactDirection: "email_out",
    nextActionAt: null,
    nextActionSetAt: null,
    nextActionNote: null,
    leadSource: "website",
    firstTermSheetAt: null,
    ...over,
  };
}

/* ======================================================================= */
console.log("\n=== 1. The New York calendar ===");

eq("nyClock: 03:30 UTC on the 24th is 23:30 on the 23rd in New York",
  nyClock(at("2026-09-24T03:30:00Z")), { year: 2026, month: 9, day: 23, hour: 23, minute: 30, second: 0 });
eq("nyMidnight in summer is 04:00 UTC", nyMidnight("2026-09-24").toISOString(), "2026-09-24T04:00:00.000Z");
eq("nyMidnight in winter is 05:00 UTC", nyMidnight("2026-01-15").toISOString(), "2026-01-15T05:00:00.000Z");
eq("nyMidnight on fall-back day (1 Nov) is still EDT at midnight", nyMidnight("2026-11-01").toISOString(), "2026-11-01T04:00:00.000Z");
eq("nyMidnight the day after fall-back is EST", nyMidnight("2026-11-02").toISOString(), "2026-11-02T05:00:00.000Z");
eq("nyMidnight on spring-forward day (8 Mar) is EST at midnight", nyMidnight("2026-03-08").toISOString(), "2026-03-08T05:00:00.000Z");
eq("nyMidnight the day after spring-forward is EDT", nyMidnight("2026-03-09").toISOString(), "2026-03-09T04:00:00.000Z");
eq("mondayOf a Thursday", mondayOf("2026-09-24"), "2026-09-21");
eq("mondayOf a Monday is itself", mondayOf("2026-09-21"), "2026-09-21");
eq("mondayOf a Sunday is the Monday BEFORE (weeks run Mon–Sun)", mondayOf("2026-09-27"), "2026-09-21");
eq("mondayOf the fall-back Sunday", mondayOf("2026-11-01"), "2026-10-26");
eq("mondayOf across a year end", mondayOf("2027-01-01"), "2026-12-28");
eq("addDays across a month end", addDays("2026-09-28", 5), "2026-10-03");
eq("addDays backwards across a year end", addDays("2027-01-02", -3), "2026-12-30");
eq("addDays over 29 Feb in a leap year", addDays("2028-02-28", 1), "2028-02-29");

/* ======================================================================= */
console.log("\n=== 2. Greeting and date line, by the New York clock ===");

eq("09:30 EDT is morning", greeting(NOW, "Luis"), "Good morning, Luis");
eq("10:30 EDT is morning, though it is 14:30 in UTC", greeting(at("2026-09-24T14:30:00Z"), "Luis"), "Good morning, Luis");
eq("11:59 EDT is still morning", greeting(at("2026-09-24T15:59:00Z"), "Luis"), "Good morning, Luis");
eq("12:00 EDT is afternoon", greeting(at("2026-09-24T16:00:00Z"), "Luis"), "Good afternoon, Luis");
eq("16:59 EDT is afternoon", greeting(at("2026-09-24T20:59:00Z"), "Luis"), "Good afternoon, Luis");
eq("17:00 EDT is evening", greeting(at("2026-09-24T21:00:00Z"), "Luis"), "Good evening, Luis");
eq("23:30 EDT is evening, though it is already tomorrow in UTC", greeting(at("2026-09-25T03:30:00Z"), "Luis"), "Good evening, Luis");
eq("04:59 EDT is still evening (never 'good morning' at 1am)", greeting(at("2026-09-24T08:59:00Z"), "Luis"), "Good evening, Luis");
eq("05:00 EDT is morning", greeting(at("2026-09-24T09:00:00Z"), "Luis"), "Good morning, Luis");
eq("winter: 16:30 UTC is 11:30 EST — morning (it would be afternoon in EDT)",
  greeting(at("2026-12-10T16:30:00Z"), "Luis"), "Good morning, Luis");
eq("no first name: no dangling comma", greeting(NOW, null), "Good morning");
eq("a blank first name counts as none", greeting(NOW, "   "), "Good morning");
eq("a first name is trimmed", greeting(NOW, " Luis "), "Good morning, Luis");
eq("date line", dateLine(NOW), "Thursday, September 24");
eq("date line at 22:00 EDT is still Thursday (02:00 UTC Friday)", dateLine(at("2026-09-25T02:00:00Z")), "Thursday, September 24");

/* ======================================================================= */
console.log("\n=== 3. Compact money ===");

eq("$14.76M", compactMoney(14_760_000), "$14.76M");
eq("a numeric string from Postgres", compactMoney("14760000.00"), "$14.76M");
eq("$950K", compactMoney(950_000), "$950K");
eq("$12.5K keeps one decimal below $100K", compactMoney(12_500), "$12.5K");
eq("$100K drops it", compactMoney(100_000), "$100K");
eq("$0 for zero", compactMoney(0), "$0");
eq("$0 for null", compactMoney(null), "$0");
eq("$0 for garbage", compactMoney("abc"), "$0");
eq("under $1K is whole dollars", compactMoney(640), "$640");
eq("trailing zeros dropped: $2M, not $2.00M", compactMoney(2_000_000), "$2M");
eq("$999,999 promotes to $1M, never $1000K", compactMoney(999_999), "$1M");
eq("$999.60 promotes to $1K", compactMoney(999.6), "$1K");
eq("billions", compactMoney(1_500_000_000), "$1.5B");
eq("negative keeps its sign in front of the dollar", compactMoney(-250_000), "-$250K");

/* ======================================================================= */
console.log("\n=== 4. Submitted this month, against last month by the same point ===");
{
  const apps = [
    row({ submittedAt: "2026-09-01T04:30:00Z" }), // Sep 1 00:30 EDT — this month
    row({ submittedAt: "2026-09-01T03:30:00Z" }), // Aug 31 23:30 EDT — LAST month (UTC says September)
    row({ submittedAt: "2026-09-24T13:00:00Z" }), // today, before now
    row({ submittedAt: "2026-09-24T14:00:00Z" }), // today, after now — typo/future, excluded
    row({ submittedAt: "2026-08-24T13:00:00Z" }), // Aug 24 09:00 EDT — before the same point: counts
    row({ submittedAt: "2026-08-24T14:00:00Z" }), // Aug 24 10:00 EDT — after the same point: not
    row({ submittedAt: "2026-08-01T04:00:00Z" }), // Aug 1 00:00 EDT exactly — counts
    row({ submittedAt: null, createdAt: "2026-09-10T12:00:00Z" }), // no submitted date: created counts
    row({ submittedAt: "2026-07-15T12:00:00Z" }), // the book reaches back before August
  ];
  const m = submittedMonthToDate(apps, NOW);
  eq("this month counts on the NY calendar, created_at as fallback, future excluded", m.count, 3);
  // Aug 1 00:00 and Aug 24 09:00 count; Aug 24 10:00 and Aug 31 23:30 are past the point.
  eq("last month to the same point (Aug 1 00:00 → Aug 24 09:30 EDT)", m.lastMonthSamePoint, 2);
  eq("kpi sub compares", submittedKpi(m).sub, "vs 2 by this point last month");

  const young = submittedMonthToDate(apps.filter((a) => (a.submittedAt ?? "") >= "2026-08-10"), NOW);
  eq("book starts mid-August: no comparison (it would flatter)", young.lastMonthSamePoint, null);
  eq("...and the card says only 'new applications'", submittedKpi(young).sub, "new applications");
  eq("singular", submittedKpi({ count: 1, lastMonthSamePoint: null }).sub, "new application");

  const exact = submittedMonthToDate([row({ submittedAt: "2026-08-01T04:00:00Z" })], NOW);
  eq("a book starting exactly at the top of last month is comparable", exact.lastMonthSamePoint, 1);

  // 31 October: September had no 31st, so the whole of September is the comparison.
  const oct31 = new Date("2026-10-31T16:00:00Z");
  const m31 = submittedMonthToDate([
    row({ submittedAt: "2026-10-01T03:00:00Z" }), // Sep 30 23:00 EDT
    row({ submittedAt: "2026-09-01T12:00:00Z" }),
    row({ submittedAt: "2026-08-01T12:00:00Z" }),
  ], oct31);
  eq("on the 31st after a 30-day month, all of last month counts", m31.lastMonthSamePoint, 2);
  eq("...and nothing is this month yet", m31.count, 0);

  // January compares with December of the previous year.
  const jan = submittedMonthToDate([
    row({ submittedAt: "2027-01-05T15:00:00Z" }),
    row({ submittedAt: "2026-12-05T15:00:00Z" }),
    row({ submittedAt: "2026-12-20T15:00:00Z" }), // after 10 Dec — not by the same point
    row({ submittedAt: "2026-11-01T15:00:00Z" }),
  ], new Date("2027-01-10T15:00:00Z"));
  eq("January: this month", jan.count, 1);
  eq("January: December to the 10th", jan.lastMonthSamePoint, 1);
  eq("empty book: zero, no comparison", submittedMonthToDate([], NOW), { count: 0, lastMonthSamePoint: null });
}

/* ======================================================================= */
console.log("\n=== 5. Open pipeline, term sheets, funded year to date ===");
{
  const book = [
    row({ stage: "lead", requestedAmount: "700000" }),
    row({ stage: "funded", requestedAmount: "300000" }), // open (being serviced) — counts
    row({ stage: "closed_lost", requestedAmount: "5000000" }), // terminal
    row({ stage: "payoff", requestedAmount: "5000000" }), // terminal
    row({ stage: "term_sheet_issued", requestedAmount: null }),
  ];
  eq("open pipeline = the Pipeline page's 'open' (not closed_lost, not payoff)", openPipelineKpi(book),
    { value: "$1M", sub: "requested across 3 open files", tone: "default" });
  eq("one open file is singular", openPipelineKpi([row()]).sub, "requested across 1 open file");
  eq("empty book", openPipelineKpi([]).value, "$0");

  eq("term sheets: issued counted, signed beside it", termSheetKpi([
    row({ stage: "term_sheet_issued" }), row({ stage: "term_sheet_issued" }),
    row({ stage: "term_sheet_signed" }), row({ stage: "lead" }),
  ]), { value: "2", sub: "issued, not yet signed · 1 signed", tone: "default" });

  const none = fundedYearToDate([row(), row()], NOW);
  eq("no funded date anywhere: not recorded", none, { count: 0, amount: 0, anyRecorded: false });
  eq("...shown in amber as missing data, not as a bad year", fundedKpi(none),
    { value: "$0", sub: "No funded dates recorded yet", tone: "warn" });

  const lastYear = fundedYearToDate([row({ fundedAt: "2025-06-01T12:00:00Z" })], NOW);
  eq("funded only last year: recorded, none this year", fundedKpi(lastYear),
    { value: "$0", sub: "none funded yet this year", tone: "default" });

  const ytd = fundedYearToDate([
    row({ fundedAt: "2026-03-01T12:00:00Z", requestedAmount: "700000" }),
    row({ fundedAt: "2026-09-01T12:00:00Z", requestedAmount: "500000" }),
    row({ fundedAt: "2026-01-01T03:00:00Z", requestedAmount: "9000000" }), // 31 Dec 2025 22:00 EST
    row({ fundedAt: "2026-12-01T12:00:00Z", requestedAmount: "9000000" }), // future: a typo
  ], NOW);
  eq("year to date counts from 1 Jan New York, not UTC, and ignores the future", ytd,
    { count: 2, amount: 1_200_000, anyRecorded: true });
  eq("...and reads as money", fundedKpi(ytd), { value: "$1.2M", sub: "2 loans funded", tone: "default" });
  eq("one loan is singular", fundedKpi({ count: 1, amount: 5e5, anyRecorded: true }).sub, "1 loan funded");
}

/* ======================================================================= */
console.log("\n=== 6. Queue tabs, row lines and the attention strip ===");
{
  const r = (reason: QueueRowView["reason"], waitingDays: number, name: string, wroteBack = false): QueueRowView => ({
    applicationId: `q-${name}`, name, email: null, stage: "lead", reason, waitingDays,
    requestedAmount: "700000", wroteBack,
  });
  const rows = [
    r(null, 3, "Wrote Back", true),
    r("awaiting_reply", 80, "Taha Sheikh"),
    r("duplicate", 2, "Dup Licate"),
    r("never_contacted", 40, "Never Called"),
    r("stalled", 64, "Slow Mover"),
    r("awaiting_reply", 28, "Joel Bailon"),
  ];
  const tabs = queueTabs(rows, new Map([["q-Taha Sheikh", 2]]));
  eq("tabs in priority order, empty term-sheet tab hidden, never-contacted BEFORE stalled",
    tabs.map((t) => `${t.reason}:${t.count}`),
    ["awaiting_reply:3", "duplicate:1", "never_contacted:1", "stalled:1"]);
  eq("a wrote-back row with no reason sits under 'Waiting on you'", tabs[0].rows.map((x) => x.name),
    ["Wrote Back", "Taha Sheikh", "Joel Bailon"]);
  eq("tab labels are the queue's own", tabs.map((t) => t.label),
    ["Waiting on you", "Possible duplicate", "Never contacted", "No movement"]);
  const taha = tabs[0].rows[1];
  eq("row card for Taha", [taha.initials, taha.sub, taha.waitLabel, taha.tone, taha.stageLabel, taha.amount],
    ["TS", "Wrote to you, no reply · 2 open files", "80 days", "red", "Lead", "$700,000"]);
  eq("wrote-back sub line", tabs[0].rows[0].sub, "Wrote back while snoozed");
  eq("no amount is null, not '$0'", queueTabs([{ ...rows[1], requestedAmount: null }], new Map())[0].rows[0].amount, null);
  eq("no rows, no tabs", queueTabs([], new Map()), []);

  const a = attention(tabs);
  check("attention: someone is waiting", a.kind === "waiting", a.kind);
  if (a.kind === "waiting") {
    eq("count matches the tab", a.count, 3);
    eq("the button opens the LONGEST waiting, not the first row", a.top.name, "Taha Sheikh");
    eq("headline", a.headline, "3 people are waiting on your reply");
    eq("detail", a.detail, "The longest has waited 80 days. Start there; the rest of the day is in the queue below.");
  }
  const one = attention(queueTabs([r("awaiting_reply", 1, "Solo Person")], new Map()));
  eq("singular headline and day", one.kind === "waiting" ? [one.headline, one.detail.split(".")[0]] : null,
    ["1 person is waiting on your reply", "The longest has waited 1 day"]);
  const fresh = attention(queueTabs([r(null, 0, "Just Wrote", true)], new Map()));
  eq("waited zero days reads as 'wrote today'", fresh.kind === "waiting" ? fresh.detail.split(" Start")[0] : null,
    "The longest wrote today.");

  const calm = attention(queueTabs([r("never_contacted", 9, "A B"), r("never_contacted", 3, "C D"), r("stalled", 40, "E F")], new Map()));
  eq("nobody waiting: calm, and names the next thing", calm,
    { kind: "calm", headline: "Nobody is waiting on a reply.", detail: "Next: 2 borrowers never contacted." });
  eq("calm with a single term sheet", attention(queueTabs([r("term_sheet_cold", 9, "A B")], new Map())).detail,
    "Next: 1 term sheet going cold.");
  eq("empty queue: calm and clear", attention([] as QueueTab[]),
    { kind: "calm", headline: "Nobody is waiting on a reply.", detail: "The queue is clear." });

  eq("wait tone: 13 plain, 14 amber, 29 amber, 30 red",
    [waitTone(13), waitTone(14), waitTone(29), waitTone(30)], ["plain", "amber", "amber", "red"]);
  eq("initials", [initials("Taha Sheikh"), initials("David Birmann Pereira"), initials("Madonna"), initials("(unlinked)"), initials("josé álvarez"), initials("")],
    ["TS", "DP", "M", "?", "JÁ", "?"]);
  eq("sub line: one open file adds nothing", subLine({ reason: "stalled" }, 1), "Same stage 30+ days");

  const files = openFilesByApplication([
    row({ id: "x1", contactId: "same", stage: "lead" }),
    row({ id: "x2", contactId: "same", stage: "qualified" }),
    row({ id: "x3", contactId: "same", stage: "closed_lost" }),
    row({ id: "x4", contactId: null }),
  ]);
  eq("open files per contact: lost deals do not count, unlinked is zero",
    [files.get("x1"), files.get("x2"), files.get("x3"), files.get("x4")], [2, 2, 2, 0]);
}

/* ======================================================================= */
console.log("\n=== 7. Due today: overdue first, New York days ===");
{
  const t = (id: string, dueOn: string | null, title = id): DueTaskInput => ({ id, title, dueOn, applicationId: "a", borrower: "B" });
  const tasks = [t("today", "2026-09-24"), t("two", "2026-09-22"), t("one", "2026-09-23"), t("tomorrow", "2026-09-25"), t("undated", null), t("bad", "2026-02-30")];
  const d = dueTasks(tasks, NOW);
  eq("overdue first (most overdue at the top), then today; future, undated and invalid left out",
    d.map((x) => `${x.id}:${x.when}`), ["two:overdue 2 days", "one:overdue 1 day", "today:due today"]);
  const late = dueTasks(tasks, at("2026-09-25T02:00:00Z")); // 22:00 EDT on the 24th
  eq("at 10pm Eastern the 24th is still today — UTC would already call it overdue",
    late.find((x) => x.id === "today")?.when, "due today");
  check("...and the 25th is not yet due", !late.some((x) => x.id === "tomorrow"), late.map((x) => x.id).join(","));
  eq("nothing due", dueTasks([], NOW), []);

  const f = followUpsToday([
    row({ nextActionAt: "2026-09-24T13:00:00Z" }),
    row({ nextActionAt: "2026-09-25T03:00:00Z" }), // 23:00 EDT on the 24th — still today in NY
    row({ nextActionAt: "2026-09-25T13:00:00Z" }), // tomorrow
    row({ nextActionAt: "2026-09-24T13:00:00Z", stage: "funded" }), // servicing: not queue work
    row({ nextActionAt: "2026-09-24T13:00:00Z", stage: "closed_lost" }),
    row({ nextActionAt: null }),
  ], NOW);
  eq("follow-ups coming back today (NY day, deals still being worked)", f, 2);
  eq("follow-up wording, plural", followUpsLine(3), { lead: "3 follow-ups", rest: "come back today" });
  eq("follow-up wording, singular", followUpsLine(1), { lead: "1 follow-up", rest: "comes back today" });
}

/* ======================================================================= */
console.log("\n=== 8. Pipeline by stage ===");
{
  const book = [
    ...Array.from({ length: 10 }, () => row({ stage: "lead" })),
    ...Array.from({ length: 5 }, () => row({ stage: "qualified" })),
    row({ stage: "term_sheet_issued" }),
    row({ stage: "underwriting" }), row({ stage: "docs_out" }),
    row({ stage: "funded" }), row({ stage: "closed_lost" }),
  ];
  const bars = stageBars(book);
  eq("six rows, late stages folded into one", bars.map((b) => `${b.label}=${b.count}`),
    ["Lead=10", "Qualified=5", "Term Sheet Issued=1", "Term Sheet Signed=0", "Application In=0", "Underwriting → Docs Out=2"]);
  eq("tones: term sheets gold, empties empty, the rest navy", bars.map((b) => b.tone),
    ["navy", "navy", "gold", "empty", "empty", "navy"]);
  eq("scaled against the busiest row", bars.map((b) => b.pct), [100, 50, 10, 0, 0, 20]);
  eq("the folded row names its members", bars[5].members.length, 5);
  const empty = stageBars([]);
  check("an empty book still draws every row, with no NaN", empty.length === 6 && empty.every((b) => b.pct === 0 && b.tone === "empty"),
    JSON.stringify(empty.map((b) => b.pct)));
}

/* ======================================================================= */
console.log("\n=== 9. Where leads came from ===");
{
  eq("source grouping", ["website", "biggerpockets", "broker", "referral", "linkedin", "unknown", null].map(sourceGroup),
    ["website", "biggerpockets", "broker", "other", "other", "other", "other"]);
  eq("percentages add to 100 (largest remainder)", percentages([1, 1, 1]), [34, 33, 33]);
  eq("a single source is 100%", percentages([4, 0, 0, 0]), [100, 0, 0, 0]);
  eq("nothing to divide: all zero, no NaN", percentages([0, 0, 0, 0]), [0, 0, 0, 0]);
  const odd = percentages([7, 5, 2, 1]);
  eq("awkward split still sums to 100", odd.reduce((s, n) => s + n, 0), 100);
  eq("...and each is within one point of exact", odd, [47, 33, 13, 7]);

  const mix = leadSourceMix([
    row({ leadSource: "website", submittedAt: "2026-09-20T12:00:00Z" }),
    row({ leadSource: "website", submittedAt: "2026-08-26T04:30:00Z" }), // Aug 26 00:30 EDT — first day of the window
    row({ leadSource: "biggerpockets", submittedAt: "2026-09-01T12:00:00Z" }),
    row({ leadSource: "broker", submittedAt: "2026-09-10T12:00:00Z" }),
    row({ leadSource: "referral", submittedAt: "2026-09-11T12:00:00Z" }),
    row({ leadSource: "website", submittedAt: "2026-08-26T03:30:00Z" }), // Aug 25 23:30 EDT — outside
    // Legacy import: created_at is the day the import ran, submitted is the real date — outside.
    row({ leadSource: "biggerpockets", submittedAt: "2025-11-02T12:00:00Z", createdAt: "2026-09-14T12:00:00Z" }),
    row({ leadSource: "website", submittedAt: "2026-09-30T12:00:00Z" }), // future — outside
  ], NOW);
  eq("30 New York days including today, dated by arrival", mix.total, 5);
  eq("slices in fixed order with counts and percentages", mix.slices.map((s) => `${s.label}:${s.count}:${s.pct}`),
    ["Website:2:40", "BiggerPockets:1:20", "Brokers:1:20", "Other:1:20"]);
  const none = leadSourceMix([], NOW);
  eq("empty: total zero, four zero slices", [none.total, none.slices.map((s) => s.pct)], [0, [0, 0, 0, 0]]);
}

/* ======================================================================= */
console.log("\n=== 10. Applications per week (last 12, Mon–Sun, New York) ===");
{
  const weeks = weeklyTrend([
    row({ submittedAt: "2026-09-22T12:00:00Z", firstTermSheetAt: "2026-09-23T12:00:00Z" }),
    row({ submittedAt: "2026-09-21T03:30:00Z" }), // Sun 20 Sep 23:30 EDT — previous week, though Monday in UTC
    row({ submittedAt: "2026-09-21T04:30:00Z" }), // Mon 21 Sep 00:30 EDT — this week
    row({ submittedAt: "2026-07-06T12:00:00Z" }), // first day of the oldest week
    row({ submittedAt: "2026-07-05T12:00:00Z" }), // 13 weeks ago — outside
    row({ submittedAt: "2026-09-26T12:00:00Z" }), // later this week — future, excluded
    row({ submittedAt: null, createdAt: "2026-09-01T12:00:00Z", firstTermSheetAt: "2026-09-02T12:00:00Z" }),
  ], NOW);
  eq("twelve weeks", weeks.length, 12);
  eq("oldest first, Mondays", [weeks[0].start, weeks[11].start], ["2026-07-06", "2026-09-21"]);
  eq("labels", [weeks[11].label, weeks[11].range, weeks[11].partial, weeks[10].partial], ["Sep 21", "Sep 21 – Sep 27", true, false]);
  eq("this week: two submitted (Monday 00:30 NY included, future excluded), one term sheet",
    [weeks[11].submitted, weeks[11].termSheets], [2, 1]);
  eq("Sunday 23:30 NY lands in the previous week", weeks[10].submitted, 1);
  eq("the oldest week's Monday is in, the day before is out", weeks[0].submitted, 1);
  eq("created_at used when no submitted date; term sheet from its own date", [weeks[8].start, weeks[8].submitted, weeks[8].termSheets],
    ["2026-08-31", 1, 1]);
  eq("peak", trendPeak(weeks), 2);
  eq("peak of an empty chart is 1, so nothing divides by zero", trendPeak(weeklyTrend([], NOW)), 1);

  // The fall-back week: Mon 26 Oct – Sun 1 Nov 2026 is 169 hours long.
  const nov = new Date("2026-11-05T15:00:00Z");
  const dst = weeklyTrend([
    row({ submittedAt: "2026-10-26T03:30:00Z" }), // Sun 25 Oct 23:30 EDT — week of 19 Oct
    row({ submittedAt: "2026-10-26T04:30:00Z" }), // Mon 26 Oct 00:30 EDT — week of 26 Oct
    row({ submittedAt: "2026-11-01T04:30:00Z" }), // Sun 1 Nov 00:30 EDT — week of 26 Oct
    row({ submittedAt: "2026-11-02T04:30:00Z" }), // Sun 1 Nov 23:30 EST — week of 26 Oct (7×24h from Monday would say 2 Nov)
    row({ submittedAt: "2026-11-02T05:30:00Z" }), // Mon 2 Nov 00:30 EST — week of 2 Nov
  ], nov);
  const wk = (start: string) => dst.find((w) => w.start === start)?.submitted;
  eq("DST fall-back week keeps its last hour: 19 Oct / 26 Oct / 2 Nov",
    [wk("2026-10-19"), wk("2026-10-26"), wk("2026-11-02")], [1, 3, 1]);
  // The spring-forward week: Mon 2 Mar – Sun 8 Mar 2026 is 167 hours long.
  const mar = weeklyTrend([
    row({ submittedAt: "2026-03-09T03:30:00Z" }), // Sun 8 Mar 23:30 EDT — week of 2 Mar
    row({ submittedAt: "2026-03-09T04:30:00Z" }), // Mon 9 Mar 00:30 EDT — week of 9 Mar
  ], new Date("2026-03-12T15:00:00Z"));
  eq("DST spring-forward week", [mar.find((w) => w.start === "2026-03-02")?.submitted, mar.find((w) => w.start === "2026-03-09")?.submitted], [1, 1]);
}

/* ======================================================================= */
console.log("\n=== 11. The whole page from one book ===");
{
  const book: DashboardRow[] = [
    row({ id: "wait", name: "Taha Sheikh", contactId: "taha", lastContactDirection: "email_in", lastContactAt: "2026-07-06T12:00:00Z", requestedAmount: "700000" }),
    row({ id: "wait2", name: "Taha Sheikh", contactId: "taha", stage: "qualified", lastContactDirection: "email_in", lastContactAt: "2026-07-06T12:00:00Z", submittedAt: "2026-06-01T12:00:00Z" }),
    row({ id: "never", name: "New Lead", lastContactAt: null, lastContactDirection: null, leadSource: "biggerpockets" }),
    row({ id: "parked", name: "Put Down", nextActionAt: "2026-09-30T13:00:00Z", nextActionSetAt: "2026-09-20T12:00:00Z", lastContactAt: "2026-09-19T12:00:00Z" }),
    row({ id: "ts", stage: "term_sheet_issued", firstTermSheetAt: "2026-09-22T12:00:00Z", lastContactAt: "2026-09-23T12:00:00Z" }),
  ];
  const tasks: DueTaskInput[] = [{ id: "t1", title: "Order appraisal", dueOn: "2026-09-23", applicationId: "ts", borrower: "B" }];
  const m = buildDashboardModel(book, tasks, NOW);
  // Both of Taha's deals share one inbox, so one wait; the first in queue order is opened.
  eq("attention counts both and opens the first of the longest", m.attention.kind === "waiting" ? [m.attention.count, m.attention.top.applicationId] : null, [2, "wait"]);
  eq("tabs", m.tabs.map((t) => `${t.reason}:${t.count}`), ["awaiting_reply:2", "never_contacted:1"]);
  eq("repeat investor shows two open files", m.tabs[0].rows[0].sub, "Wrote to you, no reply · 2 open files");
  eq("queue total", m.queueTotal, 3);
  eq("put down", [m.parked.map((p) => p.applicationId), m.parkedHeading], [["parked"], "1 put down · back Wed 30 Sep"]);
  eq("KPIs", [m.kpis.pipeline.value, m.kpis.termSheets.value, m.kpis.funded.sub],
    ["$1.1M", "1", "No funded dates recorded yet"]);
  eq("tasks", m.tasks.map((t) => t.when), ["overdue 1 day"]);
  eq("this week's term sheet on the chart", m.weeks[11].termSheets, 1);
  eq("sources", m.sources.slices.map((s) => s.count), [3, 1, 0, 0]);
}

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail > 0 ? 1 : 0);
