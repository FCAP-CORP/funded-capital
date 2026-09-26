/**
 * Regression suite for /crm/reports (lib/crm/reports.ts).
 *
 * The rule that matters most is at the top of reports.ts: COHORT figures
 * follow the leads that arrived in the period; ACTIVITY figures count what
 * happened in the period. §3 pins that a conversion rate can never exceed
 * 100% because the two are never divided into each other.
 */
import {
  DEFAULT_RANGE, LOST_REASONS_SHOWN, MAX_MONTHS, buildReports, byProduct, bySource, durationLabel, funnel, kpis,
  lostReasons, median, niceMax, parseRange, rangeWindow, reached, responseHours, speedToLead, trend,
  type ReportRow,
} from "./reports";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};

// Friday 25 Sep 2026, 3pm New York (EDT, UTC-4).
const NOW = new Date("2026-09-25T19:00:00.000Z");
let seq = 0;
const row = (o: Partial<ReportRow>): ReportRow => ({
  id: `a${++seq}`,
  stage: "lead",
  leadSource: "website",
  product: "fix_and_flip",
  submittedAt: null,
  createdAt: null,
  stageEnteredAt: null,
  requestedAmount: null,
  firstTouchAt: null,
  firstTermSheetAt: null,
  firstSignedAt: null,
  fundedAt: null,
  lostAt: null,
  lostReason: null,
  ...o,
});
const hoursAfter = (iso: string, h: number) => new Date(Date.parse(iso) + h * 3_600_000).toISOString();

console.log("\n=== 1. The period ===");
check("default is last 90 days", parseRange(undefined) === "90d" && DEFAULT_RANGE === "90d", "");
check("junk falls back to the default", parseRange("forever") === "90d" && parseRange(["x"]) === "90d", "");
check("a valid key is kept (also from an array)", parseRange("ytd") === "ytd" && parseRange(["12m"]) === "12m", "");
const w30 = rangeWindow("30d", NOW);
check("30 days starts at New York midnight 29 days back (27 Aug, 04:00 UTC)", new Date(w30.start!).toISOString() === "2026-08-27T04:00:00.000Z", new Date(w30.start!).toISOString());
const ytd = rangeWindow("ytd", NOW);
check("year to date starts 1 Jan New York (05:00 UTC, EST)", new Date(ytd.start!).toISOString() === "2026-01-01T05:00:00.000Z", new Date(ytd.start!).toISOString());
const m12 = rangeWindow("12m", NOW);
check("12 months starts on 1 Oct last year", new Date(m12.start!).toISOString() === "2025-10-01T04:00:00.000Z", new Date(m12.start!).toISOString());
check("all time has no start", rangeWindow("all", NOW).start === null, "");
check("short ranges bucket by week, long by month", w30.grain === "week" && rangeWindow("90d", NOW).grain === "week" && ytd.grain === "month" && m12.grain === "month", "");

console.log("\n=== 2. Contact timing ===");
const arr = "2026-09-20T13:00:00.000Z";
check("hours from arrival to first touch", responseHours(row({ submittedAt: arr, firstTouchAt: hoursAfter(arr, 3) })) === 3, "3");
check("never contacted → null", responseHours(row({ submittedAt: arr })) === null, "null");
check("arrival falls back to created_at", responseHours(row({ createdAt: arr, firstTouchAt: hoursAfter(arr, 2) })) === 2, "2");
check("a touch stamped a moment early counts as 0, never negative", responseHours(row({ submittedAt: arr, firstTouchAt: hoursAfter(arr, -0.05) })) === 0, "0");
check("median, odd", median([5, 1, 3]) === 3, "3");
check("median, even", median([1, 2, 3, 10]) === 2.5, "2.5");
check("median of nothing is null", median([]) === null, "null");
check("duration: minutes", durationLabel(0.3) === "18 min", durationLabel(0.3));
check("duration: under a minute shows 1 min", durationLabel(0.001) === "1 min", durationLabel(0.001));
check("duration: hours", durationLabel(3.4) === "3.4 hrs" && durationLabel(26) === "26 hrs", `${durationLabel(3.4)} / ${durationLabel(26)}`);
check("duration: days", durationLabel(60) === "2.5 days" && durationLabel(24 * 14) === "14 days", `${durationLabel(60)} / ${durationLabel(24 * 14)}`);
check("duration: none", durationLabel(null) === "—", "");

console.log("\n=== 3. Cohort vs activity — conversion never exceeds 100% ===");
{
  // One lead this month, no term sheet. Two OLD leads got term sheets this month.
  const rows = [
    row({ submittedAt: "2026-09-10T15:00:00Z" }),
    row({ submittedAt: "2026-03-01T15:00:00Z", firstTermSheetAt: "2026-09-12T15:00:00Z", stage: "term_sheet_issued" }),
    row({ submittedAt: "2026-02-01T15:00:00Z", firstTermSheetAt: "2026-09-13T15:00:00Z", stage: "term_sheet_issued" }),
  ];
  const k = kpis(rows, rangeWindow("30d", NOW));
  check("cohort: 1 new lead", k.leads === 1, String(k.leads));
  check("activity: 2 term sheets issued in period", k.termSheetsIssued === 2, String(k.termSheetsIssued));
  check("cohort conversion is 0%, not 200%", k.cohortConversionPct === 0 && k.cohortTermSheets === 0, `${k.cohortConversionPct}%`);
}
{
  const rows = [
    row({ submittedAt: "2026-09-01T15:00:00Z", firstTouchAt: "2026-09-01T15:30:00Z", firstTermSheetAt: "2026-09-05T15:00:00Z", stage: "term_sheet_issued" }),
    row({ submittedAt: "2026-09-02T15:00:00Z", firstTouchAt: "2026-09-04T15:00:00Z" }),
    row({ submittedAt: "2026-09-03T15:00:00Z" }),
    row({ submittedAt: "2026-09-04T15:00:00Z", firstTouchAt: "2026-09-04T19:00:00Z" }),
    row({ submittedAt: "2026-06-01T15:00:00Z", fundedAt: "2026-09-15T15:00:00Z", stage: "funded", requestedAmount: "250000" }),
  ];
  const k = kpis(rows, rangeWindow("30d", NOW));
  check("4 leads arrived in the last 30 days", k.leads === 4, String(k.leads));
  check("3 of 4 contacted = 75%", k.contacted === 3 && k.contactedPct === 75, `${k.contacted} / ${k.contactedPct}%`);
  check("2 of 4 within 24 hours = 50%", k.within24h === 2 && k.within24hPct === 50, `${k.within24h} / ${k.within24hPct}%`);
  check("median first contact = 4 hrs (0.5, 4, 48)", k.medianResponseHours === 4, String(k.medianResponseHours));
  check("cohort conversion 1 of 4 = 25%", k.cohortConversionPct === 25, `${k.cohortConversionPct}%`);
  check("funded counts by the funded date, not arrival", k.funded === 1 && k.fundedVolume === 250000, `${k.funded} / ${k.fundedVolume}`);
  check("no leads → percentages are null, not 0% or NaN", kpis([], rangeWindow("30d", NOW)).contactedPct === null, "null");
}

console.log("\n=== 4. Reached a stage ===");
check("dated history counts", reached(row({ firstTermSheetAt: "2026-09-01T00:00:00Z" }), "term_sheet"), "");
check("current stage counts when there is no history", reached(row({ stage: "underwriting" }), "term_sheet") && reached(row({ stage: "underwriting" }), "signed"), "");
check("a servicing stage counts as funded", reached(row({ stage: "active" }), "funded") && reached(row({ stage: "payoff" }), "funded"), "");
check("a lead has reached nothing", !reached(row({ stage: "lead" }), "term_sheet"), "");
check("closed_lost with no history reached nothing (its position says nothing)", !reached(row({ stage: "closed_lost" }), "term_sheet"), "");
check("closed_lost WITH a dated term sheet did reach it", reached(row({ stage: "closed_lost", firstTermSheetAt: "2026-09-01T00:00:00Z" }), "term_sheet"), "");

console.log("\n=== 5. Funnel ===");
{
  const rows = [
    row({ submittedAt: "2026-09-01T15:00:00Z", firstTouchAt: "2026-09-01T16:00:00Z", stage: "funded" }),
    row({ submittedAt: "2026-09-02T15:00:00Z", firstTouchAt: "2026-09-02T16:00:00Z", stage: "term_sheet_issued" }),
    row({ submittedAt: "2026-09-03T15:00:00Z", firstTouchAt: "2026-09-03T16:00:00Z" }),
    row({ submittedAt: "2026-09-04T15:00:00Z" }),
  ];
  const f = funnel(rows, rangeWindow("30d", NOW));
  check("five steps in order", f.map((s) => s.key).join(",") === "leads,contacted,term_sheet,signed,funded", f.map((s) => s.key).join(","));
  check("counts 4 → 3 → 2 → 1 → 1", f.map((s) => s.count).join(",") === "4,3,2,1,1", f.map((s) => s.count).join(","));
  check("% of leads", f.map((s) => s.pctOfLeads).join(",") === "100,75,50,25,25", f.map((s) => s.pctOfLeads).join(","));
  check("never increases down the funnel", f.every((s, i) => i === 0 || s.count <= f[i - 1].count), "monotonic");
}

console.log("\n=== 6. Sources ===");
{
  const rows = [
    row({ submittedAt: "2026-09-01T15:00:00Z", leadSource: "biggerpockets", firstTouchAt: "2026-09-01T17:00:00Z" }),
    row({ submittedAt: "2026-09-02T15:00:00Z", leadSource: "biggerpockets" }),
    row({ submittedAt: "2026-09-03T15:00:00Z", leadSource: "referral", stage: "term_sheet_issued" }),
    row({ submittedAt: "2026-09-04T15:00:00Z", leadSource: "linkedin" }),
  ];
  const s = bySource(rows, rangeWindow("30d", NOW));
  const get = (k: string) => s.find((r) => r.key === k)!;
  check("always the four groups, in order", s.map((r) => r.key).join(",") === "website,biggerpockets,broker,other", "");
  check("BiggerPockets: 2 leads, 50% contacted, 2 hrs", get("biggerpockets").leads === 2 && get("biggerpockets").contactedPct === 50 && get("biggerpockets").medianResponseHours === 2, JSON.stringify(get("biggerpockets")));
  check("referral and LinkedIn fold into Other", get("other").leads === 2 && get("other").termSheets === 1 && get("other").conversionPct === 50, JSON.stringify(get("other")));
  check("an empty source shows — not 0%", get("website").contactedPct === null && get("website").conversionPct === null, "");
}

console.log("\n=== 7. Speed to first contact ===");
{
  const base = "2026-09-10T15:00:00.000Z";
  const rows = [0.5, 5, 30, 100, 400].map((h) => row({ submittedAt: base, firstTouchAt: hoursAfter(base, h) }));
  rows.push(row({ submittedAt: base }), row({ submittedAt: base }));
  const sp = speedToLead(rows, rangeWindow("30d", NOW));
  check("one per bucket, two never contacted", sp.map((r) => r.count).join(",") === "1,1,1,1,1,2", sp.map((r) => r.count).join(","));
  check("the last row is 'Not contacted yet'", sp[sp.length - 1].never && sp[sp.length - 1].label === "Not contacted yet", "");
  check("percentages add up to 100", sp.reduce((s, r) => s + r.pct, 0) === 100, String(sp.reduce((s, r) => s + r.pct, 0)));
  check("exactly 24 hours is in '1 to 24 hours'", speedToLead([row({ submittedAt: base, firstTouchAt: hoursAfter(base, 24) })], rangeWindow("30d", NOW))[1].count === 1, "");
}

console.log("\n=== 8. Trend ===");
{
  const t30 = trend([], rangeWindow("30d", NOW), NOW);
  check("30 days → 5 Monday weeks (24 Aug … 21 Sep)", t30.buckets.length === 5 && t30.buckets[0].key === "2026-08-24" && t30.buckets[4].key === "2026-09-21", t30.buckets.map((b) => b.key).join(","));
  check("only the current week is partial", t30.buckets.filter((b) => b.partial).map((b) => b.key).join() === "2026-09-21", "");
  const rows = [
    row({ submittedAt: "2026-09-21T04:30:00Z", leadSource: "biggerpockets" }), // Mon 21 Sep 00:30 NY
    row({ submittedAt: "2026-09-21T03:30:00Z", leadSource: "website" }),       // Sun 20 Sep 23:30 NY
    row({ submittedAt: "2026-09-22T15:00:00Z", leadSource: "broker" }),
  ];
  const t = trend(rows, rangeWindow("30d", NOW), NOW);
  const wk = (k: string) => t.buckets.find((b) => b.key === k)!;
  check("bucketed by New York day: 23:30 Sunday stays in the earlier week", wk("2026-09-14").bySource.website === 1 && wk("2026-09-21").bySource.biggerpockets === 1, "");
  check("stack totals add up", wk("2026-09-21").total === 2 && wk("2026-09-21").bySource.broker === 1, String(wk("2026-09-21").total));
  const dst = trend([row({ submittedAt: "2026-11-02T04:30:00Z" })], rangeWindow("30d", new Date("2026-11-20T17:00:00Z")), new Date("2026-11-20T17:00:00Z"));
  check("DST week: Sun 1 Nov 23:30 NY (EST) lands in the week of 26 Oct", dst.buckets.find((b) => b.key === "2026-10-26")?.total === 1, dst.buckets.map((b) => `${b.key}:${b.total}`).join(","));
  const y = trend([], rangeWindow("ytd", NOW), NOW);
  check("year to date → 9 months, Jan … Sep", y.buckets.length === 9 && y.buckets[0].key === "2026-01-01" && y.buckets[8].partial, y.buckets.map((b) => b.label).join(","));
  const old = [row({ submittedAt: "2022-01-15T15:00:00Z" }), row({ submittedAt: "2026-09-01T15:00:00Z" })];
  const all = trend(old, rangeWindow("all", NOW), NOW);
  check(`all time is capped at ${MAX_MONTHS} months`, all.buckets.length === MAX_MONTHS, String(all.buckets.length));
  check("…and older leads are counted in the first bar, not dropped", all.buckets[0].total === 1 && all.foldedBefore !== null, `${all.buckets[0].total} / ${all.foldedBefore}`);
  check("nice axis max", niceMax(0) === 1 && niceMax(7) === 10 && niceMax(13) === 20 && niceMax(23) === 25 && niceMax(51) === 100, [0, 7, 13, 23, 51].map(niceMax).join(","));
}

console.log("\n=== 9. Products and lost reasons ===");
{
  const rows = [
    row({ submittedAt: "2026-09-01T15:00:00Z", product: "dscr", requestedAmount: "300000" }),
    row({ submittedAt: "2026-09-02T15:00:00Z", product: "dscr", requestedAmount: "200000" }),
    row({ submittedAt: "2026-09-03T15:00:00Z", product: "unknown" }),
    row({ submittedAt: "2026-09-03T15:00:00Z", product: "not_our_product" }),
    row({ submittedAt: "2026-09-04T15:00:00Z", product: "fix_and_flip", requestedAmount: "abc" }),
  ];
  const p = byProduct(rows, rangeWindow("30d", NOW));
  check("largest first, 'not stated' and 'not our product' last", p.map((r) => r.key).join(",") === "dscr,fix_and_flip,not_our_product,unknown", p.map((r) => r.key).join(","));
  check("requested amounts summed; junk amounts ignored", p[0].requested === 500000 && p[1].requested === 0, `${p[0].requested} / ${p[1].requested}`);

  const lost = (reason: string | null, at = "2026-09-10T15:00:00Z") => row({ stage: "closed_lost", lostAt: at, lostReason: reason });
  const l = lostReasons([
    lost("Went with another lender: Kiavi"), lost("Went with another lender: Lima One"), lost("Went with another lender"),
    lost("Deal fell through"), lost(null), lost("Deal fell through", "2026-01-01T15:00:00Z"),
    row({ stage: "lead", lostAt: "2026-09-10T15:00:00Z", lostReason: "stale" }),
  ], rangeWindow("30d", NOW));
  check("grouped by the choice, detail ignored", l.rows[0].reason === "Went with another lender" && l.rows[0].count === 3, JSON.stringify(l.rows[0]));
  check("only deals lost inside the window, and only closed_lost ones", l.total === 5, String(l.total));
  check("'No reason recorded' sorts last", l.rows[l.rows.length - 1].reason === "No reason recorded", "");
  const many = lostReasons("ABCDEFGH".split("").map((c) => lost(c)), rangeWindow("30d", NOW));
  check(`more than ${LOST_REASONS_SHOWN} reasons fold into 'Other reasons'`, many.rows.length === LOST_REASONS_SHOWN && many.rows[LOST_REASONS_SHOWN - 1].reason === "Other reasons" && many.rows[LOST_REASONS_SHOWN - 1].count === 3, JSON.stringify(many.rows.at(-1)));
}

console.log("\n=== 10. The whole model ===");
{
  const m = buildReports([row({ submittedAt: "2026-09-20T15:00:00Z" })], "30d", NOW);
  check("builds every section", Boolean(m.kpis && m.trend.buckets.length && m.funnel.length === 5 && m.sources.length === 4 && m.speed.length === 6), "");
  check("carries its window", m.window.key === "30d" && m.window.label === "Last 30 days", "");
}

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail > 0 ? 1 : 0);
