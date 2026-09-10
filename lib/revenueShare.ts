/**
 * Revenue Share Participation Program — shared types and helpers.
 *
 * The Google Sheet built from FundedCapital_RevenueShare_Participant_Tracker.xlsx
 * is the system of record. Nothing in this file hardcodes a contribution amount,
 * a designated loan size or a monthly share — every figure is read from the
 * sheet, where the Program Terms tab drives the formulas.
 *
 * COMPLIANCE — read before editing.
 * The program runs parallel rate tables — Original (grandfathered) and the
 * Anchor Series — and no participant-facing surface may reveal that more than
 * one exists. `toParticipationView()` is the single
 * chokepoint that strips program version, tier and every internal field before
 * anything reaches a participant's browser. Participants see dollars and dates.
 * Never add a rate, a percentage or a tier label to ParticipationView.
 *
 * ONE PERSON HOLDS MANY PARTICIPATIONS. This is the normal case, not an edge
 * case — as of 2026-09 three participants hold eleven participations between
 * them. The unit of the tracker is a PARTICIPATION (one row, one designated
 * loan); the unit of the portal is a HOLDER (one email, many participations).
 * Anything that reports a single participation's figure as the person's whole
 * position is a bug.
 */

/** A row of the Participants sheet, exactly as the tracker holds it. Internal use only. */
export interface ParticipantRecord {
  participantId: string;
  fullName: string;
  entityName: string;
  email: string;
  phone: string;
  /**
   * INTERNAL. "Original" (grandfathered) or "Anchor" (the current table
   * from Sept 2026; the former "Current" 0.25% table was retired).
   * Never leaves the server.
   */
  programVersion: string;
  /** INTERNAL. Bronze/Silver/Gold (grandfathered) or Anchor I–V. Never leaves the server. */
  tier: string;
  capitalContributed: number;
  designatedLoanSize: number;
  monthlyRevenueShare: number;
  loanReference: string;
  property: string;
  fundingDate: string;
  termMonths: number;
  maturityDate: string;
  firstPaymentDue: string;
  paymentMethod: string;
  status: string;
  lockUpEnds: string;
  paymentsLogged: number;
  totalPaidToDate: number;
  paymentsDueToDate: number;
  amountDueToDate: number;
  balanceOwed: number;
  daysToMaturity: number;
  rolloverNoticeDue: string;
  alert: string;
  /** Optional. Add a "Documents Folder" column to the tracker to enable. */
  documentsFolder?: string;
}

/** One row of the Payment Schedule sheet. */
export interface ScheduledPayment {
  participantId: string;
  paymentNumber: number;
  dueDate: string;
  scheduledAmount: number;
  status: string;
  datePaid: string;
  amountPaid: number;
}

/** One row of the Payment Log sheet — a payment actually sent. */
export interface LoggedPayment {
  participantId: string;
  dateSent: string;
  paymentPeriod: string;
  amountSent: number;
  method: string;
  confirmationRef: string;
}

/**
 * What a participant is allowed to see about ONE of their participations.
 * Deliberately omits programVersion, tier, phone and every rate-derived field.
 */
export interface ParticipationView {
  /** The tracker's Participant ID column. One per participation, not per person. */
  participationId: string;
  displayName: string;
  capitalContributed: number;
  designatedLoanSize: number;
  monthlyRevenueShare: number;
  loanReference: string;
  property: string;
  fundingDate: string;
  termMonths: number;
  maturityDate: string;
  firstPaymentDue: string;
  paymentMethod: string;
  status: string;
  lockUpEnds: string;
  totalPaidToDate: number;
  paymentsLogged: number;
  daysToMaturity: number;
  documentsFolder: string;
}

/** One participation, with everything that belongs to it. */
export interface Participation {
  view: ParticipationView;
  schedule: ScheduledPayment[];
  payments: LoggedPayment[];
}

/**
 * Consolidated position across every participation a holder owns.
 * Capital, monthly share and loan volume count ACTIVE participations only —
 * a matured participation has already returned its capital and stopped paying,
 * so including it would overstate what the holder currently has at work.
 * Paid-to-date spans everything, because that is history and history counts.
 */
export interface HolderTotals {
  participationCount: number;
  activeCount: number;
  capitalContributed: number;
  monthlyRevenueShare: number;
  loanVolumeSupported: number;
  totalPaidToDate: number;
  paymentsLogged: number;
  /** Next date any participation pays, and the combined amount landing then. */
  nextPaymentDate: string | null;
  nextPaymentAmount: number;
  nextPaymentCount: number;
  earliestMaturity: string | null;
  latestMaturity: string | null;
}

export interface ParticipantPacket {
  holder: {
    displayName: string;
    participationCount: number;
  };
  participations: Participation[];
  totals: HolderTotals;
}

/** Aggregate view of the whole book. Admin only. */
export interface BookSummary {
  /** Distinct people, by email. Not the same as participation count. */
  holders: number;
  activeParticipants: number;
  totalParticipants: number;
  capitalDeployed: number;
  loanVolumeSupported: number;
  monthlyObligation: number;
  totalPaidToDate: number;
  dueThisMonth: number;
  dueThisMonthCount: number;
  overdueAmount: number;
  overdueCount: number;
  maturingWithin90: number;
  behindCount: number;
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const USD_CENTS = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Whole-dollar currency. Every participant-facing figure uses this. */
export function money(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return USD.format(n);
}

/** Currency with cents, for payment confirmations where exactness matters. */
export function moneyExact(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return USD_CENTS.format(n);
}

/**
 * Formats a sheet date without timezone drift.
 *
 * Apps Script serialises dates to ISO strings in UTC. Passing those to
 * toLocaleDateString() in a browser west of Greenwich renders the previous
 * day — a payment due on the 15th would display as the 14th. Reading the
 * date parts directly avoids that entirely.
 */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const iso = String(value).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return String(value);
  const [, y, mo, d] = m;
  const MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${MONTHS[Number(mo) - 1]} ${Number(d)}, ${y}`;
}

/** Long form, for statement headers. */
export function formatDateLong(value: string | null | undefined): string {
  if (!value) return "—";
  const iso = String(value).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return String(value);
  const [, y, mo, d] = m;
  const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${MONTHS[Number(mo) - 1]} ${Number(d)}, ${y}`;
}

/** Today as YYYY-MM-DD, in the same date-only space the sheet uses. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/* Derivation                                                          */
/* ------------------------------------------------------------------ */

export type PaymentState = "paid" | "scheduled" | "due" | "overdue";

/**
 * Resolves a schedule row to a display state.
 * The sheet's own Status column wins when it says PAID; otherwise the state
 * follows from the due date relative to today.
 */
export function paymentState(row: ScheduledPayment, today = todayIso()): PaymentState {
  const status = (row.status || "").trim().toUpperCase();
  if (status === "PAID") return "paid";
  const due = String(row.dueDate || "").slice(0, 10);
  if (!due) return "scheduled";
  if (due < today) return "overdue";
  if (due.slice(0, 7) === today.slice(0, 7)) return "due";
  return "scheduled";
}

export const PAYMENT_STATE_META: Record<
  PaymentState,
  { label: string; className: string }
> = {
  paid: { label: "Paid", className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  due: { label: "Due this month", className: "bg-gold-500/10 text-gold-700 ring-gold-600/25" },
  scheduled: { label: "Scheduled", className: "bg-slate-100 text-slate-600 ring-slate-500/20" },
  overdue: { label: "Overdue", className: "bg-red-50 text-red-700 ring-red-600/20" },
};

/** The next payment a participant should expect, or null once the term is done. */
export function nextScheduledPayment(
  schedule: ScheduledPayment[],
  today = todayIso()
): ScheduledPayment | null {
  const upcoming = schedule
    .filter((r) => paymentState(r, today) !== "paid" && r.dueDate)
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
  return upcoming[0] ?? null;
}

/**
 * Months elapsed since funding, floored. Drives the lock-up indicator.
 * Uses calendar months rather than 30-day blocks so it matches the
 * EDATE-based lock-up date the tracker computes.
 */
export function monthsSince(fundingDate: string, today = todayIso()): number {
  const f = String(fundingDate || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return 0;
  const [fy, fm, fd] = f.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  let months = (ty - fy) * 12 + (tm - fm);
  if (td < fd) months -= 1;
  return Math.max(0, months);
}

/** True once the 6-month lock-up has run. */
export function lockUpCleared(p: ParticipationView, today = todayIso()): boolean {
  const ends = String(p.lockUpEnds || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ends)) return false;
  return today >= ends;
}

/**
 * Progress through the term as a 0–1 fraction, for the maturity meter.
 * Clamped so an extended loan past maturity reads as full rather than over.
 */
export function termProgress(p: ParticipationView, today = todayIso()): number {
  const start = String(p.fundingDate || "").slice(0, 10);
  const end = String(p.maturityDate || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return 0;
  const s = Date.parse(start + "T00:00:00Z");
  const e = Date.parse(end + "T00:00:00Z");
  const t = Date.parse(today + "T00:00:00Z");
  if (!(e > s)) return 0;
  return Math.min(1, Math.max(0, (t - s) / (e - s)));
}

/* ------------------------------------------------------------------ */
/* The compliance chokepoint                                           */
/* ------------------------------------------------------------------ */

/**
 * Reduces one internal record to what a participant may see.
 *
 * Every participant-facing page MUST take its data from this function.
 * Fields are listed explicitly rather than spread-and-delete so that a new
 * column added to the tracker cannot silently reach a participant's browser.
 */
export function toParticipationView(r: ParticipantRecord): ParticipationView {
  return {
    participationId: r.participantId,
    displayName: r.entityName?.trim() ? r.entityName.trim() : r.fullName,
    capitalContributed: r.capitalContributed,
    designatedLoanSize: r.designatedLoanSize,
    monthlyRevenueShare: r.monthlyRevenueShare,
    loanReference: r.loanReference,
    property: r.property,
    fundingDate: r.fundingDate,
    termMonths: r.termMonths,
    maturityDate: r.maturityDate,
    firstPaymentDue: r.firstPaymentDue,
    paymentMethod: r.paymentMethod,
    status: r.status,
    lockUpEnds: r.lockUpEnds,
    totalPaidToDate: r.totalPaidToDate,
    paymentsLogged: r.paymentsLogged,
    daysToMaturity: r.daysToMaturity,
    documentsFolder: r.documentsFolder ?? "",
  };
}

/* ------------------------------------------------------------------ */
/* Holder aggregation (participant-facing)                             */
/* ------------------------------------------------------------------ */

function isActiveView(v: ParticipationView): boolean {
  return (v.status || "").trim().toLowerCase() === "active";
}

/**
 * Rolls a holder's participations into the consolidated position they see first.
 *
 * The next-payment figure is the sum of every participation paying on the
 * SAME earliest upcoming date, not the single earliest row. Every participation
 * pays on the 15th, so a holder with five of them receives one combined
 * transfer — showing them one participation's amount would understate it.
 */
export function summarizeHolder(
  participations: Participation[],
  today = todayIso()
): HolderTotals {
  const active = participations.filter((p) => isActiveView(p.view));

  // Earliest unpaid due date across every participation.
  let nextDate: string | null = null;
  for (const p of participations) {
    const next = nextScheduledPayment(p.schedule, today);
    const due = next ? String(next.dueDate).slice(0, 10) : "";
    if (!due) continue;
    if (nextDate === null || due < nextDate) nextDate = due;
  }

  // Everything landing on that date, across all participations.
  let nextAmount = 0;
  let nextCount = 0;
  if (nextDate) {
    for (const p of participations) {
      for (const row of p.schedule) {
        if (String(row.dueDate).slice(0, 10) !== nextDate) continue;
        if (paymentState(row, today) === "paid") continue;
        nextAmount += row.scheduledAmount || 0;
        nextCount += 1;
      }
    }
  }

  const maturities = active
    .map((p) => String(p.view.maturityDate || "").slice(0, 10))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();

  return {
    participationCount: participations.length,
    activeCount: active.length,
    capitalContributed: active.reduce((n, p) => n + (p.view.capitalContributed || 0), 0),
    monthlyRevenueShare: active.reduce((n, p) => n + (p.view.monthlyRevenueShare || 0), 0),
    loanVolumeSupported: active.reduce((n, p) => n + (p.view.designatedLoanSize || 0), 0),
    totalPaidToDate: participations.reduce((n, p) => n + (p.view.totalPaidToDate || 0), 0),
    paymentsLogged: participations.reduce((n, p) => n + (p.payments?.length || 0), 0),
    nextPaymentDate: nextDate,
    nextPaymentAmount: nextAmount,
    nextPaymentCount: nextCount,
    earliestMaturity: maturities[0] ?? null,
    latestMaturity: maturities.length ? maturities[maturities.length - 1] : null,
  };
}

/** Every payment ever sent to a holder, newest first, tagged by participation. */
export function allPayments(
  participations: Participation[]
): Array<LoggedPayment & { participationId: string; property: string }> {
  return participations
    .flatMap((p) =>
      p.payments.map((row) => ({
        ...row,
        participationId: p.view.participationId,
        property: p.view.property,
      }))
    )
    .sort((a, b) => String(b.dateSent).localeCompare(String(a.dateSent)));
}

/** Every scheduled payment across a holder, oldest first, tagged by participation. */
export function allScheduled(
  participations: Participation[]
): Array<ScheduledPayment & { participationId: string }> {
  return participations
    .flatMap((p) =>
      p.schedule.map((row) => ({ ...row, participationId: p.view.participationId }))
    )
    .sort(
      (a, b) =>
        String(a.dueDate).localeCompare(String(b.dueDate)) ||
        a.participationId.localeCompare(b.participationId)
    );
}

/* ------------------------------------------------------------------ */
/* Book aggregation (admin)                                            */
/* ------------------------------------------------------------------ */

function isActive(r: ParticipantRecord): boolean {
  return (r.status || "").trim().toLowerCase() === "active";
}

/**
 * Recomputes the tracker's Dashboard tab from the raw rows.
 *
 * Deliberately derived here rather than read from the sheet's Dashboard cells:
 * Apps Script returns cached formula results, and a figure that silently goes
 * stale on a page Luis uses to decide who gets paid is worse than no figure.
 */
export function summarizeBook(
  records: ParticipantRecord[],
  schedule: ScheduledPayment[],
  today = todayIso()
): BookSummary {
  const active = records.filter(isActive);
  const thisMonth = today.slice(0, 7);

  let dueThisMonth = 0;
  let dueThisMonthCount = 0;
  let overdueAmount = 0;
  let overdueCount = 0;

  for (const row of schedule) {
    const state = paymentState(row, today);
    const due = String(row.dueDate || "").slice(0, 10);
    if (!due) continue;
    if (due.slice(0, 7) === thisMonth && state !== "paid") {
      dueThisMonth += row.scheduledAmount || 0;
      dueThisMonthCount += 1;
    }
    if (state === "overdue") {
      overdueAmount += row.scheduledAmount || 0;
      overdueCount += 1;
    }
  }

  const holders = new Set(
    records.map((r) => (r.email || "").trim().toLowerCase()).filter(Boolean)
  );

  return {
    holders: holders.size,
    activeParticipants: active.length,
    totalParticipants: records.length,
    capitalDeployed: active.reduce((n, r) => n + (r.capitalContributed || 0), 0),
    loanVolumeSupported: active.reduce((n, r) => n + (r.designatedLoanSize || 0), 0),
    monthlyObligation: active.reduce((n, r) => n + (r.monthlyRevenueShare || 0), 0),
    totalPaidToDate: records.reduce((n, r) => n + (r.totalPaidToDate || 0), 0),
    dueThisMonth,
    dueThisMonthCount,
    overdueAmount,
    overdueCount,
    maturingWithin90: active.filter(
      (r) => Number.isFinite(r.daysToMaturity) && r.daysToMaturity >= 0 && r.daysToMaturity <= 90
    ).length,
    behindCount: active.filter((r) => (r.balanceOwed || 0) > 0).length,
  };
}
