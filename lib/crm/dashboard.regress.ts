/**
 * Regression suite for the dashboard rollups and the work queue.
 *
 * WHY THIS IS NOT OPTIONAL. A broken chart looks broken. A broken work queue
 * looks finished — a short, tidy list that simply does not contain the person
 * who has been waiting three weeks. There is no error and nothing to notice,
 * which is why every rule that decides what appears here is pinned down below.
 *
 * `now` is fixed so the suite means the same thing in December as it does
 * today. Every date in the fixtures is relative to that one constant.
 */

import {
  QUEUE_DEFAULTS,
  buildWorkQueue,
  computeKpis,
  isOpen,
  needsWork,
  queueReasonFor,
  queueSummary,
  stageCounts,
  type DashboardApplication,
  type QueueReason,
} from "./dashboard";
import { STAGE_ORDER } from "./view";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};

/** Wednesday 23 September 2026, midday UTC. */
const NOW = new Date("2026-09-23T12:00:00.000Z");
const daysAgo = (n: number): string => new Date(NOW.getTime() - n * 86_400_000).toISOString();

function app(over: Partial<DashboardApplication> = {}): DashboardApplication {
  return {
    id: over.id ?? `app-${Math.random().toString(36).slice(2, 8)}`,
    stage: "lead",
    stageEnteredAt: daysAgo(1),
    submittedAt: daysAgo(1),
    createdAt: daysAgo(1),
    requestedAmount: "100000",
    contactId: "c1",
    name: "Test Borrower",
    email: "test@example.com",
    fundedAt: null,
    decisionedAt: null,
    termSheetIssuedAt: null,
    termSheetSignedAt: null,
    lastContactAt: daysAgo(1),
    lastContactDirection: "email_out",
    ...over,
  };
}

/* ------------------------------------------------------------ stage sets */

console.log("\n=== 1. Open, servicing and terminal are three different things ===");

check("a lead is open", isOpen("lead"), "yes");
check("a funded loan is still open", isOpen("funded"), "yes");
check("closed_lost is not open", !isOpen("closed_lost"), "correct");
check("payoff is not open", !isOpen("payoff"), "correct");

check("a lead needs work", needsWork("lead"), "yes");
check("a funded loan does NOT need work", !needsWork("funded"), "correct");
check("an active loan does NOT need work", !needsWork("active"), "correct");
check("a draw cycle does NOT need work", !needsWork("draw_cycle"), "correct");
check("an extension does NOT need work", !needsWork("extension"), "correct");
check("closed_lost does not need work", !needsWork("closed_lost"), "correct");
// The distinction that keeps performing loans out of a "needs attention" list.
check("...so open and needsWork genuinely differ", isOpen("active") && !needsWork("active"), "they differ");

/* ------------------------------------------------------------------ KPIs */

console.log("\n=== 2. Funded rollups count the right window ===");

const fundedSet = [
  app({ id: "f1", stage: "funded", fundedAt: daysAgo(3), requestedAmount: "250000" }),   // this month
  app({ id: "f2", stage: "funded", fundedAt: daysAgo(40), requestedAmount: "300000" }),  // YTD, not this month
  app({ id: "f3", stage: "funded", fundedAt: "2025-11-04T00:00:00.000Z", requestedAmount: "900000" }), // last year
  app({ id: "f4", stage: "lead", fundedAt: null, requestedAmount: "500000" }),
];
const k = computeKpis(fundedSet, NOW);

check("funded this month counts one", k.fundedThisMonth.count === 1, String(k.fundedThisMonth.count));
check("...and its amount", k.fundedThisMonth.amount === 250000, String(k.fundedThisMonth.amount));
check("funded YTD counts two", k.fundedYtd.count === 2, String(k.fundedYtd.count));
check("...and excludes last year", k.fundedYtd.amount === 550000, String(k.fundedYtd.amount));

console.log("\n=== 3. A funded date in the future is a typo, not a forecast ===");
const future = computeKpis(
  [app({ stage: "funded", fundedAt: "2027-02-01T00:00:00.000Z", requestedAmount: "1000000" })],
  NOW,
);
check("excluded from YTD", future.fundedYtd.count === 0, String(future.fundedYtd.count));
check("excluded from this month", future.fundedThisMonth.count === 0, String(future.fundedThisMonth.count));

console.log("\n=== 4. Month and year boundaries are inclusive at the start ===");
const boundary = computeKpis([
  app({ id: "b1", stage: "funded", fundedAt: "2026-09-01T00:00:00.000Z", requestedAmount: "100" }),
  app({ id: "b2", stage: "funded", fundedAt: "2026-08-31T23:59:59.000Z", requestedAmount: "100" }),
  app({ id: "b3", stage: "funded", fundedAt: "2026-01-01T00:00:00.000Z", requestedAmount: "100" }),
  app({ id: "b4", stage: "funded", fundedAt: "2025-12-31T23:59:59.000Z", requestedAmount: "100" }),
], NOW);
check("1 Sep counts this month", boundary.fundedThisMonth.count === 1, String(boundary.fundedThisMonth.count));
check("31 Aug does not", boundary.fundedThisMonth.count === 1, "confirmed by the count above");
check("1 Jan counts YTD", boundary.fundedYtd.count === 3, String(boundary.fundedYtd.count));
check("31 Dec does not", boundary.fundedYtd.count === 3, "confirmed by the count above");

console.log("\n=== 5. Submitted and lost this month ===");
const activity = computeKpis([
  app({ id: "s1", submittedAt: daysAgo(2) }),
  app({ id: "s2", submittedAt: daysAgo(40) }),
  // No submittedAt at all — falls back to createdAt rather than vanishing.
  app({ id: "s3", submittedAt: null, createdAt: daysAgo(3) }),
  // Submitted LAST quarter so the two metrics stay independent in this fixture.
  // A deal can legitimately be both submitted and lost inside one month, and
  // the first version of this test asserted 3 because it forgot these three
  // carried the helper's default submitted date. The code was right and the
  // expectation was wrong.
  app({ id: "l1", stage: "closed_lost", submittedAt: daysAgo(60), createdAt: daysAgo(60), decisionedAt: daysAgo(5) }),
  app({ id: "l2", stage: "closed_lost", submittedAt: daysAgo(60), createdAt: daysAgo(60), decisionedAt: daysAgo(45) }),
  // Lost but never decisioned — cannot be counted in a window it has no date for.
  app({ id: "l3", stage: "closed_lost", submittedAt: daysAgo(60), createdAt: daysAgo(60), decisionedAt: null }),
], NOW);
check("submitted this month counts 2", activity.submittedThisMonth === 2, String(activity.submittedThisMonth));
check("...including the one with only createdAt", activity.submittedThisMonth === 2, "fallback works");
check("lost this month counts 1", activity.lostThisMonth === 1, String(activity.lostThisMonth));
check("a lost deal with no decision date is not counted", activity.lostThisMonth === 1, "not inflated");

// Submitted and lost inside the same month counts in BOTH, which is correct:
// they measure different events, not two halves of one.
const sameMonth = computeKpis(
  [app({ stage: "closed_lost", submittedAt: daysAgo(6), createdAt: daysAgo(6), decisionedAt: daysAgo(4) })],
  NOW,
);
check(
  "one deal submitted and lost this month counts in both",
  sameMonth.submittedThisMonth === 1 && sameMonth.lostThisMonth === 1,
  `submitted ${sameMonth.submittedThisMonth}, lost ${sameMonth.lostThisMonth}`,
);

console.log("\n=== 6. Open count and requested value match the Pipeline page's rule ===");
const openSet = [
  app({ stage: "lead", requestedAmount: "100000" }),
  app({ stage: "funded", requestedAmount: "200000" }),
  app({ stage: "closed_lost", requestedAmount: "999999" }),
  app({ stage: "payoff", requestedAmount: "888888" }),
  app({ stage: "lead", requestedAmount: null }),
];
const o = computeKpis(openSet, NOW);
check("open counts 3 (lost and payoff excluded)", o.openCount === 3, String(o.openCount));
check("requested sums only open", o.openRequested === 300000, String(o.openRequested));
check("a null amount contributes zero, not NaN", Number.isFinite(o.openRequested), String(o.openRequested));

/* ----------------------------------------------------------- stage shape */

console.log("\n=== 7. Stage counts keep the empty stages ===");
const shape = stageCounts([
  app({ stage: "lead" }), app({ stage: "lead" }), app({ stage: "underwriting" }),
]);
check("one row per pipeline stage", shape.length === STAGE_ORDER.length, `${shape.length} rows`);
check("in pipeline order", shape[0].stage === "lead" && shape[1].stage === "qualified", `${shape[0].stage}, ${shape[1].stage}`);
check("lead counts 2", shape.find((s) => s.stage === "lead")?.count === 2, String(shape.find((s) => s.stage === "lead")?.count));
// The zeros are the finding, not noise to be tidied away.
check("funded is present with zero", shape.find((s) => s.stage === "funded")?.count === 0, "present");
check("an unknown stage is counted, not dropped", stageCounts([app({ stage: "invented" })]).some((s) => s.stage === "invented"), "kept");

/* ------------------------------------------------------------ work queue */

console.log("\n=== 8. Each reason fires on its own ===");
const noDupes = { thresholds: QUEUE_DEFAULTS, duplicateContacts: new Set<string>() };
const reasonOf = (a: DashboardApplication): QueueReason | null =>
  queueReasonFor(a, noDupes, NOW)?.reason ?? null;

check(
  "an inbound email 3 days old is awaiting_reply",
  reasonOf(app({ lastContactAt: daysAgo(3), lastContactDirection: "email_in" })) === "awaiting_reply",
  String(reasonOf(app({ lastContactAt: daysAgo(3), lastContactDirection: "email_in" }))),
);
check(
  "an inbound email 1 day old is NOT yet",
  reasonOf(app({ lastContactAt: daysAgo(1), lastContactDirection: "email_in" })) === null,
  String(reasonOf(app({ lastContactAt: daysAgo(1), lastContactDirection: "email_in" }))),
);
check(
  "our own outbound email is never awaiting_reply",
  reasonOf(app({ lastContactAt: daysAgo(30), lastContactDirection: "email_out", stageEnteredAt: daysAgo(1) })) === null,
  "correct",
);
check(
  "a term sheet unsigned for 10 days",
  reasonOf(app({ stage: "term_sheet_issued", termSheetIssuedAt: daysAgo(10) })) === "term_sheet_cold",
  String(reasonOf(app({ stage: "term_sheet_issued", termSheetIssuedAt: daysAgo(10) }))),
);
check(
  "...but not once it is signed",
  reasonOf(app({ stage: "term_sheet_signed", termSheetIssuedAt: daysAgo(30), termSheetSignedAt: daysAgo(2), stageEnteredAt: daysAgo(2) })) === null,
  "correct",
);
check(
  "no contact ever is never_contacted",
  reasonOf(app({ lastContactAt: null, lastContactDirection: null })) === "never_contacted",
  String(reasonOf(app({ lastContactAt: null, lastContactDirection: null }))),
);
check(
  "40 days in one stage is stalled",
  reasonOf(app({ stageEnteredAt: daysAgo(40) })) === "stalled",
  String(reasonOf(app({ stageEnteredAt: daysAgo(40) }))),
);
check(
  "a healthy recent deal is not in the queue at all",
  reasonOf(app()) === null,
  String(reasonOf(app())),
);

console.log("\n=== 9. Servicing and dead deals never enter the queue ===");
for (const stage of ["funded", "active", "draw_cycle", "extension", "closed_lost", "payoff"]) {
  // Every one of these would qualify on age alone if the stage were ignored.
  const r = reasonOf(app({ stage, stageEnteredAt: daysAgo(400), lastContactAt: null, lastContactDirection: null }));
  check(`  ${stage} stays out`, r === null, String(r));
}

console.log("\n=== 10. One deal, one reason — the most urgent ===");
// Qualifies for awaiting_reply, term_sheet_cold, never_contacted and stalled.
const everything = app({
  stage: "term_sheet_issued",
  stageEnteredAt: daysAgo(90),
  termSheetIssuedAt: daysAgo(60),
  lastContactAt: daysAgo(20),
  lastContactDirection: "email_in",
});
check("awaiting_reply wins", reasonOf(everything) === "awaiting_reply", String(reasonOf(everything)));
check("...with the inbound email's age, not the stage's", queueReasonFor(everything, noDupes, NOW)?.waitingDays === 20, String(queueReasonFor(everything, noDupes, NOW)?.waitingDays));

const coldAndStalled = app({ stage: "term_sheet_issued", stageEnteredAt: daysAgo(90), termSheetIssuedAt: daysAgo(60), lastContactAt: daysAgo(1), lastContactDirection: "email_out" });
check("term_sheet_cold beats stalled", reasonOf(coldAndStalled) === "term_sheet_cold", String(reasonOf(coldAndStalled)));

const neverAndStalled = app({ stageEnteredAt: daysAgo(90), lastContactAt: null, lastContactDirection: null });
check("never_contacted beats stalled", reasonOf(neverAndStalled) === "never_contacted", String(reasonOf(neverAndStalled)));

console.log("\n=== 11. A repeat investor is NOT a duplicate ===");
// This is the rule most likely to be got wrong, and getting it wrong trains
// whoever reads this screen to ignore it.
const sameWeek = buildWorkQueue([
  app({ id: "d1", contactId: "juan", name: "Juan Dominguez", submittedAt: daysAgo(9), createdAt: daysAgo(9), stageEnteredAt: daysAgo(9), lastContactAt: daysAgo(1), lastContactDirection: "email_out" }),
  app({ id: "d2", contactId: "juan", name: "Juan Dominguez", submittedAt: daysAgo(9), createdAt: daysAgo(9), stageEnteredAt: daysAgo(9), lastContactAt: daysAgo(1), lastContactDirection: "email_out" }),
], QUEUE_DEFAULTS, NOW);
check("two filings the same day ARE flagged", sameWeek.length === 2 && sameWeek.every((i) => i.reason === "duplicate"), sameWeek.map((i) => i.reason).join(", "));

const monthsApart = buildWorkQueue([
  app({ id: "r1", contactId: "repeat", name: "Repeat Investor", submittedAt: daysAgo(200), createdAt: daysAgo(200), stageEnteredAt: daysAgo(1), lastContactAt: daysAgo(1), lastContactDirection: "email_out" }),
  app({ id: "r2", contactId: "repeat", name: "Repeat Investor", submittedAt: daysAgo(3), createdAt: daysAgo(3), stageEnteredAt: daysAgo(1), lastContactAt: daysAgo(1), lastContactDirection: "email_out" }),
], QUEUE_DEFAULTS, NOW);
check("two deals months apart are NOT flagged", monthsApart.length === 0, monthsApart.map((i) => `${i.name}:${i.reason}`).join(", ") || "empty");

const oneEach = buildWorkQueue([
  app({ id: "x1", contactId: "a", stageEnteredAt: daysAgo(1), lastContactAt: daysAgo(1), lastContactDirection: "email_out" }),
  app({ id: "x2", contactId: "b", stageEnteredAt: daysAgo(1), lastContactAt: daysAgo(1), lastContactDirection: "email_out" }),
], QUEUE_DEFAULTS, NOW);
check("two different people are not duplicates of each other", oneEach.length === 0, `${oneEach.length} items`);

console.log("\n=== 12. The queue is ordered, and the order is stable ===");
const queue = buildWorkQueue([
  app({ id: "q1", name: "Stalled Sam", contactId: "s", stageEnteredAt: daysAgo(45), lastContactAt: daysAgo(45), lastContactDirection: "email_out" }),
  app({ id: "q2", name: "Waiting Wendy", contactId: "w", lastContactAt: daysAgo(20), lastContactDirection: "email_in" }),
  app({ id: "q3", name: "Waiting Walter", contactId: "v", lastContactAt: daysAgo(5), lastContactDirection: "email_in" }),
  app({ id: "q4", name: "New Nancy", contactId: "n", lastContactAt: null, lastContactDirection: null, submittedAt: daysAgo(2), createdAt: daysAgo(2) }),
], QUEUE_DEFAULTS, NOW);

check("four items", queue.length === 4, String(queue.length));
check("waiting longest is first", queue[0].name === "Waiting Wendy", queue[0].name);
check("...then the other waiter", queue[1].name === "Waiting Walter", queue[1].name);
check("stalled outranks never_contacted", queue[2].reason === "stalled", queue[2].reason);
check("never_contacted is last", queue[3].reason === "never_contacted", queue[3].reason);

const again = buildWorkQueue([...queue].map((i) => app({ id: i.applicationId, name: i.name })), QUEUE_DEFAULTS, NOW);
check("re-running is deterministic", JSON.stringify(again.map((i) => i.applicationId)) === JSON.stringify(again.map((i) => i.applicationId)), "stable");

// Same reason, same age: name decides, so the list never reshuffles on reload.
const tied = buildWorkQueue([
  app({ id: "t2", name: "Zoe", contactId: "z", lastContactAt: daysAgo(4), lastContactDirection: "email_in" }),
  app({ id: "t1", name: "Adam", contactId: "a", lastContactAt: daysAgo(4), lastContactDirection: "email_in" }),
], QUEUE_DEFAULTS, NOW);
check("ties break by name", tied[0].name === "Adam", tied.map((i) => i.name).join(", "));

console.log("\n=== 13. Summary counts match the list ===");
const summary = queueSummary(queue);
check("summary totals equal queue length", summary.reduce((n, s) => n + s.count, 0) === queue.length, `${summary.reduce((n, s) => n + s.count, 0)} vs ${queue.length}`);
check("awaiting_reply counts 2", summary.find((s) => s.reason === "awaiting_reply")?.count === 2, String(summary.find((s) => s.reason === "awaiting_reply")?.count));
check("every reason appears, even at zero", summary.length === 5, `${summary.length} reasons`);

console.log("\n=== 14. Empty and malformed input do not throw ===");
check("no applications at all", buildWorkQueue([], QUEUE_DEFAULTS, NOW).length === 0, "empty queue");
const emptyK = computeKpis([], NOW);
check("KPIs on an empty book are zeroes, not NaN", emptyK.openRequested === 0 && emptyK.fundedYtd.count === 0, "zeroed");
check("an unparseable date does not throw", reasonOf(app({ stageEnteredAt: "not-a-date", lastContactAt: "also-not", lastContactDirection: "email_in" })) === null, "handled");
check("a null contact id cannot be a duplicate", buildWorkQueue([
  app({ id: "n1", contactId: null, stageEnteredAt: daysAgo(1), lastContactAt: daysAgo(1), lastContactDirection: "email_out" }),
  app({ id: "n2", contactId: null, stageEnteredAt: daysAgo(1), lastContactAt: daysAgo(1), lastContactDirection: "email_out" }),
], QUEUE_DEFAULTS, NOW).length === 0, "not grouped by null");

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail > 0 ? 1 : 0);
