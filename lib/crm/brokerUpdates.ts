/**
 * Broker update emails — what the broker hears when Luis moves their deal or
 * asks for documents, and when they hear nothing.
 *
 * PURE. Pinned by brokerUpdates.regress.ts. The sending is
 * lib/crm/brokerUpdates.server.ts through the Gmail executor, from Luis's own
 * mailbox, the moment he makes the change (his choice, 30 Sep 2026).
 *
 * WHEN A STAGE MOVE EMAILS THE BROKER
 *   - the deal has a broker (a house lead never emails anyone), and Luis has
 *     not switched broker emails off for this deal;
 *   - the stage the BROKER sees changes (application_in → underwriting are both
 *     "In underwriting" to them, so that move is silent);
 *   - it is a move forward into one of NOTIFY_STAGES, or into closed_lost.
 *     A step backwards (a correction) is silent: an email that walks a deal
 *     back reads like bad news that nobody decided to send.
 *
 * WHAT IT NEVER SAYS: a rate, an amount, a guarantee, or why a deal was lost.
 */

import { createHash } from "node:crypto";
import { brokerStage } from "@/lib/broker/stageView";

export const STAGE_ORDER = [
  "lead", "qualified", "term_sheet_issued", "term_sheet_signed", "application_in", "underwriting",
  "conditional_approval", "conditions_clearing", "clear_to_close", "docs_out", "funded",
  "active", "draw_cycle", "extension", "payoff", "closed_lost",
] as const;

/** Stages worth an email when a deal moves forward into them. */
export const NOTIFY_STAGES = [
  "term_sheet_issued", "application_in", "underwriting", "conditional_approval",
  "conditions_clearing", "clear_to_close", "docs_out", "funded", "closed_lost",
] as const;

const rank = (s: string) => (STAGE_ORDER as readonly string[]).indexOf(s);

export function stageWorthEmail(from: string | null | undefined, to: string): boolean {
  if (!(NOTIFY_STAGES as readonly string[]).includes(to)) return false;
  if (from && brokerStage(from).label === brokerStage(to).label) return false;
  if (to === "closed_lost") return from !== "closed_lost";
  const f = from ? rank(from) : -1;
  // From closed_lost back into play is a reopen: worth telling them.
  if (from === "closed_lost") return true;
  return rank(to) > f;
}

export const DEAL_LINK = (applicationId: string) => `https://www.fundedcapital.com/broker-portal/deal/${applicationId}`;

export type DealWords = { borrower: string | null; property: string | null };

/** "Tony Esposito - 358 Cozart Ave SW", or whichever half exists. */
export function dealName(d: DealWords): string {
  const parts = [d.borrower?.trim(), d.property?.trim()].filter((x): x is string => !!x);
  return parts.length ? parts.join(" - ") : "your deal";
}

export function firstNameOf(name: string | null | undefined): string | null {
  const f = (name ?? "").trim().split(/\s+/)[0];
  return f && /^[\p{L}'-]{2,}$/u.test(f) ? f : null;
}

export type DocLine = { label: string; note: string | null };

function docList(docs: readonly DocLine[]): string {
  return docs.map((d) => `- ${d.label}${d.note ? ` (${d.note})` : ""}`).join("\n");
}

const clean = (s: string) => s.replace(/[\r\n]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 150);

export type Email = { subject: string; body: string };

type StageCopy = { subject: (deal: string) => string; lead: (deal: string) => string };

const STAGE_COPY: Record<string, StageCopy> = {
  term_sheet_issued: {
    subject: (d) => `Term sheet issued: ${d}`,
    lead: (d) => `The term sheet for ${d} is out.`,
  },
  application_in: {
    subject: (d) => `In underwriting: ${d}`,
    lead: (d) => `${d} is with underwriting now.`,
  },
  underwriting: {
    subject: (d) => `In underwriting: ${d}`,
    lead: (d) => `${d} is with underwriting now.`,
  },
  conditional_approval: {
    subject: (d) => `Conditionally approved: ${d}`,
    lead: (d) => `${d} is conditionally approved, subject to the remaining conditions.`,
  },
  conditions_clearing: {
    subject: (d) => `Clearing conditions: ${d}`,
    lead: (d) => `We're clearing the remaining conditions on ${d}.`,
  },
  clear_to_close: {
    subject: (d) => `Clear to close: ${d}`,
    lead: (d) => `${d} is clear to close. We'll be in touch on timing.`,
  },
  docs_out: {
    subject: (d) => `Closing documents out: ${d}`,
    lead: (d) => `Closing documents for ${d} are out for signature.`,
  },
  funded: {
    subject: (d) => `Funded: ${d}`,
    lead: (d) => `${d} has funded. Thank you for bringing it to us.`,
  },
  closed_lost: {
    subject: (d) => `File closed: ${d}`,
    lead: (d) => `We've closed the file on ${d}. If anything changes, reply to this email and we'll pick it back up.`,
  },
};

/**
 * The stage email. `openDocs` are the documents still needed (for a move to
 * term sheet that is the list that just started itself), so one email says
 * both "where it stands" and "what we need" — never two emails for one click.
 */
export function stageEmail(p: {
  to: string;
  brokerName: string | null;
  deal: DealWords;
  applicationId: string;
  openDocs: readonly DocLine[];
}): Email | null {
  const copy = STAGE_COPY[p.to];
  if (!copy) return null;
  const deal = dealName(p.deal);
  const hi = firstNameOf(p.brokerName);
  const lines = [`Hi${hi ? ` ${hi}` : ""},`, "", copy.lead(deal)];
  const docsWanted = p.to !== "funded" && p.to !== "closed_lost" && p.openDocs.length > 0;
  if (docsWanted) {
    lines.push(
      "",
      p.openDocs.length === 1 ? "To keep it moving, we still need one document:" : `To keep it moving, we still need ${p.openDocs.length} documents:`,
      docList(p.openDocs),
      "",
      `You can upload each one on the deal page: ${DEAL_LINK(p.applicationId)}`,
    );
  } else if (p.to !== "closed_lost") {
    lines.push("", `Where it stands, any time: ${DEAL_LINK(p.applicationId)}`);
  }
  lines.push("", "Any questions, just reply here.", "", "Thanks,");
  return { subject: clean(copy.subject(deal)), body: lines.join("\n") };
}

/** Documents asked for outside a stage move: "Create the list now", or one item added. */
export function docsEmail(p: {
  brokerName: string | null;
  deal: DealWords;
  applicationId: string;
  docs: readonly DocLine[];
  added: boolean;
}): Email | null {
  if (p.docs.length === 0) return null;
  const deal = dealName(p.deal);
  const hi = firstNameOf(p.brokerName);
  const lead = p.added
    ? (p.docs.length === 1 ? `One more document on ${deal}:` : `A few more documents on ${deal}:`)
    : (p.docs.length === 1 ? `To keep ${deal} moving, we need one document:` : `To keep ${deal} moving, we need ${p.docs.length} documents:`);
  const body = [
    `Hi${hi ? ` ${hi}` : ""},`, "", lead, docList(p.docs), "",
    `You can upload each one on the deal page: ${DEAL_LINK(p.applicationId)}`,
    "", "Any questions, just reply here.", "", "Thanks,",
  ].join("\n");
  return { subject: clean(`Documents needed: ${deal}`), body };
}

/**
 * ONE EMAIL PER NEWS, EVER (audit 30 Sep 2026). The Gmail executor refuses a
 * second send with the same idempotency key (it replays the first outcome), so
 * the key IS the dedupe: the same deal reaching the same stage again — a
 * double-click, two open tabs, or forward → back → forward — can never email
 * the broker twice about it. A documents email is keyed on exactly which items
 * it lists, so "Create the list now" pressed twice sends once, while a new item
 * added later still gets its own email.
 *
 * The executor wants a UUID, so the key is a name-based UUID (SHA-256 of the
 * name, laid out as a version-5-style UUID): same name, same UUID, on every
 * server, forever.
 */
export function stableUuid(name: string): string {
  const h = createHash("sha256").update(name).digest();
  h[6] = (h[6] & 0x0f) | 0x50; // version 5 layout
  h[8] = (h[8] & 0x3f) | 0x80; // RFC 4122 variant
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

export function stageUpdateKey(applicationId: string, toStage: string): string {
  return stableUuid(`broker-update:stage:${applicationId.toLowerCase()}:${toStage}`);
}

/** Order-insensitive: the same set of items is the same email. */
export function docsUpdateKey(applicationId: string, requestIds: readonly string[]): string {
  const ids = [...new Set(requestIds.map((i) => i.toLowerCase()))].sort();
  return stableUuid(`broker-update:docs:${applicationId.toLowerCase()}:${ids.join(",")}`);
}

/** The template key recorded on the outbox row, so the timeline and reports can tell these apart. */
export const BROKER_UPDATE_TEMPLATE = "broker-update";
