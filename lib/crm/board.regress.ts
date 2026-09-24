/**
 * Regression suite for the pipeline board's rules.
 *
 * The board is the one screen where a slip of the mouse changes a deal's stage,
 * so what a drop MEANS is pinned here, not left to the component.
 */

import {
  BOARD_STAGES,
  LOST_REASONS,
  MAX_LOST_NOTE,
  OUTCOME_STAGES,
  STALE_DAYS,
  applyMove,
  buildBoard,
  dropIntent,
  offBoard,
  parseLostReason,
  toCard,
  type BoardSource,
} from "./board";
import { STAGE_ORDER } from "./view";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};

const NOW = new Date("2026-09-24T15:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
let seq = 0;
const row = (over: Partial<BoardSource> = {}): BoardSource => ({
  id: over.id ?? `r${++seq}`,
  stage: "lead",
  name: "Test Borrower",
  product: "fix_and_flip",
  requestedAmount: "100000",
  stageEnteredAt: daysAgo(2),
  lastContactAt: daysAgo(1),
  ...over,
});

console.log("\n=== 1. The columns are exactly the stages still being won ===");
check("ten columns", BOARD_STAGES.length === 10, String(BOARD_STAGES.length));
check("every column is a real stage", BOARD_STAGES.every((s) => STAGE_ORDER.includes(s)), "all known");
check("columns run in pipeline order", BOARD_STAGES.every((s, i) => i === 0 || STAGE_ORDER.indexOf(s) > STAGE_ORDER.indexOf(BOARD_STAGES[i - 1])), "ordered");
check("funded is an outcome, not a column", !(BOARD_STAGES as readonly string[]).includes("funded") && (OUTCOME_STAGES as readonly string[]).includes("funded"), "outcome");
check("closed_lost is an outcome, not a column", !(BOARD_STAGES as readonly string[]).includes("closed_lost"), "outcome");
const accounted = new Set<string>([...BOARD_STAGES, ...OUTCOME_STAGES, "active", "draw_cycle", "extension", "payoff"]);
check("every stage in the database is accounted for somewhere", STAGE_ORDER.every((s) => accounted.has(s)), STAGE_ORDER.filter((s) => !accounted.has(s)).join(",") || "all");

console.log("\n=== 2. Building the board ===");
const board = buildBoard([
  row({ id: "a", stage: "lead", stageEnteredAt: daysAgo(40), name: "Old Lead" }),
  row({ id: "b", stage: "lead", stageEnteredAt: daysAgo(1), name: "New Lead" }),
  row({ id: "c", stage: "underwriting", requestedAmount: "250000" }),
  row({ id: "d", stage: "funded" }),
  row({ id: "e", stage: "active" }),
  row({ id: "f", stage: "closed_lost" }),
], NOW);
check("all ten columns are present, even empty ones", board.length === 10, String(board.length));
check("empty columns stay so they can receive a drop", board.find((c) => c.stage === "docs_out")!.count === 0, "docs_out present, empty");
const lead = board.find((c) => c.stage === "lead")!;
check("lead holds its two cards", lead.count === 2, String(lead.count));
check("newest arrival first", lead.cards[0].id === "b", lead.cards.map((c) => c.id).join(","));
check("40 days in stage is flagged stale", lead.cards[1].stale === true, `${lead.cards[1].daysInStage} days`);
check("1 day in stage is not stale", lead.cards[0].stale === false, `${lead.cards[0].daysInStage} days`);
check("stale threshold matches the dashboard (30)", STALE_DAYS === 30, String(STALE_DAYS));
check("column total sums requested amounts", board.find((c) => c.stage === "underwriting")!.requested === 250000, String(board.find((c) => c.stage === "underwriting")!.requested));
check("funded, servicing and lost cards are not on the board", board.reduce((n, c) => n + c.count, 0) === 3, `${board.reduce((n, c) => n + c.count, 0)} on board`);
const off = offBoard([row({ stage: "funded" }), row({ stage: "funded" }), row({ stage: "active" }), row({ stage: "payoff" }), row({ stage: "closed_lost" }), row({ stage: "lead" })]);
check("the board says what it left off", off.funded === 2 && off.servicing === 2 && off.lost === 1, JSON.stringify(off));

console.log("\n=== 3. Bad data does not break the board ===");
check("a missing amount counts as zero", toCard(row({ requestedAmount: null }), NOW)!.amount === 0, "0");
check("a nonsense amount counts as zero", toCard(row({ requestedAmount: "abc" }), NOW)!.amount === 0, "0");
check("a negative amount counts as zero", toCard(row({ requestedAmount: "-5" }), NOW)!.amount === 0, "0");
check("a blank name gets a label", toCard(row({ name: "   " }), NOW)!.name === "Unnamed borrower", "labelled");
check("an unknown stage is dropped, not crashed on", toCard(row({ stage: "mystery" }), NOW) === null, "null");
check("no stage date means no age and not stale", (() => { const c = toCard(row({ stageEnteredAt: null }), NOW)!; return c.daysInStage === null && !c.stale; })(), "null / false");
check("an empty book builds ten empty columns", buildBoard([], NOW).every((c) => c.count === 0) && buildBoard([], NOW).length === 10, "ok");

console.log("\n=== 4. What a drop means ===");
check("same column is a no-op", dropIntent("lead", "lead").kind === "noop", "noop");
check("forward move is a plain move", dropIntent("lead", "qualified").kind === "move", "move");
check("backward move is allowed", dropIntent("underwriting", "lead").kind === "move", "move");
check("a jump across stages is allowed", dropIntent("lead", "clear_to_close").kind === "move", "move");
check("funded asks for confirmation", dropIntent("docs_out", "funded").kind === "confirm_funded", "confirm");
check("lost asks for a reason", dropIntent("underwriting", "closed_lost").kind === "needs_reason", "reason");
check("servicing is not a drop target", dropIntent("docs_out", "active").kind === "invalid", "invalid");
check("junk is not a drop target", dropIntent("lead", "nowhere").kind === "invalid", "invalid");
const mv = dropIntent("lead", "qualified");
check("a move names its destination", mv.kind === "move" && mv.to === "qualified", JSON.stringify(mv));

console.log("\n=== 5. Moving a card before the server answers ===");
const before = [row({ id: "x", stage: "lead", stageEnteredAt: daysAgo(50) }), row({ id: "y", stage: "lead" })];
const after = applyMove(before, "x", "qualified", NOW);
check("the card changes column", after.find((r) => r.id === "x")!.stage === "qualified", "qualified");
check("its age resets, it just entered", after.find((r) => r.id === "x")!.stageEnteredAt === NOW.toISOString(), "now");
check("no other card moves", after.find((r) => r.id === "y")!.stage === "lead", "untouched");
check("the original list is not mutated", before.find((r) => r.id === "x")!.stage === "lead", "immutable");
check("moving to lost takes it off the board", buildBoard(applyMove(before, "x", "closed_lost", NOW), NOW).reduce((n, c) => n + c.count, 0) === 1, "1 left");
check("an unknown id changes nothing", JSON.stringify(applyMove(before, "zzz", "qualified", NOW)) === JSON.stringify(before), "unchanged");

console.log("\n=== 6. Why a deal was lost ===");
const r1 = parseLostReason("Rate or terms", "");
check("a reason alone is enough", r1.ok && r1.value === "Rate or terms", r1.ok ? r1.value : r1.error);
const r2 = parseLostReason("Went with another lender", "  Kiavi, 25bps lower  ");
check("a note is appended and trimmed", r2.ok && r2.value === "Went with another lender — Kiavi, 25bps lower", r2.ok ? r2.value : r2.error);
check("no reason is refused", !parseLostReason("", "").ok, "refused");
check("an invented reason is refused", !parseLostReason("Because", "").ok, "refused");
check("a non-string reason is refused", !parseLostReason(3, "").ok, "refused");
check("Other with no note is refused", !parseLostReason("Other", "  ").ok, "refused");
check("Other with a note is accepted", parseLostReason("Other", "Borrower passed away").ok, "accepted");
check("an overlong note is refused", !parseLostReason("Rate or terms", "x".repeat(MAX_LOST_NOTE + 1)).ok, "refused");
check("every listed reason is accepted", LOST_REASONS.filter((r) => r !== "Other").every((r) => parseLostReason(r, "").ok), "all");

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail > 0 ? 1 : 0);
