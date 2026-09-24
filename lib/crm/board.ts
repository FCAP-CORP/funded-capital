/**
 * The pipeline board: which deals go in which column, and what a drop means.
 *
 * Pure — no database, no React — so every rule is pinned by
 * lib/crm/board.regress.ts. The drag-and-drop component only renders what this
 * module decides.
 */

import { STAGE_LABEL, daysSince } from "./view";

/**
 * The columns: every stage in which a deal is still being WON.
 *
 * Funded and closed-lost are outcomes, not places a deal sits — they are drop
 * zones at the end of the board. Active, draw cycle, extension and payoff are
 * servicing: the sale is over. Putting servicing on a sales board would bury
 * the ten columns that need work under loans that are simply being paid.
 */
export const BOARD_STAGES = [
  "lead",
  "qualified",
  "term_sheet_issued",
  "term_sheet_signed",
  "application_in",
  "underwriting",
  "conditional_approval",
  "conditions_clearing",
  "clear_to_close",
  "docs_out",
] as const;
export type BoardStage = (typeof BOARD_STAGES)[number];

export const OUTCOME_STAGES = ["funded", "closed_lost"] as const;
export type OutcomeStage = (typeof OUTCOME_STAGES)[number];

export const SERVICING_STAGES = ["active", "draw_cycle", "extension", "payoff"] as const;

export function isBoardStage(stage: string): stage is BoardStage {
  return (BOARD_STAGES as readonly string[]).includes(stage);
}
export function isOutcomeStage(stage: string): stage is OutcomeStage {
  return (OUTCOME_STAGES as readonly string[]).includes(stage);
}

/** Days in one stage before a card is flagged. Matches the dashboard's "stalled". */
export const STALE_DAYS = 30;

export interface BoardSource {
  id: string;
  stage: string;
  name: string;
  product: string;
  requestedAmount: string | null;
  stageEnteredAt: string | null;
  lastContactAt: string | null;
}

export interface BoardCard {
  id: string;
  stage: BoardStage;
  name: string;
  product: string;
  amount: number;
  daysInStage: number | null;
  stale: boolean;
  daysSinceContact: number | null;
  stageEnteredAt: string | null;
}

export interface BoardColumn {
  stage: BoardStage;
  label: string;
  cards: BoardCard[];
  count: number;
  requested: number;
}

export interface BoardSummary {
  funded: number;
  lost: number;
  servicing: number;
}

function amountOf(v: string | null): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function timeOf(iso: string | null): number {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? -Infinity : t;
}

export function toCard(row: BoardSource, now: Date = new Date()): BoardCard | null {
  if (!isBoardStage(row.stage)) return null;
  const days = daysSince(row.stageEnteredAt, now);
  return {
    id: row.id,
    stage: row.stage,
    name: row.name?.trim() || "Unnamed borrower",
    product: row.product,
    amount: amountOf(row.requestedAmount),
    daysInStage: days,
    stale: days !== null && days >= STALE_DAYS,
    daysSinceContact: daysSince(row.lastContactAt, now),
    stageEnteredAt: row.stageEnteredAt,
  };
}

/**
 * Every board column, in stage order, including the empty ones.
 *
 * Empty columns stay: a board that drops the "Underwriting" column when nothing
 * is in underwriting cannot receive a card dragged there. Within a column the
 * newest arrival is first, so a fresh lead is at the top of Lead rather than
 * under a hundred old ones; the amber age badge is what surfaces the stuck.
 */
export function buildBoard(rows: BoardSource[], now: Date = new Date()): BoardColumn[] {
  const byStage = new Map<BoardStage, BoardCard[]>(BOARD_STAGES.map((s) => [s, []]));
  for (const row of rows) {
    const card = toCard(row, now);
    if (card) byStage.get(card.stage)!.push(card);
  }
  return BOARD_STAGES.map((stage) => {
    const cards = byStage.get(stage)!.sort((a, b) => {
      const t = timeOf(b.stageEnteredAt) - timeOf(a.stageEnteredAt);
      return t !== 0 ? t : a.name.localeCompare(b.name);
    });
    return {
      stage,
      label: STAGE_LABEL[stage] ?? stage,
      cards,
      count: cards.length,
      requested: cards.reduce((s, c) => s + c.amount, 0),
    };
  });
}

/** What is NOT on the board, so the board can say so instead of silently omitting it. */
export function offBoard(rows: BoardSource[]): BoardSummary {
  let funded = 0, lost = 0, servicing = 0;
  for (const r of rows) {
    if (r.stage === "funded") funded++;
    else if (r.stage === "closed_lost") lost++;
    else if ((SERVICING_STAGES as readonly string[]).includes(r.stage)) servicing++;
  }
  return { funded, lost, servicing };
}

export type DropIntent =
  | { kind: "noop" }
  | { kind: "invalid" }
  | { kind: "move"; to: BoardStage }
  | { kind: "confirm_funded" }
  | { kind: "needs_reason" };

/**
 * What dropping a card on a target means.
 *
 * Funded asks first because it moves the month's numbers on the dashboard, and
 * a mis-drop there is the one that would be reported as revenue. Lost asks WHY,
 * because a lost deal with no reason teaches nothing — the `lost_reason` column
 * has existed since the first migration and nothing had ever written to it.
 * Moving backwards between working stages is allowed: deals do go back.
 */
export function dropIntent(fromStage: string, toStage: string): DropIntent {
  if (fromStage === toStage) return { kind: "noop" };
  if (toStage === "funded") return { kind: "confirm_funded" };
  if (toStage === "closed_lost") return { kind: "needs_reason" };
  if (isBoardStage(toStage)) return { kind: "move", to: toStage };
  return { kind: "invalid" };
}

/**
 * Apply a move to the cards the board is showing, before the server answers.
 *
 * A card moved to an outcome leaves the board. Everything else is untouched,
 * and the card's age resets because it has just entered a new stage.
 */
export function applyMove(
  rows: BoardSource[],
  id: string,
  toStage: string,
  now: Date = new Date(),
): BoardSource[] {
  return rows.map((r) =>
    r.id === id ? { ...r, stage: toStage, stageEnteredAt: now.toISOString() } : r,
  );
}

/* ------------------------------------------------------------ lost reasons */

export const LOST_REASONS = [
  "Went with another lender",
  "Rate or terms",
  "Didn't qualify",
  "Not our product",
  "Deal fell through",
  "Stopped responding",
  "Duplicate file",
  "Other",
] as const;

export const MAX_LOST_NOTE = 280;

export type ParsedReason = { ok: true; value: string } | { ok: false; error: string };

/**
 * Turn the chosen reason and optional note into the stored text.
 *
 * A fixed first half so the reasons can be counted later ("how many did we lose
 * on rate?"), and free text after it for the detail. "Other" must say what.
 */
export function parseLostReason(choice: unknown, note: unknown): ParsedReason {
  if (typeof choice !== "string" || !(LOST_REASONS as readonly string[]).includes(choice)) {
    return { ok: false, error: "Pick why it was lost." };
  }
  const detail = typeof note === "string" ? note.trim() : "";
  if (detail.length > MAX_LOST_NOTE) {
    return { ok: false, error: `Keep the note under ${MAX_LOST_NOTE} characters.` };
  }
  if (choice === "Other" && !detail) {
    return { ok: false, error: "Say what happened." };
  }
  return { ok: true, value: detail ? `${choice} — ${detail}` : choice };
}
