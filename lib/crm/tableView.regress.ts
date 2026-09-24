/**
 * Regression suite for the CRM tables' pure logic (lib/crm/tableView.ts):
 * CSV export and its formula-injection guard, saved views read back from
 * untrusted storage, and bulk stage moves following the board's rules.
 *
 * Run: npx tsx lib/crm/tableView.regress.ts
 */

import {
  BULK_MOVE_MAX, MAX_SAVED_VIEWS, bulkMoveSummary, clampWidth, csvCell, csvFileName, defaultViewState,
  normaliseViewState, pageRangeLabel, parseViewName, parseViews, planBulkMove, removeView, sameViewState,
  serialiseViews, toCsv, upsertView, type SavedView, type TableShape,
} from "./tableView";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};

console.log("\n=== 1. CSV cells — RFC 4180 quoting ===");
check("plain text is bare", csvCell("Marcus Rivera") === "Marcus Rivera", csvCell("Marcus Rivera"));
check("a comma is quoted", csvCell("Rivera, Marcus") === '"Rivera, Marcus"', csvCell("Rivera, Marcus"));
check("a quote is doubled and quoted", csvCell('He said "yes"') === '"He said ""yes"""', csvCell('He said "yes"'));
check("a newline is quoted", csvCell("line1\nline2") === '"line1\nline2"', JSON.stringify(csvCell("line1\nline2")));
check("null is empty", csvCell(null) === "", "''");
check("undefined is empty", csvCell(undefined) === "", "''");
check("a number is a number", csvCell(234000) === "234000", csvCell(234000));
check("zero is 0, not empty", csvCell(0) === "0", csvCell(0));
check("NaN is empty, never 'NaN'", csvCell(NaN) === "", "''");
check("a real negative NUMBER stays a number", csvCell(-5) === "-5", csvCell(-5));
check("leading space is preserved by quoting", csvCell(" x") === '" x"', csvCell(" x"));

console.log("\n=== 2. CSV injection — every formula trigger is neutralised ===");
for (const [label, input] of [
  ["=", '=HYPERLINK("http://evil.example","Click")'],
  ["+", "+1+1"],
  ["-", "-2+3"],
  ["@", "@SUM(A1:A2)"],
  ["tab", "\t=1+1"],
  ["carriage return", "\r=1+1"],
  ["DDE", "=cmd|' /C calc'!A0"],
] as const) {
  const out = csvCell(input);
  // After the RFC quoting is peeled off, the value must start with a quote mark.
  const inner = out.startsWith('"') ? out.slice(1, -1).replace(/""/g, '"') : out;
  check(`${label} prefix is escaped`, inner.startsWith("'") && inner.slice(1) === input, JSON.stringify(out));
}
check("a formula in the middle is left alone", csvCell("a=b") === "a=b", csvCell("a=b"));
check("an email is left alone", csvCell("marcus@riverviewhold.com") === "marcus@riverviewhold.com", "unchanged");
check("a formatted phone is left alone", csvCell("(305) 555-0101") === "(305) 555-0101", "unchanged");
check("an E.164 phone IS guarded (starts with +)", csvCell("+13055550101") === "'+13055550101", csvCell("+13055550101"));

console.log("\n=== 3. A whole document ===");
const doc = toCsv(["Name", "Amount", "Note"], [["Bea", 100, "ok"], ["=evil()", null, "a,b"]]);
check("CRLF line endings", doc === 'Name,Amount,Note\r\nBea,100,ok\r\n\'=evil(),,"a,b"\r\n', JSON.stringify(doc));
check("header row is escaped too", toCsv(["=x"], []) === "'=x\r\n", JSON.stringify(toCsv(["=x"], [])));
check("file name is dated on the NY calendar", csvFileName("Pipeline", new Date("2026-09-25T02:00:00Z")) === "pipeline-2026-09-24.csv", csvFileName("Pipeline", new Date("2026-09-25T02:00:00Z")));
check("file name is sanitised", csvFileName("My ../ views!", new Date("2026-09-24T15:00:00Z")) === "my-views-2026-09-24.csv", csvFileName("My ../ views!", new Date("2026-09-24T15:00:00Z")));

console.log("\n=== 4. Saved views — names ===");
check("trimmed and collapsed", (() => { const r = parseViewName("  My   open  term sheets "); return r.ok && r.value === "My open term sheets"; })(), "ok");
check("empty refused", !parseViewName("   ").ok, "refused");
check("non-string refused", !parseViewName(42).ok, "refused");
check("41 chars refused", !parseViewName("x".repeat(41)).ok, "refused");
check("40 chars accepted", parseViewName("x".repeat(40)).ok, "accepted");

console.log("\n=== 5. Saved views — read back from untrusted storage ===");
const SHAPE: TableShape = {
  columns: ["name", "stage", "requestedAmount", "notes"],
  sortable: ["name", "stage", "requestedAmount"],
  locked: ["name"],
  defaultSort: { key: "requestedAmount", dir: "desc" },
};
const good: SavedView = {
  name: "My open term sheets",
  state: { query: "miami", facet: "term_sheet_issued", sort: { key: "name", dir: "asc" }, hidden: ["notes"], sizes: { name: 300 }, pageSize: 100 },
};
const round = parseViews(serialiseViews([good]), SHAPE);
check("a view round-trips intact", round.length === 1 && JSON.stringify(round[0]) === JSON.stringify(good), JSON.stringify(round[0]?.state));
check("null storage is no views", parseViews(null, SHAPE).length === 0, "[]");
check("garbage JSON is no views, not an exception", parseViews("{not json", SHAPE).length === 0, "[]");
check("a different version is ignored", parseViews(JSON.stringify({ v: 2, views: [good] }), SHAPE).length === 0, "[]");
check("a bare array (no version) is ignored", parseViews(JSON.stringify([good]), SHAPE).length === 0, "[]");
const hostile = parseViews(JSON.stringify({
  v: 1,
  views: [
    { name: "Bad", state: { query: 7, facet: { x: 1 }, sort: { key: "dropped_column", dir: "asc" }, hidden: ["name", "ghost", "notes", "notes"], sizes: { name: 99999, ghost: 100, stage: "abc", notes: 10 }, pageSize: 10000 } },
    { name: "bad", state: {} },
    { name: "", state: {} },
    null,
    "string",
  ],
}), SHAPE)[0];
check("a non-string query becomes empty", hostile.state.query === "", JSON.stringify(hostile.state.query));
check("an object facet becomes null", hostile.state.facet === null, String(hostile.state.facet));
check("a sort on a removed column falls back to the default", hostile.state.sort?.key === "requestedAmount", JSON.stringify(hostile.state.sort));
check("the locked Name column cannot be hidden", !hostile.state.hidden.includes("name"), JSON.stringify(hostile.state.hidden));
check("unknown columns are dropped and duplicates collapsed", JSON.stringify(hostile.state.hidden) === '["notes"]', JSON.stringify(hostile.state.hidden));
check("widths are clamped and junk widths dropped", JSON.stringify(hostile.state.sizes) === '{"name":640,"notes":64}', JSON.stringify(hostile.state.sizes));
check("a page size of 10,000 falls back to 50", hostile.state.pageSize === 50, String(hostile.state.pageSize));
check("a duplicate name (case-insensitive) is dropped", parseViews(JSON.stringify({ v: 1, views: [good, { ...good, name: "MY OPEN TERM SHEETS" }] }), SHAPE).length === 1, "1 kept");
check("nameless and non-object entries are dropped", parseViews(JSON.stringify({ v: 1, views: [{ name: "" }, null, 3, good] }), SHAPE).length === 1, "1 kept");
const many = Array.from({ length: 50 }, (_, i) => ({ name: `View ${i}`, state: {} }));
check(`no more than ${MAX_SAVED_VIEWS} views are read`, parseViews(JSON.stringify({ v: 1, views: many }), SHAPE).length === MAX_SAVED_VIEWS, String(MAX_SAVED_VIEWS));
check("an explicit null sort is kept as 'unsorted'", normaliseViewState({ sort: null }, SHAPE).sort === null, "null");
check("a missing sort gets the default", normaliseViewState({}, SHAPE).sort?.key === "requestedAmount", "default");
check("defaults: 50 per page, nothing hidden", defaultViewState(SHAPE).pageSize === 50 && defaultViewState(SHAPE).hidden.length === 0, "ok");

console.log("\n=== 6. Saved views — list edits ===");
const a: SavedView = { name: "A", state: defaultViewState(SHAPE) };
const b: SavedView = { name: "B", state: { ...defaultViewState(SHAPE), query: "x" } };
const up = upsertView([a, b], { name: "b", state: { ...b.state, query: "y" } });
check("saving under an existing name replaces it (case-insensitive)", up.length === 2 && up[0].name === "b" && up[0].state.query === "y", up.map((v) => v.name).join(","));
check("newest first", upsertView([a], b)[0].name === "B", "B first");
check("remove is case-insensitive", removeView([a, b], "a").map((v) => v.name).join() === "B", "B left");
check("sameViewState ignores hidden-column order", sameViewState({ ...a.state, hidden: ["x", "y"] }, { ...a.state, hidden: ["y", "x"] }), "same");
check("sameViewState sees a different query", !sameViewState(a.state, b.state), "different");
check("clampWidth clamps low", clampWidth(10) === 64, String(clampWidth(10)));
check("clampWidth rejects junk", clampWidth("wide") === null, "null");

console.log("\n=== 7. Bulk move — the board's rules, applied to many ===");
const rows = [
  { id: "1", stage: "lead", name: "Bea" },
  { id: "2", stage: "qualified", name: "Cal" },
  { id: "3", stage: "underwriting", name: "Dee" },
];
const mv = planBulkMove(rows, "underwriting");
check("a plain move is ready with no question", mv.kind === "ready" && mv.ask === "none", JSON.stringify(mv));
check("a deal already there is skipped, not re-moved", mv.kind === "ready" && mv.ids.join() === "1,2" && mv.skipped === 1, JSON.stringify(mv));
const fu = planBulkMove(rows, "funded");
check("Funded asks for confirmation first", fu.kind === "ready" && fu.ask === "confirm_funded", JSON.stringify(fu));
const lo = planBulkMove(rows, "closed_lost");
check("Closed – Lost asks for a reason", lo.kind === "ready" && lo.ask === "needs_reason", JSON.stringify(lo));
check("an unknown stage is refused", planBulkMove(rows, "won_big").kind === "invalid", "invalid");
check("an empty target is refused", planBulkMove(rows, "").kind === "invalid", "invalid");
check("no rows is refused", planBulkMove([], "lead").kind === "invalid", "invalid");
check("all already there → nothing to do", planBulkMove([{ id: "9", stage: "lead" }], "lead").kind === "nothing", "nothing");
check("a servicing stage is a valid table target (the dropdown has always offered it)", planBulkMove(rows, "active").kind === "ready", "ready");
check("a duplicated id moves once", (() => { const p = planBulkMove([rows[0], rows[0]], "qualified"); return p.kind === "ready" && p.ids.length === 1; })(), "once");
const big = Array.from({ length: BULK_MOVE_MAX + 1 }, (_, i) => ({ id: String(i), stage: "lead" }));
check(`more than ${BULK_MOVE_MAX} is refused with a reason`, planBulkMove(big, "qualified").kind === "invalid", "invalid");
check(`exactly ${BULK_MOVE_MAX} is allowed`, planBulkMove(big.slice(0, BULK_MOVE_MAX), "qualified").kind === "ready", "ready");
check("skipped rows do not count toward the cap", planBulkMove([...big.slice(0, BULK_MOVE_MAX), { id: "x", stage: "qualified" }], "qualified").kind === "ready", "ready");

console.log("\n=== 8. Bulk move — what the person is told ===");
const ok = bulkMoveSummary("underwriting", 2, 1, []);
check("success names the stage and the count", ok.tone === "success" && ok.title === "Moved 2 deals to Underwriting", ok.title);
check("...and mentions the skipped", (ok.description ?? "").includes("1 deal already in Underwriting"), String(ok.description));
const partial = bulkMoveSummary("funded", 1, 0, [{ name: "Cal", error: "application not found" }]);
check("a partial failure is an error, and says both halves", partial.tone === "error" && partial.title === "Moved 1 deal to Funded; 1 not moved", partial.title);
check("...and names who failed and why", (partial.description ?? "").includes("Cal: application not found"), String(partial.description));
const allFail = bulkMoveSummary("qualified", 0, 0, Array.from({ length: 7 }, (_, i) => ({ name: `P${i}`, error: "x" })));
check("a total failure says nothing moved", allFail.title === "7 deals not moved to Qualified", allFail.title);
check("a long failure list is cut to five plus a count", (allFail.description ?? "").includes("…and 2 more"), String(allFail.description));

console.log("\n=== 9. Paging label ===");
check("first page", pageRangeLabel(0, 50, 712) === "1–50 of 712", pageRangeLabel(0, 50, 712));
check("last partial page", pageRangeLabel(14, 50, 712) === "701–712 of 712", pageRangeLabel(14, 50, 712));
check("empty", pageRangeLabel(0, 50, 0) === "0 of 0", pageRangeLabel(0, 50, 0));
check("thousands separated", pageRangeLabel(0, 200, 1234) === "1–200 of 1,234", pageRangeLabel(0, 200, 1234));

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail > 0 ? 1 : 0);
