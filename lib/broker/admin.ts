/**
 * The rules for running a brokerage relationship — pure, and separate from the
 * database on purpose.
 *
 * `lib/broker/scope.ts` answers "what may this broker see?". This file answers
 * the question one step earlier: "who is in which firm, and which deals belong
 * to them?" Every decision here ends with somebody being able to read a
 * borrower's name, phone number and financial position, so none of it is
 * inferred and none of it happens implicitly.
 *
 * THE DESIGN DECISION THIS FILE EXISTS TO ENFORCE: a deal is attached to a
 * broker by Luis, explicitly, one at a time — never by a background email
 * match at sign-in. An email address is not an authentication factor, and the
 * cost of getting it wrong is a competitor reading a borrower file.
 *
 * Nothing in here imports lib/db, so `admin.regress.ts` can exercise all of it
 * without a connection string. The writes live in admin.server.ts.
 */

import type { BrokerRole, BrokerStatus } from "./scope";

export const BROKER_ROLES: readonly BrokerRole[] = ["owner", "lead", "member"] as const;
export const BROKER_STATUSES: readonly BrokerStatus[] = ["active", "suspended"] as const;

/** What each role actually buys, in the words shown next to the picker. */
export const ROLE_DESCRIPTION: Record<BrokerRole, string> = {
  owner: "Sees every deal at the firm and can work them. The firm's principal.",
  lead: "Sees every deal at the firm and can work them.",
  member: "Sees only the deals they filed themselves.",
};

export const FIRM_NAME_MAX = 120;

/* ------------------------------------------------------------------ email */

/**
 * One spelling of an email, or null.
 *
 * Everything downstream compares against this form, so "Jasson@LegacyHML.com "
 * and "jasson@legacyhml.com" are the same person and are never two rows.
 * Deliberately conservative: it lowercases and trims and does nothing else. No
 * plus-address stripping, no dot folding — those are provider-specific
 * conventions, and treating two genuinely different addresses as one is exactly
 * the mistake that hands the wrong person a borrower file.
 */
export function normaliseEmail(v: string | null | undefined): string | null {
  const s = (v ?? "").trim().toLowerCase();
  if (!s) return null;
  // Not validation — just a floor. A string with no "@" cannot be an address,
  // and matching on one would make every blank-ish value equal to every other.
  if (!s.includes("@")) return null;
  return s;
}

/** Exact match after normalising. Never a prefix, suffix or domain match. */
export function sameEmail(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normaliseEmail(a);
  const y = normaliseEmail(b);
  if (!x || !y) return false;
  return x === y;
}

/* ------------------------------------------------------------------ firms */

export type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

export function validateFirmName(raw: string | null | undefined): Validated<string> {
  const name = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, error: "Give the firm a name." };
  if (name.length > FIRM_NAME_MAX) {
    return { ok: false, error: `Keep the name under ${FIRM_NAME_MAX} characters.` };
  }
  return { ok: true, value: name };
}

export function isBrokerRole(v: unknown): v is BrokerRole {
  return typeof v === "string" && (BROKER_ROLES as readonly string[]).includes(v);
}

export function isBrokerStatus(v: unknown): v is BrokerStatus {
  return typeof v === "string" && (BROKER_STATUSES as readonly string[]).includes(v);
}

/* ------------------------------------------------------- the broker queue */

export interface BrokerQueueRow {
  id: string;
  email: string;
  name: string | null;
  firmId: string | null;
  firmName: string | null;
  role: BrokerRole;
  status: BrokerStatus;
  /** How many applications already carry this person's Clerk id. */
  deals: number;
  firstSeenAt: string | null;
}

/**
 * Unassigned brokers first — that queue is the actual work.
 *
 * Within each group, newest sign-up first, because an unassigned broker is
 * waiting on Luis and the person who registered this morning is the one about
 * to email asking why their dashboard is empty.
 */
export function sortBrokerQueue(rows: BrokerQueueRow[]): BrokerQueueRow[] {
  return [...rows].sort((a, b) => {
    const aUnassigned = a.firmId === null ? 0 : 1;
    const bUnassigned = b.firmId === null ? 0 : 1;
    if (aUnassigned !== bUnassigned) return aUnassigned - bUnassigned;

    const firm = (a.firmName ?? "").localeCompare(b.firmName ?? "");
    if (firm !== 0) return firm;

    const at = a.firstSeenAt ? Date.parse(a.firstSeenAt) : 0;
    const bt = b.firstSeenAt ? Date.parse(b.firstSeenAt) : 0;
    if (at !== bt) return bt - at;

    return (a.name ?? a.email).localeCompare(b.name ?? b.email);
  });
}

/* ----------------------------------------------------------- claiming deals */

/**
 * The three facts about an application that decide whether it may be attached,
 * and nothing else. `brokerEmail` is the address recorded on the application's
 * `broker` participant at submission — not typed in anywhere.
 */
export interface ClaimableDeal {
  applicationId: string;
  submittedByUserId: string | null;
  brokerFirmId: string | null;
  /** Null when the application has no broker participant at all. */
  brokerEmail: string | null;
}

export interface ClaimingBroker {
  id: string;
  clerkUserId: string;
  email: string;
  firmId: string | null;
  status: BrokerStatus;
}

export type ClaimCheck = { ok: true } | { ok: false; reason: string };

/**
 * May this deal be attached to this broker?
 *
 * Read the refusals as a list of the ways this goes wrong in practice:
 *
 *  - NO BROKER PARTICIPANT. Website and BiggerPockets leads have none. They are
 *    Funded Capital's own borrowers, and this is the structural guarantee that
 *    a misclick can never hand one to a brokerage — not a warning dialog, not a
 *    careful UI, a condition that cannot be satisfied.
 *
 *  - EMAIL DOES NOT MATCH. Checked here again even though the screen only
 *    offers matching deals, because a server action is an addressable endpoint:
 *    a crafted POST can name any application id, and a check that lives only in
 *    the list that was rendered is not a check.
 *
 *  - ALREADY ATTACHED. Attaching is a one-way door. Re-pointing a deal at a
 *    different broker would silently remove it from the first one's dashboard,
 *    and the history of who worked it lives nowhere else.
 *
 *  - THE BROKER HAS NO FIRM. This one is not obvious and matters most.
 *    `applications.broker_firm_id` is stamped ONCE and never recalculated.
 *    Attaching before the firm exists would stamp null there permanently, so
 *    the deal would show on that one person's dashboard and stay invisible to
 *    their colleagues forever — including after Luis assigns them. Assign the
 *    firm first; then attach.
 */
export function canClaimDeal(broker: ClaimingBroker, deal: ClaimableDeal): ClaimCheck {
  if (broker.status !== "active") {
    return { ok: false, reason: "That broker is suspended." };
  }
  if (!broker.firmId) {
    return { ok: false, reason: "Assign this broker to a firm first — otherwise the deal never reaches their colleagues." };
  }
  if (!deal.brokerEmail) {
    return { ok: false, reason: "That deal has no broker on it. It came to Funded Capital directly." };
  }
  if (deal.submittedByUserId) {
    return { ok: false, reason: "That deal is already attached to a broker." };
  }
  if (deal.brokerFirmId) {
    return { ok: false, reason: "That deal already belongs to a firm." };
  }
  if (!sameEmail(deal.brokerEmail, broker.email)) {
    return { ok: false, reason: "The broker email on that deal does not match this broker." };
  }
  return { ok: true };
}

/**
 * The exact columns an approved claim writes.
 *
 * The firm comes from the BROKER'S CURRENT ROW, which is the only moment that
 * is ever true — from here the stamp is frozen, so a broker who later moves
 * brokerage leaves these deals behind with the firm that worked them.
 */
export function claimPatch(broker: ClaimingBroker): {
  submittedByUserId: string;
  brokerFirmId: string;
} {
  if (!broker.firmId) {
    // Unreachable through canClaimDeal, and a throw rather than a silent null
    // because a null here is the permanent-orphan bug described above.
    throw new Error("claimPatch called for a broker with no firm");
  }
  return { submittedByUserId: broker.clerkUserId, brokerFirmId: broker.firmId };
}

/* ---------------------------------------------------------------- display */

export function firmLabel(name: string | null | undefined): string {
  return name?.trim() || "Unassigned";
}

/** "3 deals" / "1 deal" / "No deals yet" — used in a few places, so it is here. */
export function dealCountLabel(n: number): string {
  if (n <= 0) return "No deals yet";
  return `${n.toLocaleString("en-US")} ${n === 1 ? "deal" : "deals"}`;
}
