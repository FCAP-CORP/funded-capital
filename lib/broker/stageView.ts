/**
 * What a broker is told about the stage of their deal.
 *
 * The CRM has sixteen stages because Luis needs sixteen. A broker does not:
 * `application_in` and `underwriting` are the same news to them, and
 * `draw_cycle` is a servicing detail on a loan they already earned. Showing the
 * internal vocabulary would leak how the desk works and invite questions about
 * distinctions that do not concern them.
 *
 * So this is a deliberate narrowing, in ONE place, and every internal stage
 * must appear here — `stageView.regress.ts` fails the build if a stage is added
 * to the schema without deciding what a broker sees. That is the bug class that
 * has already shipped three times on this project.
 *
 * `waitingOnBroker` is the field that earns its keep. The Google Sheet this
 * replaces showed a flat status; it could never say "this one is yours to
 * move". A term sheet sitting unsigned is the most expensive thing on a broker's
 * screen, and now it says so.
 */

export type StageTone = "received" | "progress" | "action" | "funded" | "closed";

export interface BrokerStageView {
  /** What the broker reads. Never the internal stage name. */
  label: string;
  tone: StageTone;
  /** True when the next move belongs to the broker or their borrower. */
  waitingOnBroker: boolean;
}

export const BROKER_STAGE: Record<string, BrokerStageView> = {
  lead: { label: "Received", tone: "received", waitingOnBroker: false },
  qualified: { label: "In review", tone: "progress", waitingOnBroker: false },

  // The ball is with the broker: we have issued, they must return it signed.
  term_sheet_issued: { label: "Term sheet issued", tone: "action", waitingOnBroker: true },
  term_sheet_signed: { label: "Term sheet signed", tone: "progress", waitingOnBroker: false },

  // A broker does not need to know which desk the file is on.
  application_in: { label: "In underwriting", tone: "progress", waitingOnBroker: false },
  underwriting: { label: "In underwriting", tone: "progress", waitingOnBroker: false },

  conditional_approval: { label: "Conditionally approved", tone: "action", waitingOnBroker: true },
  conditions_clearing: { label: "Clearing conditions", tone: "action", waitingOnBroker: true },

  clear_to_close: { label: "Clear to close", tone: "progress", waitingOnBroker: false },
  docs_out: { label: "Docs out for signature", tone: "action", waitingOnBroker: true },

  // Funded, active and drawing are one thing to a broker: it closed.
  funded: { label: "Funded", tone: "funded", waitingOnBroker: false },
  active: { label: "Funded", tone: "funded", waitingOnBroker: false },
  draw_cycle: { label: "Funded", tone: "funded", waitingOnBroker: false },

  payoff: { label: "Paid off", tone: "closed", waitingOnBroker: false },
  extension: { label: "Extended", tone: "funded", waitingOnBroker: false },

  /**
   * NOT "Declined". A deal ends for many reasons — the borrower went elsewhere,
   * the property fell through, they withdrew — and telling a broker their deal
   * was declined when it was not is both wrong and the kind of thing that costs
   * a relationship. "Closed" is what we actually know.
   */
  closed_lost: { label: "Closed", tone: "closed", waitingOnBroker: false },
};

/** Fails safe: an unknown stage reads as in-progress, never as funded or lost. */
export function brokerStage(stage: string | null | undefined): BrokerStageView {
  if (!stage) return { label: "In review", tone: "progress", waitingOnBroker: false };
  return BROKER_STAGE[stage] ?? { label: "In review", tone: "progress", waitingOnBroker: false };
}

/** Stages that are finished, for counting what is still live. */
const CLOSED = new Set(["payoff", "closed_lost"]);
export function isOpenForBroker(stage: string | null | undefined): boolean {
  return !CLOSED.has(stage ?? "");
}

/** Whether this deal counts as won, for the "Funded" tile. */
const WON = new Set(["funded", "active", "draw_cycle", "extension", "payoff"]);
export function isFundedForBroker(stage: string | null | undefined): boolean {
  return WON.has(stage ?? "");
}
