/**
 * Funded Capital — Pricing Engine
 * ================================
 * Implements FundedCapital_PricingEngine_InputSpec_2026-07-09.
 *
 * Terminology (in-house):
 *   Initial Loan Amount — the day-one advance ($) against purchase/as-is/land
 *   Initial LTC         — that advance ÷ total cost basis (purchase + sunk costs)
 *   Holdback            — remaining rehab/construction budget, released by draw
 *   Total Loan Amount   — Initial Loan Amount + Holdback
 *
 * Refi mechanics (Luis 2026-07-14):
 *   Initial LTC is measured against TOTAL COST BASIS = purchase price + sunk costs.
 *   Ground-Up LTFC is measured against purchase + sunk + remaining budget.
 *   Fix & Flip has no LTC/LTFC cap — ARLTV (75%) governs.
 *   The Initial Loan Amount should cover the Estimated Payoff (warning, not a block).
 *   On a purchase, sunk costs = 0, so every purchase calculation is unchanged.
 *
 * Rate model:
 *   Bridge (Fix & Flip + Ground-Up):  MAX(floor 8.75%, postedBase[tier] + Σ adjusters)
 *   DSCR (Rental):                    MAX(floor 5.65%, 5yr UST + baseSpread[tier] + Σ adjusters)
 */

export type ProductKey = "fix_and_flip" | "new_construction" | "dscr" | "stabilized_bridge";
export type Channel = "retail" | "tpo";
export type LoanPurpose = "purchase" | "rate_term_refi" | "cash_out_refi";
export type DscrTerm = "frm_30" | "arm_10_6" | "arm_7_6" | "arm_5_6";
export type Ppp = "ppp_5yr" | "ppp_3yr" | "ppp_1yr" | "ppp_none";

export const isRefiPurpose = (p: LoanPurpose) => p !== "purchase";

export interface ProductMeta {
  key: ProductKey;
  label: string;
  family: "bridge" | "dscr";
  minLoan: number;
  maxLoan: number;
  minFico: number;
  termLabel: string;
  interestOnlyByDefault: boolean;
  experienceUnit: string;
}

// ---------- Confirmed rate tables ----------

const BRIDGE_POSTED_BASE: Record<number, number> = { 1: 0.0999, 2: 0.0975, 3: 0.095, 4: 0.09, 5: 0.0875 };
const BRIDGE_FLOOR = 0.0875;

/**
 * Base spread over the 5yr UST, by tier. CALIBRATED to the Funded Capital
 * internal engine (80 Brigham Ave quote, 2026-07-14): a Tier 3 cash-out priced
 * a 2.5354% full-amortizing spread = base 2.16% + cash-out 0.375%. Tier 3 is
 * exact; other tiers carry the same offset from the original sheet and should
 * be spot-checked against one live quote each.
 */
const DSCR_BASE_SPREAD: Record<number, number> = { 1: 0.0286, 2: 0.0251, 3: 0.0216, 4: 0.0181, 5: 0.0146 };
/**
 * FALLBACK 5yr US Treasury, used only if the live value can't be read.
 * The portal fetches the current rate from /api/treasury (data/treasury.json),
 * which a scheduled task refreshes at 8 AM and 1 PM ET. Keep this roughly current.
 */
export const DSCR_UST_BASIS_DEFAULT = 0.04257;
const DSCR_FLOOR = 0.0565;

export const MAX_COMBINED_POINTS = 5.0;

const ORIGINATION: Record<"bridge" | "dscr", Record<Channel, Record<number, number>>> = {
  bridge: {
    retail: { 1: 0.0275, 2: 0.025, 3: 0.0225, 4: 0.02, 5: 0.0175 },
    tpo: { 1: 0.015, 2: 0.01, 3: 0.01, 4: 0.01, 5: 0.01 },
  },
  dscr: {
    retail: { 1: 0.02, 2: 0.0175, 3: 0.015, 4: 0.0125, 5: 0.01 },
    tpo: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  },
};

const FEES: Record<"bridge" | "dscr", Record<number, { processing: number; underwriting: number }>> = {
  bridge: {
    1: { processing: 1250, underwriting: 1995 },
    2: { processing: 1250, underwriting: 1995 },
    3: { processing: 1250, underwriting: 1995 },
    4: { processing: 995, underwriting: 1695 },
    5: { processing: 0, underwriting: 995 },
  },
  dscr: {
    1: { processing: 1250, underwriting: 1995 },
    2: { processing: 1250, underwriting: 1995 },
    3: { processing: 995, underwriting: 1295 },
    4: { processing: 695, underwriting: 1295 },
    5: { processing: 0, underwriting: 1295 },
  },
};

export const THIRD_PARTY_FEES = {
  legalReview: 995,
  corelogix: 250, // CoreLogix valuation/data fee — DSCR (rental) deals
  servicingSetup: 30,
  appraisalRange: "$625 – $795",
  appraisalRangePortfolio: "$350 – $550",
  titleSettlement: "TBD",
};

// ---------- Adjuster grid (LLPA) ----------

interface Adj {
  rate: number;
  maxLtv?: number;
}

function ficoAdj(fico: number): Adj {
  if (fico >= 760) return { rate: -0.0025, maxLtv: 0 };
  if (fico >= 740) return { rate: -0.00125, maxLtv: 0 };
  if (fico >= 720) return { rate: 0, maxLtv: 0 };
  if (fico >= 700) return { rate: 0.00125, maxLtv: 0 };
  if (fico >= 680) return { rate: 0.00375, maxLtv: -0.05 };
  if (fico >= 660) return { rate: 0.00625, maxLtv: -0.05 };
  return { rate: 0.01, maxLtv: -0.1 };
}

function leverageAdj(ratio: number): Adj {
  const p = ratio * 100;
  if (p <= 60) return { rate: -0.0025 };
  if (p <= 65) return { rate: -0.00125 };
  if (p <= 70) return { rate: 0 };
  if (p <= 75) return { rate: 0.0025 };
  if (p <= 80) return { rate: 0.005 };
  return { rate: 0.0075 };
}

function loanSizeAdj(loan: number): Adj {
  // Loan size affects RATE only — no max-LTV haircut (removed pending real values, Luis 2026-07-14).
  if (loan < 150_000) return { rate: 0.005 };
  if (loan < 250_000) return { rate: 0.0025 };
  if (loan <= 1_000_000) return { rate: 0 };
  if (loan <= 3_000_000) return { rate: 0.00125 };
  return { rate: 0.0025 };
}

// NOTE: The Funded Capital engine does NOT re-price the rate by DSCR band —
// DSCR is an OUTPUT (a qualification gate at the 1.05 floor), not a rate input.
// Confirmed by the 80 Brigham quote: the 1.06 and 1.18 options differ only by
// the interest-only add-on. So there is no dscrBandAdj.

const DSCR_TERM_ADJ: Record<DscrTerm, number> = { frm_30: 0, arm_10_6: -0.00125, arm_7_6: -0.0025, arm_5_6: -0.00375 };
// +0.30% per step down from 5yr; no-PPP is a further step (placeholder +0.90% — confirm).
const PPP_ADJ: Record<Ppp, number> = { ppp_5yr: 0, ppp_3yr: 0.003, ppp_1yr: 0.006, ppp_none: 0.009 };
// Interest-only rate add-on (calibrated to the 80 Brigham quote: 0.0375%).
const DSCR_IO_ADDON = 0.000375;

/**
 * DSCR / STABILIZED BRIDGE — a 12-month interest-only bridge on a stabilized
 * rental. Prices like DSCR (5yr UST + tier spread) PLUS a bridge premium.
 * Always interest-only; extendable to 18–24 months for +0.25%. LTV caps match
 * DSCR (80% purchase/RT, 75% cash-out); NO DSCR floor (asset-based). Bridge
 * origination/fees/reserve.
 *
 * Premium confirmed at +3.00% (Luis 2026-07-14). Max LTV 70% for BOTH
 * rate/term and cash-out (tighter than traditional DSCR's 80/75).
 */
export const STABILIZED_BRIDGE_PREMIUM = 0.03;
export const STABILIZED_BRIDGE_EXTEND_ADJ = 0.0025;
export const STABILIZED_BRIDGE_MAX_LTV = 0.7;

// ---------- Product metadata ----------

export const PRODUCTS: Record<ProductKey, ProductMeta> = {
  fix_and_flip: {
    key: "fix_and_flip",
    label: "Fix & Flip",
    family: "bridge",
    minLoan: 75_000,
    maxLoan: 5_000_000,
    minFico: 660,
    termLabel: "12 mo (18–24 select), interest-only",
    interestOnlyByDefault: true,
    experienceUnit: "verified investment properties (3-yr)",
  },
  new_construction: {
    key: "new_construction",
    label: "New Construction (Ground-Up)",
    family: "bridge",
    minLoan: 75_000,
    maxLoan: 5_000_000,
    minFico: 680,
    termLabel: "Build term, draw-based, interest-only",
    interestOnlyByDefault: true,
    experienceUnit: "verified ground-up / investment properties (3-yr)",
  },
  dscr: {
    key: "dscr",
    label: "DSCR / Rental",
    family: "dscr",
    minLoan: 75_000,
    maxLoan: 2_000_000,
    minFico: 660,
    termLabel: "30-yr FRM / ARM (±IO)",
    interestOnlyByDefault: false,
    experienceUnit: "verified rental / investment properties (3-yr)",
  },
  stabilized_bridge: {
    key: "stabilized_bridge",
    label: "DSCR / Stabilized Bridge",
    family: "dscr", // prices off UST + spread + premium, LTV-based, DSCR shown
    minLoan: 75_000,
    maxLoan: 5_000_000,
    minFico: 660,
    termLabel: "12 mo interest-only (18–24 mo extension)",
    interestOnlyByDefault: true,
    experienceUnit: "verified rental / investment properties (3-yr)",
  },
};

export const RATE_CONFIG = { products: PRODUCTS };

export const CHANNEL_OPTIONS: { key: Channel; label: string }[] = [
  { key: "tpo", label: "Broker / TPO" },
  { key: "retail", label: "Retail" },
];

export type ResidencyKey = "us_citizen" | "permanent_resident" | "non_permanent_resident" | "foreign_national";

export const RESIDENCY_OPTIONS: { key: ResidencyKey; label: string }[] = [
  { key: "us_citizen", label: "U.S. Citizen" },
  { key: "permanent_resident", label: "Permanent Resident" },
  { key: "non_permanent_resident", label: "Non-Permanent Resident" },
  { key: "foreign_national", label: "Foreign National" },
];

/** Rate add-on by residency. Foreign National confirmed +0.75% (Luis 2026-07-14). */
export const RESIDENCY_ADJ: Record<ResidencyKey, number> = {
  us_citizen: 0,
  permanent_resident: 0,
  non_permanent_resident: 0.0025,
  foreign_national: 0.0075,
};

export const PROPERTY_UNIT_OPTIONS = ["1", "2", "3", "4"];

export const EXPERIENCE_BUCKETS = ["0", "1–2", "3–4", "5–9", "10+"];

export const LOAN_PURPOSE_OPTIONS: { key: LoanPurpose; label: string }[] = [
  { key: "purchase", label: "Purchase" },
  { key: "rate_term_refi", label: "Rate/Term Refi" },
  { key: "cash_out_refi", label: "Cash-Out Refi" },
];

export const DSCR_TERM_OPTIONS: { key: DscrTerm; label: string }[] = [
  { key: "frm_30", label: "30-yr Fixed" },
  { key: "arm_10_6", label: "10/6 ARM" },
  { key: "arm_7_6", label: "7/6 ARM" },
  { key: "arm_5_6", label: "5/6 ARM" },
];

export const PPP_OPTIONS: { key: Ppp; label: string }[] = [
  { key: "ppp_5yr", label: "5-yr (5-4-3-2-1)" },
  { key: "ppp_3yr", label: "3-yr (3-2-1)" },
  { key: "ppp_1yr", label: "1-yr (1-0-0)" },
  { key: "ppp_none", label: "No prepay penalty" },
];

/**
 * DSCR rate buydown (discount points). DSCR + DSCR portfolio only; not offered
 * on bridge products.
 *
 * The `key` is the discount-point FEE the borrower pays at closing, expressed as
 * a fraction of the loan amount (0.01 = 1 point = 1% of loan). Paying points buys
 * the note rate DOWN — but NOT one-for-one. Industry standard for DSCR/non-QM is
 * roughly 25 bps of rate reduction per 1 discount point near par, tapering to
 * ~20 bps/point past 1.5 points (the rate/price ladder is convex — diminishing
 * returns). So a 1% fee ≈ 0.25% off the rate, not 1%. The program rate floor
 * still applies as a hard minimum. See dscrBuydownReduction().
 */
export const BUYDOWN_OPTIONS: { key: number; label: string }[] = [
  { key: 0, label: "None" },
  { key: 0.005, label: "0.5 pt (0.50% fee)" },
  { key: 0.01, label: "1 pt (1.00% fee)" },
  { key: 0.015, label: "1.5 pts (1.50% fee)" },
  { key: 0.025, label: "2.5 pts (2.50% fee)" },
];

/**
 * Convert a discount-point buydown fee (fraction of loan) into a note-rate
 * reduction (decimal, same units as the other rate adjusters).
 * 25 bps/point up to 1.5 points, then 20 bps/point beyond (convex curve).
 * e.g. 0.005 → 0.00125 (0.125%); 0.01 → 0.0025 (0.25%); 0.025 → 0.00575 (0.575%).
 */
export function dscrBuydownReduction(feeFraction: number): number {
  if (!feeFraction || feeFraction <= 0) return 0;
  const points = feeFraction * 100; // 0.01 fee → 1 discount point
  const nearPar = Math.min(points, 1.5);
  const beyond = Math.max(0, points - 1.5);
  const bps = nearPar * 25 + beyond * 20;
  return bps / 10000; // bps → decimal
}

/**
 * Inverse of dscrBuydownReduction: given a target rate cut (decimal), return the
 * discount-point fee (fraction of loan) required to buy the rate down that much.
 * e.g. 0.0025 (0.25%) → 0.01 (1 point); 0.005 (0.50%) → 0.02125 (2.125 points).
 */
export function dscrBuydownFeeForCut(cutDecimal: number): number {
  if (!cutDecimal || cutDecimal <= 0) return 0;
  const bps = cutDecimal * 10000;
  const points = bps <= 37.5 ? bps / 25 : 1.5 + (bps - 37.5) / 20;
  return points / 100; // → fee fraction
}

/** One row of the rate/point ladder (buy-down side; par = price 100). */
export interface RateLadderRow {
  ratePct: number;
  deltaPct: number; // vs par (0 or negative)
  pointsPct: number; // discount points as % of loan (cost)
  pricePct: number; // 100 − pointsPct (par = 100)
  feeDollars: number; // points cost in $
  monthly: number; // note payment at this rate
  isPar: boolean;
  isSelected: boolean;
}

/**
 * Build a buy-down rate ladder around a par (no-points) rate, in 1/8% steps down
 * to the rate floor. Each row shows the discount-point cost to reach that rate.
 */
function buildRateLadder(
  parRatePct: number,
  floorPct: number,
  loan: number,
  io: boolean,
  currentPoints: number
): RateLadderRow[] {
  const rows: RateLadderRow[] = [];
  const deltas = [0, 0.125, 0.25, 0.375, 0.5, 0.625]; // buy-down magnitudes (%)
  for (const d of deltas) {
    const rowRate = +(parRatePct - d).toFixed(3);
    if (rowRate < floorPct - 1e-9) break;
    const feeFrac = dscrBuydownFeeForCut(d / 100);
    const points = +(feeFrac * 100).toFixed(3);
    rows.push({
      ratePct: rowRate,
      deltaPct: +(-d).toFixed(3),
      pointsPct: points,
      pricePct: +(100 - points).toFixed(3),
      feeDollars: Math.round(feeFrac * loan),
      monthly: Math.round(dscrQualifyingPayment(loan, rowRate, io)),
      isPar: d === 0,
      isSelected: Math.abs(points - currentPoints) < 0.01,
    });
  }
  return rows;
}

export const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME",
  "MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI",
  "SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];

/**
 * State prepayment-penalty rules (Funded Capital guidelines).
 * Returns the maximum PPP allowed for the loan, plus a plain-English reason.
 */
export type PppAllowance = "full" | "cap_1pct" | "none";
export function pppAllowance(
  state: string | undefined,
  loanAmount: number,
  units: number
): { allowance: PppAllowance; note: string } {
  const s = (state ?? "").toUpperCase();
  const twoOrFewer = units <= 2;
  switch (s) {
    case "NM":
    case "AK":
    case "KS":
    case "MD":
    case "DC":
      return { allowance: "none", note: `${s}: prepayment penalties are not permitted.` };
    case "NC":
      return loanAmount <= 100_000
        ? { allowance: "cap_1pct", note: "NC: 1% max PPP for loans ≤ $100,000." }
        : { allowance: "full", note: "" };
    case "RI":
      return { allowance: "cap_1pct", note: "RI: PPP limited to 1% for the first year." };
    case "MN":
      return units === 1
        ? { allowance: "none", note: "MN: PPP not permitted on single-family (1-unit)." }
        : { allowance: "full", note: "MN: PPP permitted on 2–4 units." };
    case "OH":
      if (twoOrFewer) {
        return loanAmount >= 112_957
          ? { allowance: "cap_1pct", note: "OH: 1–2 units, loan ≥ $112,957 → PPP capped at 1% for 5 years." }
          : { allowance: "none", note: "OH: 1–2 units, loan < $112,957 → PPP not permitted." };
      }
      return { allowance: "full", note: "" };
    case "PA":
      return twoOrFewer && loanAmount <= 319_777
        ? { allowance: "none", note: "PA: ≤ 2 units and balance ≤ $319,777 → PPP prohibited." }
        : { allowance: "full", note: "PA: PPP permitted (> $319,777 or 3+ units)." };
    default:
      return { allowance: "full", note: "" };
  }
}

export const CAPS = {
  fix_and_flip: { arltv: 0.75 },
  new_construction: { arltv: 0.7, ltfc: 0.85, ltfcFinancedIR: 0.9 },
  dscr: { purchase: 0.8, cashOut: 0.75, minDscr: 1.05 },
};

// ---------- Tier logic ----------

export function deriveTier(experienceBucket: number, licensedAgentOrGc: boolean): number {
  let tier = Math.max(1, Math.min(5, experienceBucket + 1));
  if (licensedAgentOrGc) {
    tier = Math.max(tier, 2);
    if (experienceBucket >= 1) tier = Math.min(5, tier + 1);
  }
  return tier;
}

export function initialAdvanceCap(product: ProductKey, tier: number, fico: number, permitsApproved: boolean): number {
  if (product === "new_construction") return permitsApproved ? 0.75 : 0.6;
  if (product === "fix_and_flip") {
    if (tier >= 4) return 0.9;
    if (fico >= 740) return 0.9;
    return tier === 3 ? 0.85 : 0.8;
  }
  return 1;
}

// ---------- Shared helpers ----------

function amortizedPI(loan: number, ratePct: number): number {
  const r = ratePct / 100 / 12;
  const n = 360;
  return (loan * r) / (1 - Math.pow(1 + r, -n));
}

/**
 * The monthly payment used to QUALIFY a DSCR loan.
 * Interest-only uses the IO payment (loan × rate ÷ 12), which is lower than the
 * amortizing P&I and therefore RAISES the DSCR — that is the whole reason IO is
 * used to help a deal qualify. Full-amortizing uses the 30-yr P&I.
 */
function dscrQualifyingPayment(loan: number, ratePct: number, interestOnly: boolean): number {
  return interestOnly ? (loan * ratePct) / 100 / 12 : amortizedPI(loan, ratePct);
}

export function fmtUsd(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export interface FeeLine {
  label: string;
  amount: number | null;
  display?: string;
}

const sumKnownFees = (fees: FeeLine[]) => fees.reduce((a, f) => a + (f.amount ?? 0), 0);

/* ==========================================================================
 * SINGLE-PROPERTY PRICING
 * ========================================================================== */

export interface QuoteInput {
  product: ProductKey;
  channel: Channel;
  fico: number;
  experienceBucket: number;
  licensedAgentOrGc: boolean;
  rural: boolean;
  residency?: ResidencyKey;
  propertyState?: string; // 2-letter, for PPP + eligibility rules
  loanAmount: number; // total loan (initial + holdback)
  units: number;
  loanPurpose: LoanPurpose;

  brokerPointsPct?: number;
  brokerProcessingFee?: number;

  // Bridge
  purchasePrice?: number;
  rehabBudget?: number; // TOTAL remaining budget (financed portion = × holdbackPct)
  constructionBudget?: number; // TOTAL remaining budget (financed portion = × holdbackPct)
  holdbackPct?: number; // share of the budget the lender finances (0–1, default 1 = 100%)
  sunkCosts?: number; // soft + hard costs already spent (refi)
  estimatedPayoff?: number; // existing lien to retire (refi)
  arv?: number;
  extendedTerm?: boolean;
  permitsInHand?: boolean;
  financedInterestReserve?: boolean;
  initialAdvancePct?: number; // Initial LTC (of purchase + sunk)

  // DSCR
  asIsValue?: number;
  monthlyRent?: number;
  annualTaxes?: number;
  annualInsurance?: number;
  annualHoa?: number;
  dscrTerm?: DscrTerm;
  ppp?: Ppp;
  interestOnly?: boolean;
  ustBasis?: number;
  buydown?: number; // rate buydown (decimal), DSCR only
}

/** A hard guideline failure: why the scenario is ineligible + how to make it fit. */
export interface Blocker {
  reason: string;
  fix: string;
}

export interface QuoteResult {
  ok: boolean;
  blockers: Blocker[];
  messages: string[];
  warnings: string[];
  product: ProductMeta;
  tier: number;
  loanAmount: number;
  initialLoan: number;
  holdback: number;
  ratePct: number | null;
  originationPct: number;
  originationDollars: number | null;
  points: number;
  brokerPointsPct: number;
  brokerPointsDollars: number | null;
  brokerProcessingFee: number;
  maxLoan: number | null;
  primaryRatio: number | null;
  primaryRatioLabel: string;
  initialLtc: number | null;
  arltv: number | null;
  ltfc: number | null;
  dscr: number | null;
  interestOnly: boolean;
  termLabel: string;
  estMonthlyPayment: number | null;
  interestReserve: number | null;
  reserveLabel: string;
  liquidityRequirement: number | null;
  knownFees: number;
  cashToClose: number | null;
  cashToBorrower: number | null;
  fees: FeeLine[];
  rateBreakdown: { label: string; value: number }[];
  rateLadder?: RateLadderRow[];
}

export function priceDeal(input: QuoteInput): QuoteResult {
  const product = PRODUCTS[input.product];
  const family = product.family;
  const isGU = product.key === "new_construction";
  const isStab = product.key === "stabilized_bridge";
  // Stabilized Bridge prices like DSCR but bills like a bridge (origination/fees/reserve).
  const feeFamily: "bridge" | "dscr" = isStab ? "bridge" : family;
  const bridgeReserve = family === "bridge" || isStab;
  const isRefi = isRefiPurpose(input.loanPurpose);
  const messages: string[] = [];
  const warnings: string[] = [];
  const blockers: Blocker[] = [];
  const tier = deriveTier(input.experienceBucket, input.licensedAgentOrGc);

  const breakdown: { label: string; value: number }[] = [];
  let sumAdj = 0;
  let sumMaxLtvAdj = 0;
  const addAdj = (label: string, a: Adj) => {
    if (a.rate) {
      sumAdj += a.rate;
      breakdown.push({ label, value: a.rate });
    }
    if (a.maxLtv) sumMaxLtvAdj += a.maxLtv;
  };

  let primaryRatio = 0;
  let primaryRatioLabel = "LTV";
  let initialLtc: number | null = null;
  let arltv: number | null = null;
  let ltfc: number | null = null;
  let maxLoan = 0;
  let capMessage = "";
  let initialLoan = input.loanAmount;
  let holdback = 0;
  let dscrPitiaMonthly = 0;

  const purchase = input.purchasePrice ?? 0;
  const sunk = input.sunkCosts ?? 0;
  const payoff = input.estimatedPayoff ?? 0;

  if (family === "bridge") {
    // Total remaining budget vs. the financed portion. The lender need not hold
    // back 100% of the budget — holdbackPct sets how much is financed. The LTFC
    // denominator still uses the FULL budget, since the borrower funds the rest.
    const budgetTotal = isGU ? input.constructionBudget ?? 0 : input.rehabBudget ?? 0;
    const hbPct = Math.min(1, Math.max(0, input.holdbackPct ?? 1));
    const build = Math.round(budgetTotal * hbPct); // financed holdback
    holdback = build;
    initialLoan = Math.max(0, input.loanAmount - build);

    const costBasis = purchase + sunk; // Initial LTC denominator
    const fullCost = purchase + sunk + budgetTotal; // Ground-Up LTFC denominator (full cost)
    const arvVal = input.arv ?? 0;

    const arltvVal = arvVal > 0 ? input.loanAmount / arvVal : 0;
    const ltfcVal = fullCost > 0 ? input.loanAmount / fullCost : 0;
    initialLtc = costBasis > 0 ? initialLoan / costBasis : 0;

    const initCap = initialAdvanceCap(product.key, tier, input.fico, input.permitsInHand ?? true);

    if (isGU) {
      const ltfcCapPct = input.financedInterestReserve ? CAPS.new_construction.ltfcFinancedIR : CAPS.new_construction.ltfc;
      primaryRatio = ltfcVal;
      primaryRatioLabel = "LTFC";
      arltv = arltvVal;
      ltfc = ltfcVal;
      maxLoan = Math.min(initCap * costBasis + build, CAPS.new_construction.arltv * arvVal, ltfcCapPct * fullCost);
      capMessage = `exceeds the lesser of 70% ARLTV (${fmtUsd(CAPS.new_construction.arltv * arvVal)}) or ${(ltfcCapPct * 100).toFixed(0)}% LTFC (${fmtUsd(ltfcCapPct * fullCost)})`;
    } else {
      primaryRatio = arltvVal;
      primaryRatioLabel = "ARLTV";
      arltv = null; // shown as the primary metric
      ltfc = null; // Fix & Flip has no LTC/LTFC cap
      maxLoan = Math.min(initCap * costBasis + build, CAPS.fix_and_flip.arltv * arvVal);
      capMessage = `exceeds the 75% ARLTV max of ${fmtUsd(CAPS.fix_and_flip.arltv * arvVal)}`;
    }

    if (arvVal > 0) addAdj(`Leverage (ARLTV ${(arltvVal * 100).toFixed(1)}%)`, leverageAdj(arltvVal));
    if (input.extendedTerm) addAdj("18–24 mo term", { rate: 0.0025 });
    if (isGU && input.permitsInHand === false) addAdj("Permits not approved (Ground-Up)", { rate: 0.005 });
  } else {
    const asIs = input.asIsValue ?? purchase;
    const basisValue = input.loanPurpose === "purchase" ? Math.min(purchase || Infinity, asIs || Infinity) : asIs;
    const value = isFinite(basisValue) ? basisValue : 0;
    primaryRatio = value > 0 ? input.loanAmount / value : 0;
    primaryRatioLabel = "LTV";
    initialLoan = input.loanAmount;
    holdback = 0;

    // Stabilized Bridge caps at 70%; DSCR uses 80/75. Foreign National tightens
    // to 65% purchase/RT, 60% cash-out (whichever is lower).
    let baseCap = isStab
      ? STABILIZED_BRIDGE_MAX_LTV
      : input.loanPurpose === "cash_out_refi"
      ? CAPS.dscr.cashOut
      : CAPS.dscr.purchase;
    if (input.residency === "foreign_national") {
      baseCap = Math.min(baseCap, input.loanPurpose === "cash_out_refi" ? 0.6 : 0.65);
    }

    addAdj(`Leverage (LTV ${(primaryRatio * 100).toFixed(1)}%)`, leverageAdj(primaryRatio));
    if (input.loanPurpose === "cash_out_refi") addAdj("Cash-out refi", { rate: 0.00375 });
    if (isStab) {
      addAdj("Stabilized bridge premium", { rate: STABILIZED_BRIDGE_PREMIUM });
      if (input.extendedTerm) addAdj("18–24 mo extension", { rate: STABILIZED_BRIDGE_EXTEND_ADJ });
    } else {
      if (input.interestOnly) addAdj("Interest-only", { rate: DSCR_IO_ADDON });
      if (input.dscrTerm && input.dscrTerm !== "frm_30")
        addAdj(DSCR_TERM_OPTIONS.find((t) => t.key === input.dscrTerm)!.label, { rate: DSCR_TERM_ADJ[input.dscrTerm] });

      // Enforce state prepayment-penalty rules — override the selected PPP if the state restricts it.
      const rank: Record<Ppp, number> = { ppp_5yr: 3, ppp_3yr: 2, ppp_1yr: 1, ppp_none: 0 };
      let effPpp: Ppp = input.ppp ?? "ppp_5yr";
      const pppRule = pppAllowance(input.propertyState, input.loanAmount, input.units);
      if (pppRule.allowance === "none" && effPpp !== "ppp_none") {
        effPpp = "ppp_none";
        messages.push(`${pppRule.note} PPP set to none for compliance.`);
      } else if (pppRule.allowance === "cap_1pct" && rank[effPpp] > rank["ppp_1yr"]) {
        effPpp = "ppp_1yr";
        messages.push(`${pppRule.note} PPP capped at 1-yr for compliance.`);
      }
      if (effPpp !== "ppp_5yr") addAdj(`PPP ${PPP_OPTIONS.find((p) => p.key === effPpp)!.label}`, { rate: PPP_ADJ[effPpp] });
      if (input.buydown && input.buydown > 0) {
        const cut = dscrBuydownReduction(input.buydown);
        addAdj(`Rate buydown (${(input.buydown * 100).toFixed(2)} pt → −${(cut * 100).toFixed(3)}%)`, { rate: -cut });
      }
    }

    (product as ProductMeta & { _baseCap?: number })._baseCap = baseCap;
    (product as ProductMeta & { _basisValue?: number })._basisValue = value;
  }

  addAdj(`FICO ${input.fico}`, ficoAdj(input.fico));
  addAdj(`Loan size ${fmtUsd(input.loanAmount)}`, loanSizeAdj(input.loanAmount));
  if (input.units >= 2) addAdj("2–4 units", { rate: 0.0025 });
  if (input.rural) addAdj("Rural / stretch market", { rate: 0.005, maxLtv: -0.05 });
  if (input.residency && input.residency !== "us_citizen" && input.residency !== "permanent_resident") {
    const label = RESIDENCY_OPTIONS.find((r) => r.key === input.residency)!.label;
    addAdj(label, { rate: RESIDENCY_ADJ[input.residency] });
  }

  if (family === "dscr") {
    const baseCap = (product as ProductMeta & { _baseCap?: number })._baseCap ?? 0.8;
    const value = (product as ProductMeta & { _basisValue?: number })._basisValue ?? 0;
    const effCap = Math.max(0, baseCap + sumMaxLtvAdj);
    maxLoan = effCap * value;
    capMessage = `exceeds the max LTV of ${(effCap * 100).toFixed(1)}% (${fmtUsd(maxLoan)})`;
  }

  let ratePct: number | null = null;
  let dscr: number | null = null;
  let estMonthlyPayment: number | null = null;
  let ok = true;

  const base =
    family === "bridge"
      ? BRIDGE_POSTED_BASE[tier]
      : (input.ustBasis ?? DSCR_UST_BASIS_DEFAULT) + DSCR_BASE_SPREAD[tier];
  const floor = family === "bridge" ? BRIDGE_FLOOR : DSCR_FLOOR;

  if (family === "dscr") {
    const io = isStab ? true : !!input.interestOnly; // Stabilized Bridge is always interest-only
    const escrow = (input.annualTaxes ?? 0) / 12 + (input.annualInsurance ?? 0) / 12 + (input.annualHoa ?? 0) / 12;
    // Rate has no DSCR feedback — compute it directly, then DSCR is an output.
    const finalRate = Math.max(floor, base + sumAdj);
    ratePct = +(finalRate * 100).toFixed(3);
    const finalPay = dscrQualifyingPayment(input.loanAmount, ratePct, io);
    const finalPitia = finalPay + escrow;
    dscrPitiaMonthly = finalPitia;
    dscr = input.monthlyRent && finalPitia > 0 ? +(input.monthlyRent / finalPitia).toFixed(2) : null;
    estMonthlyPayment = Math.round(finalPay);
  } else {
    const finalRate = Math.max(floor, base + sumAdj);
    ratePct = +(finalRate * 100).toFixed(3);
    estMonthlyPayment = Math.round((input.loanAmount * ratePct) / 100 / 12);
  }

  breakdown.unshift({
    label: family === "bridge" ? `Posted base (Tier ${tier})` : `5yr UST + spread (Tier ${tier})`,
    value: base,
  });

  // ---- Gates ---- (each hard failure carries an actionable fix)
  if (input.fico < product.minFico) {
    ok = false;
    blockers.push({
      reason: `FICO ${input.fico} is below the ${product.minFico} minimum for ${product.label}.`,
      fix: `Raise the qualifying FICO to ${product.minFico}+, or price a program with a lower FICO floor.`,
    });
  }
  if (isGU && tier < 3) {
    ok = false;
    blockers.push({
      reason: `Ground-Up requires Tier 3+ experience — this profile is Tier ${tier}.`,
      fix: `Add verified GC/build experience (or a licensed agent/GC co-borrower) to reach Tier 3, or choose Fix & Flip.`,
    });
  }
  if (input.loanAmount < product.minLoan) {
    ok = false;
    blockers.push({
      reason: `Loan amount ${fmtUsd(input.loanAmount)} is below the ${fmtUsd(product.minLoan)} minimum for ${product.label}.`,
      fix: `Increase the loan to at least ${fmtUsd(product.minLoan)}.`,
    });
  }
  if (input.loanAmount > product.maxLoan) {
    warnings.push(`Above the ${fmtUsd(product.maxLoan)} envelope — larger deals reviewed case-by-case.`);
  }
  if (maxLoan > 0 && input.loanAmount > Math.round(maxLoan) + 1) {
    ok = false;
    blockers.push({
      reason: `Loan amount ${fmtUsd(input.loanAmount)} ${capMessage}.`,
      fix: `Lower the loan to about ${fmtUsd(Math.floor(maxLoan / 1000) * 1000)} or below, reduce leverage, or add borrower equity.`,
    });
  }
  if (family === "dscr" && !isStab && dscr !== null && dscr < CAPS.dscr.minDscr) {
    ok = false;
    blockers.push({
      reason: `DSCR ${dscr.toFixed(2)} is below the ${CAPS.dscr.minDscr.toFixed(2)} floor (rent doesn't cover PITIA at this leverage).`,
      fix: `Lower the loan amount/LTV, switch to interest-only to reduce the payment, or use a higher monthly rent if supportable.`,
    });
  }
  if (family === "bridge" && input.initialAdvancePct !== undefined) {
    const cap = initialAdvanceCap(product.key, tier, input.fico, input.permitsInHand ?? true);
    if (input.initialAdvancePct > cap + 1e-9) {
      ok = false;
      const capPct = (cap * 100).toFixed(0);
      blockers.push({
        reason: isGU
          ? `Initial LTC ${(input.initialAdvancePct * 100).toFixed(0)}% exceeds the ${capPct}% cap (permits ${input.permitsInHand ? "approved" : "not approved"}).`
          : `Initial LTC ${(input.initialAdvancePct * 100).toFixed(0)}% exceeds the ${capPct}% cap for Tier ${tier}${input.fico < 740 ? " (< 740 FICO)" : ""}.`,
        fix: isGU
          ? `Lower Initial LTC to ${capPct}% or below${input.permitsInHand ? "" : ", or confirm permits are approved to raise the cap"}.`
          : `Lower Initial LTC to ${capPct}% or below${input.fico < 740 ? ", or raise FICO to 740+ to lift the cap" : ""}.`,
      });
    }
  }
  // Payoff shortfall — warning only.
  if (isRefi && payoff > 0 && initialLoan < payoff) {
    warnings.push(
      `Initial Loan Amount (${fmtUsd(initialLoan)}) does not cover the Estimated Payoff (${fmtUsd(payoff)}) — shortfall of ${fmtUsd(payoff - initialLoan)}. Borrower must bring the difference.`
    );
  }

  // ---- Origination + broker comp ----
  const originationPct = ORIGINATION[feeFamily][input.channel][tier];
  const originationDollars = ok ? Math.round(originationPct * input.loanAmount) : null;

  const isTpo = input.channel === "tpo";
  const brokerPointsPct = isTpo ? Math.max(0, input.brokerPointsPct ?? 0) : 0;
  const brokerProcessingFee = isTpo ? Math.max(0, input.brokerProcessingFee ?? 0) : 0;
  const brokerPointsDollars = isTpo && ok ? Math.round((brokerPointsPct / 100) * input.loanAmount) : null;

  if (isTpo) {
    const combined = originationPct * 100 + brokerPointsPct;
    if (combined > MAX_COMBINED_POINTS + 1e-9) {
      ok = false;
      const maxBroker = Math.max(0, MAX_COMBINED_POINTS - originationPct * 100);
      blockers.push({
        reason: `Combined points ${combined.toFixed(2)}% exceed the ${MAX_COMBINED_POINTS.toFixed(2)}% cap (lender ${(originationPct * 100).toFixed(2)}% + broker ${brokerPointsPct.toFixed(2)}%).`,
        fix: `Lower broker points to ${maxBroker.toFixed(2)}% or less.`,
      });
    }
  }

  // Rate buydown fee (discount points) — DSCR only, borrower pays at closing.
  const buydownFee =
    ok && family === "dscr" && !isStab && input.buydown && input.buydown > 0
      ? Math.round(input.buydown * input.loanAmount)
      : 0;

  const tierFees = FEES[feeFamily][tier];
  const fees: FeeLine[] = [
    { label: "Lender origination", amount: originationDollars },
    ...(isTpo
      ? [
          { label: `Broker points (${brokerPointsPct.toFixed(2)}%)`, amount: brokerPointsDollars },
          { label: "Broker processing fee", amount: brokerProcessingFee },
        ]
      : []),
    ...(buydownFee > 0
      ? [{ label: `Rate buydown (${(input.buydown! * 100).toFixed(2)} pt)`, amount: buydownFee }]
      : []),
    { label: "Processing", amount: tierFees.processing },
    { label: "Underwriting", amount: tierFees.underwriting },
    { label: "Legal / doc review", amount: THIRD_PARTY_FEES.legalReview },
    ...(family === "dscr" && !isStab ? [{ label: "Corelogix", amount: THIRD_PARTY_FEES.corelogix }] : []),
    { label: "Servicing setup", amount: THIRD_PARTY_FEES.servicingSetup },
    { label: "Appraisal", amount: null, display: THIRD_PARTY_FEES.appraisalRange },
    { label: "Title / settlement", amount: null, display: THIRD_PARTY_FEES.titleSettlement },
  ];

  const interestReserve =
    ok && ratePct !== null
      ? bridgeReserve
        ? Math.round(((input.loanAmount * ratePct) / 100 / 12) * 100) / 100
        : Math.round(amortizedPI(input.loanAmount, ratePct) * 3)
      : null;
  const reserveLabel = bridgeReserve ? "1 month interest" : "3 months P&I";

  // Foreign National DSCR: 12 months PITIA in reserves (documented liquidity, not held from proceeds).
  const isFN = input.residency === "foreign_national";
  const liquidityRequirement = ok && isFN && family === "dscr" ? Math.round(dscrPitiaMonthly * 12) : null;
  if (isFN && family === "dscr") {
    warnings.push(
      "Foreign National: requires valid passport + valid U.S. visa (VWP; travel/student visas not permitted), U.S. FICO if personal-guaranty only, and 12 months PITIA in reserves. Max LTV 65% purchase/RT, 60% cash-out."
    );
  }

  // ---- Cash to close ----
  // Purchase:  (purchase price − Initial Loan) + known fees + reserve
  // Refi:      (payoff − Initial Loan) + known fees + reserve
  const knownFees = sumKnownFees(fees);
  let cashToClose: number | null = null;
  let cashToBorrower: number | null = null;
  if (ok) {
    const valueBasis =
      family === "dscr"
        ? (product as ProductMeta & { _basisValue?: number })._basisValue ?? 0
        : purchase;
    const base0 = isRefi ? payoff : valueBasis;
    const raw = base0 - initialLoan + knownFees + (interestReserve ?? 0);
    if (raw >= 0) {
      cashToClose = Math.round(raw);
      cashToBorrower = 0;
    } else {
      cashToClose = 0;
      cashToBorrower = Math.round(-raw);
    }
  }

  if (ok) messages.push("Indicative — subject to underwriting, appraisal, title, and insurance. Not a commitment.");

  // ---- Rate/point ladder (DSCR only; buy-down side, par = 100) ----
  let rateLadder: RateLadderRow[] | undefined;
  if (ok && family === "dscr" && !isStab && ratePct !== null) {
    const io = !!input.interestOnly;
    const cut = dscrBuydownReduction(input.buydown ?? 0);
    const parRatePct = +(ratePct + cut * 100).toFixed(3);
    rateLadder = buildRateLadder(parRatePct, floor * 100, input.loanAmount, io, (input.buydown ?? 0) * 100);
  }

  return {
    ok,
    blockers,
    messages,
    warnings,
    product,
    tier,
    loanAmount: input.loanAmount,
    initialLoan: Math.round(initialLoan),
    holdback: Math.round(holdback),
    ratePct: ok ? ratePct : null,
    rateLadder,
    originationPct,
    originationDollars,
    points: originationPct * 100,
    brokerPointsPct,
    brokerPointsDollars,
    brokerProcessingFee,
    maxLoan: maxLoan > 0 ? Math.round(maxLoan) : null,
    primaryRatio: isFinite(primaryRatio) ? +primaryRatio.toFixed(4) : null,
    primaryRatioLabel,
    initialLtc: initialLtc !== null && isFinite(initialLtc) ? +initialLtc.toFixed(4) : null,
    arltv: arltv !== null && isFinite(arltv) ? +arltv.toFixed(4) : null,
    ltfc: ltfc !== null && isFinite(ltfc) ? +ltfc.toFixed(4) : null,
    dscr,
    interestOnly: family === "dscr" && !isStab ? !!input.interestOnly : true,
    termLabel: product.termLabel,
    estMonthlyPayment: ok ? estMonthlyPayment : null,
    interestReserve,
    reserveLabel,
    liquidityRequirement,
    knownFees,
    cashToClose,
    cashToBorrower,
    fees,
    rateBreakdown: breakdown,
  };
}

/* ==========================================================================
 * PORTFOLIO PRICING — up to 10 properties on one loan, all three programs
 * ========================================================================== */

export const MAX_PORTFOLIO_PROPERTIES = 10;

export interface PortfolioProperty {
  id: string;
  address: string;
  /** Purchase price / as-is value / land value. */
  asIsValue: number;
  /** Budget HELD BACK — full budget on a purchase, remaining budget on a refi. */
  budget: number;
  /** Soft + hard costs already spent (refi only). */
  sunkCosts: number;
  /** Existing lien to retire (refi only). */
  estimatedPayoff: number;
  /** After-Repair Value — bridge only. */
  arv: number;
  // DSCR
  monthlyRent: number;
  annualTaxes: number;
  annualInsurance: number;
  annualHoa: number;
  /** Bridge → Initial Loan Amount ($). DSCR → Loan Amount ($). null → use the default %. */
  loanOverride: number | null;
}

export interface PortfolioInput {
  product: ProductKey;
  channel: Channel;
  fico: number;
  experienceBucket: number;
  licensedAgentOrGc: boolean;
  rural: boolean;
  residency?: ResidencyKey;
  multiUnit: boolean;
  loanPurpose: LoanPurpose;
  // Bridge
  extendedTerm: boolean;
  permitsApproved: boolean;
  financedInterestReserve: boolean;
  defaultInitialLtcPct: number;
  // DSCR
  dscrTerm: DscrTerm;
  ppp: Ppp;
  interestOnly: boolean;
  defaultTargetLtvPct: number;
  ustBasis?: number;
  buydown?: number; // rate buydown (decimal), DSCR only

  properties: PortfolioProperty[];
  brokerPointsPct?: number;
  brokerProcessingFee?: number;
}

export interface PortfolioPropertyResult {
  property: PortfolioProperty;
  initialLoan: number;
  holdback: number;
  totalLoan: number;
  initialLtc: number;
  arltv: number;
  ltfc: number;
  ltv: number;
  monthlyPI: number;
  monthlyPitia: number;
  dscr: number;
  maxTotalLoan: number;
  maxInitialLoan: number;
  ok: boolean;
  issues: string[];
}

export interface PortfolioQuoteResult {
  ok: boolean;
  blockers: Blocker[];
  messages: string[];
  warnings: string[];
  product: ProductMeta;
  tier: number;
  count: number;
  initialCapPct: number;
  arltvCapPct: number;
  ltfcCapPct: number;
  ltvCapPct: number;
  properties: PortfolioPropertyResult[];
  totals: {
    asIs: number;
    budget: number;
    sunk: number;
    payoff: number;
    arv: number;
    initialLoan: number;
    holdback: number;
    loan: number;
    monthlyRent: number;
    monthlyPitia: number;
  };
  blendedInitialLtc: number;
  blendedArltv: number;
  blendedLtfc: number;
  blendedLtv: number;
  blendedDscr: number;
  ratePct: number | null;
  originationPct: number;
  originationDollars: number | null;
  points: number;
  brokerPointsPct: number;
  brokerPointsDollars: number | null;
  brokerProcessingFee: number;
  estMonthlyFullyDrawn: number | null;
  estMonthlyInitial: number | null;
  interestReserve: number | null;
  reserveLabel: string;
  knownFees: number;
  cashToClose: number | null;
  cashToBorrower: number | null;
  interestOnly: boolean;
  fees: FeeLine[];
  rateBreakdown: { label: string; value: number }[];
  rateLadder?: RateLadderRow[];
}

export function pricePortfolio(input: PortfolioInput): PortfolioQuoteResult {
  const product = PRODUCTS[input.product];
  const family = product.family;
  const isGU = product.key === "new_construction";
  const isDscr = family === "dscr";
  const isRefi = isRefiPurpose(input.loanPurpose);
  const messages: string[] = [];
  const warnings: string[] = [];
  const blockers: Blocker[] = [];
  const tier = deriveTier(input.experienceBucket, input.licensedAgentOrGc);
  const props = input.properties.slice(0, MAX_PORTFOLIO_PROPERTIES);
  const n = props.length;

  const initialCapPct = isDscr ? 1 : initialAdvanceCap(product.key, tier, input.fico, input.permitsApproved);
  const arltvCapPct = isGU ? CAPS.new_construction.arltv : CAPS.fix_and_flip.arltv;
  const ltfcCapPct = input.financedInterestReserve ? CAPS.new_construction.ltfcFinancedIR : CAPS.new_construction.ltfc;

  const breakdown: { label: string; value: number }[] = [];
  let sumAdj = 0;
  let sumMaxLtvAdj = 0;
  const addAdj = (label: string, a: Adj) => {
    if (a.rate) {
      sumAdj += a.rate;
      breakdown.push({ label, value: a.rate });
    }
    if (a.maxLtv) sumMaxLtvAdj += a.maxLtv;
  };

  // ---- Sizing ----
  const sized = props.map((p) => {
    if (isDscr) {
      const loan = Math.round(p.loanOverride !== null ? p.loanOverride : input.defaultTargetLtvPct * p.asIsValue);
      return { p, initialLoan: loan, holdback: 0, totalLoan: loan };
    }
    const costBasis = p.asIsValue + p.sunkCosts; // Initial LTC denominator
    const initialLoan = Math.round(p.loanOverride !== null ? p.loanOverride : input.defaultInitialLtcPct * costBasis);
    const holdback = p.budget;
    return { p, initialLoan, holdback, totalLoan: initialLoan + holdback };
  });

  const totals = sized.reduce(
    (a, s) => ({
      asIs: a.asIs + s.p.asIsValue,
      budget: a.budget + s.p.budget,
      sunk: a.sunk + s.p.sunkCosts,
      payoff: a.payoff + s.p.estimatedPayoff,
      arv: a.arv + s.p.arv,
      initialLoan: a.initialLoan + s.initialLoan,
      holdback: a.holdback + s.holdback,
      loan: a.loan + s.totalLoan,
      monthlyRent: a.monthlyRent + s.p.monthlyRent,
      monthlyPitia: 0,
    }),
    { asIs: 0, budget: 0, sunk: 0, payoff: 0, arv: 0, initialLoan: 0, holdback: 0, loan: 0, monthlyRent: 0, monthlyPitia: 0 }
  );

  const blendedCostBasis = totals.asIs + totals.sunk;
  const blendedFullCost = totals.asIs + totals.sunk + totals.budget;
  const blendedInitialLtc = blendedCostBasis > 0 ? totals.initialLoan / blendedCostBasis : 0;
  const blendedArltv = totals.arv > 0 ? totals.loan / totals.arv : 0;
  const blendedLtfc = blendedFullCost > 0 ? totals.loan / blendedFullCost : 0;
  const blendedLtv = totals.asIs > 0 ? totals.loan / totals.asIs : 0;

  // ---- Rate ----
  const leverageForRate = isDscr ? blendedLtv : blendedArltv;
  addAdj(`Leverage (blended ${isDscr ? "LTV" : "ARLTV"} ${(leverageForRate * 100).toFixed(1)}%)`, leverageAdj(leverageForRate));
  if (isDscr) {
    if (input.loanPurpose === "cash_out_refi") addAdj("Cash-out refi", { rate: 0.00375 });
    if (input.interestOnly) addAdj("Interest-only", { rate: DSCR_IO_ADDON });
    if (input.dscrTerm !== "frm_30")
      addAdj(DSCR_TERM_OPTIONS.find((t) => t.key === input.dscrTerm)!.label, { rate: DSCR_TERM_ADJ[input.dscrTerm] });
    if (input.ppp !== "ppp_5yr") addAdj(`PPP ${PPP_OPTIONS.find((p) => p.key === input.ppp)!.label}`, { rate: PPP_ADJ[input.ppp] });
    if (input.buydown && input.buydown > 0) {
      const cut = dscrBuydownReduction(input.buydown);
      addAdj(`Rate buydown (${(input.buydown * 100).toFixed(2)} pt → −${(cut * 100).toFixed(3)}%)`, { rate: -cut });
    }
  } else {
    if (input.extendedTerm) addAdj("18–24 mo term", { rate: 0.0025 });
    if (isGU && !input.permitsApproved) addAdj("Permits not approved (Ground-Up)", { rate: 0.005 });
  }
  addAdj(`FICO ${input.fico}`, ficoAdj(input.fico));
  addAdj(`Loan size ${fmtUsd(totals.loan)}`, loanSizeAdj(totals.loan));
  if (input.multiUnit) addAdj("2–4 units", { rate: 0.0025 });
  if (input.rural) addAdj("Rural / stretch market", { rate: 0.005, maxLtv: -0.05 });
  if (input.residency && input.residency !== "us_citizen" && input.residency !== "permanent_resident") {
    const label = RESIDENCY_OPTIONS.find((r) => r.key === input.residency)!.label;
    addAdj(label, { rate: RESIDENCY_ADJ[input.residency] });
  }

  const ltvCapPct = isDscr
    ? Math.max(0, (input.loanPurpose === "cash_out_refi" ? CAPS.dscr.cashOut : CAPS.dscr.purchase) + sumMaxLtvAdj)
    : 0;

  const base = isDscr ? (input.ustBasis ?? DSCR_UST_BASIS_DEFAULT) + DSCR_BASE_SPREAD[tier] : BRIDGE_POSTED_BASE[tier];
  const floor = isDscr ? DSCR_FLOOR : BRIDGE_FLOOR;
  const escrowTotal = props.reduce((a, p) => a + (p.annualTaxes + p.annualInsurance + p.annualHoa) / 12, 0);

  // No DSCR-band feedback — DSCR is an output, computed from the final rate below.
  const finalRate = Math.max(floor, base + sumAdj);
  const ratePct = +(finalRate * 100).toFixed(3);
  breakdown.unshift({ label: isDscr ? `5yr UST + spread (Tier ${tier})` : `Posted base (Tier ${tier})`, value: base });

  // ---- Per-property results + caps ----
  const results: PortfolioPropertyResult[] = sized.map(({ p, initialLoan, holdback, totalLoan }) => {
    const issues: string[] = [];
    const costBasis = p.asIsValue + p.sunkCosts;
    const fullCost = costBasis + p.budget;
    const initialLtcVal = costBasis > 0 ? initialLoan / costBasis : 0;
    const arltvVal = p.arv > 0 ? totalLoan / p.arv : 0;
    const ltfcVal = fullCost > 0 ? totalLoan / fullCost : 0;
    const ltvVal = p.asIsValue > 0 ? totalLoan / p.asIsValue : 0;

    let monthlyPI = 0;
    let monthlyPitia = 0;
    let dscrVal = 0;
    let maxTotalLoan = 0;

    if (isDscr) {
      monthlyPI = dscrQualifyingPayment(totalLoan, ratePct, input.interestOnly);
      monthlyPitia = monthlyPI + (p.annualTaxes + p.annualInsurance + p.annualHoa) / 12;
      dscrVal = monthlyPitia > 0 ? p.monthlyRent / monthlyPitia : 0;
      maxTotalLoan = Math.round(ltvCapPct * p.asIsValue);

      if (ltvVal > ltvCapPct + 1e-9)
        issues.push(`LTV ${(ltvVal * 100).toFixed(1)}% exceeds the ${(ltvCapPct * 100).toFixed(1)}% cap. Max loan ${fmtUsd(maxTotalLoan)}.`);
      if (dscrVal < CAPS.dscr.minDscr - 1e-9)
        issues.push(`DSCR ${dscrVal.toFixed(2)} is below the ${CAPS.dscr.minDscr.toFixed(2)} floor.`);
    } else {
      const initialCapDollars = initialCapPct * costBasis + p.budget;
      const arvCap = arltvCapPct * p.arv;
      maxTotalLoan = Math.round(isGU ? Math.min(initialCapDollars, arvCap, ltfcCapPct * fullCost) : Math.min(initialCapDollars, arvCap));

      if (initialLtcVal > initialCapPct + 1e-9) {
        issues.push(
          `Initial LTC ${(initialLtcVal * 100).toFixed(1)}% exceeds the ${(initialCapPct * 100).toFixed(0)}% cap${
            isGU ? ` (permits ${input.permitsApproved ? "approved" : "not approved"})` : ` (Tier ${tier}${input.fico < 740 ? ", <740 FICO" : ""})`
          }.`
        );
      }
      if (arltvVal > arltvCapPct + 1e-9)
        issues.push(`ARLTV ${(arltvVal * 100).toFixed(1)}% exceeds the ${(arltvCapPct * 100).toFixed(0)}% cap. Max total loan ${fmtUsd(maxTotalLoan)}.`);
      if (isGU && ltfcVal > ltfcCapPct + 1e-9)
        issues.push(`LTFC ${(ltfcVal * 100).toFixed(1)}% exceeds the ${(ltfcCapPct * 100).toFixed(0)}% cap.`);
    }

    const maxInitialLoan = isDscr ? maxTotalLoan : Math.max(0, maxTotalLoan - holdback);

    if (isRefi && p.estimatedPayoff > 0 && initialLoan < p.estimatedPayoff) {
      warnings.push(
        `${p.address || "A property"}: Initial Loan (${fmtUsd(initialLoan)}) is below its Estimated Payoff (${fmtUsd(p.estimatedPayoff)}).`
      );
    }

    return {
      property: p,
      initialLoan,
      holdback,
      totalLoan,
      initialLtc: initialLtcVal,
      arltv: arltvVal,
      ltfc: ltfcVal,
      ltv: ltvVal,
      monthlyPI: Math.round(monthlyPI),
      monthlyPitia: Math.round(monthlyPitia),
      dscr: +dscrVal.toFixed(2),
      maxTotalLoan,
      maxInitialLoan,
      ok: issues.length === 0,
      issues,
    };
  });

  const blendedPI = isDscr ? dscrQualifyingPayment(totals.loan, ratePct, input.interestOnly) : 0;
  const blendedPitia = blendedPI + escrowTotal;
  const blendedDscr = isDscr && blendedPitia > 0 ? +(totals.monthlyRent / blendedPitia).toFixed(2) : 0;
  totals.monthlyPitia = Math.round(blendedPitia);

  // ---- Validation ----
  let ok = true;

  if (n === 0) {
    ok = false;
    blockers.push({
      reason: "No properties added to the portfolio.",
      fix: "Add at least one property to the schedule.",
    });
  }
  if (input.properties.length > MAX_PORTFOLIO_PROPERTIES)
    warnings.push(`Only the first ${MAX_PORTFOLIO_PROPERTIES} properties are priced (max per loan).`);

  const failing = results.filter((r) => !r.ok);
  if (failing.length > 0) {
    ok = false;
    blockers.push({
      reason: `${failing.length} propert${failing.length === 1 ? "y" : "ies"} exceed program caps.`,
      fix: `Review the flagged rows in the property schedule below and lower the loan/leverage on each.`,
    });
  }

  if (isDscr) {
    if (blendedLtv > ltvCapPct + 1e-9) {
      ok = false;
      blockers.push({
        reason: `Blended LTV ${(blendedLtv * 100).toFixed(1)}% exceeds the ${(ltvCapPct * 100).toFixed(1)}% portfolio cap.`,
        fix: `Lower the target LTV to ${(ltvCapPct * 100).toFixed(0)}% or add equity on the higher-leverage properties.`,
      });
    }
    if (blendedDscr < CAPS.dscr.minDscr - 1e-9) {
      ok = false;
      blockers.push({
        reason: `Blended DSCR ${blendedDscr.toFixed(2)} is below the ${CAPS.dscr.minDscr.toFixed(2)} floor.`,
        fix: `Lower the blended LTV or switch to interest-only to reduce the payment and lift DSCR above ${CAPS.dscr.minDscr.toFixed(2)}.`,
      });
    }
  } else {
    if (blendedInitialLtc > initialCapPct + 1e-9) {
      ok = false;
      blockers.push({
        reason: `Blended Initial LTC ${(blendedInitialLtc * 100).toFixed(1)}% exceeds the ${(initialCapPct * 100).toFixed(0)}% cap.`,
        fix: `Lower Initial LTC to ${(initialCapPct * 100).toFixed(0)}% or below across the schedule.`,
      });
    }
    if (blendedArltv > arltvCapPct + 1e-9) {
      ok = false;
      blockers.push({
        reason: `Blended ARLTV ${(blendedArltv * 100).toFixed(1)}% exceeds the ${(arltvCapPct * 100).toFixed(0)}% portfolio cap.`,
        fix: `Reduce loan amounts or raise ARV support so blended ARLTV is ${(arltvCapPct * 100).toFixed(0)}% or less.`,
      });
    }
    if (isGU && blendedLtfc > ltfcCapPct + 1e-9) {
      ok = false;
      blockers.push({
        reason: `Blended LTFC ${(blendedLtfc * 100).toFixed(1)}% exceeds the ${(ltfcCapPct * 100).toFixed(0)}% cap.`,
        fix: `Lower total financed cost to ${(ltfcCapPct * 100).toFixed(0)}% or below${isGU ? ", or finance the interest reserve to raise the cap" : ""}.`,
      });
    }
    if (isGU && tier < 3) {
      ok = false;
      blockers.push({
        reason: `Ground-Up requires Tier 3+ experience — this profile is Tier ${tier}.`,
        fix: `Add verified build experience (or a licensed GC co-borrower) to reach Tier 3, or use Fix & Flip.`,
      });
    }
  }

  if (totals.loan > 0 && totals.loan < product.minLoan) {
    ok = false;
    blockers.push({
      reason: `Total loan amount ${fmtUsd(totals.loan)} is below the ${fmtUsd(product.minLoan)} minimum.`,
      fix: `Add properties or raise leverage so the total loan reaches ${fmtUsd(product.minLoan)}.`,
    });
  }
  if (totals.loan > product.maxLoan)
    warnings.push(`Above the ${fmtUsd(product.maxLoan)} ${product.label} envelope — reviewed case-by-case.`);
  if (input.fico < product.minFico) {
    ok = false;
    blockers.push({
      reason: `FICO ${input.fico} is below the ${product.minFico} minimum for ${product.label}.`,
      fix: `Raise the qualifying FICO to ${product.minFico}+.`,
    });
  }

  // ---- Origination + broker comp ----
  const originationPct = ORIGINATION[family][input.channel][tier];
  const originationDollars = ok ? Math.round(originationPct * totals.loan) : null;

  const isTpo = input.channel === "tpo";
  const brokerPointsPct = isTpo ? Math.max(0, input.brokerPointsPct ?? 0) : 0;
  const brokerProcessingFee = isTpo ? Math.max(0, input.brokerProcessingFee ?? 0) : 0;
  const brokerPointsDollars = isTpo && ok ? Math.round((brokerPointsPct / 100) * totals.loan) : null;

  if (isTpo) {
    const combined = originationPct * 100 + brokerPointsPct;
    if (combined > MAX_COMBINED_POINTS + 1e-9) {
      ok = false;
      const maxBroker = Math.max(0, MAX_COMBINED_POINTS - originationPct * 100);
      blockers.push({
        reason: `Combined points ${combined.toFixed(2)}% exceed the ${MAX_COMBINED_POINTS.toFixed(2)}% cap (lender ${(originationPct * 100).toFixed(2)}% + broker ${brokerPointsPct.toFixed(2)}%).`,
        fix: `Lower broker points to ${maxBroker.toFixed(2)}% or less.`,
      });
    }
  }

  const interestOnly = isDscr ? input.interestOnly : true;
  const estMonthlyFullyDrawn = isDscr
    ? Math.round(interestOnly ? (totals.loan * ratePct) / 100 / 12 : blendedPI)
    : Math.round((totals.loan * ratePct) / 100 / 12);
  const estMonthlyInitial = isDscr ? null : Math.round((totals.initialLoan * ratePct) / 100 / 12);
  const interestReserve = isDscr
    ? Math.round(amortizedPI(totals.loan, ratePct) * 3)
    : Math.round(((totals.loan * ratePct) / 100 / 12) * 100) / 100;
  const reserveLabel = isDscr ? "3 months P&I" : "1 month interest";

  // Rate buydown fee (discount points) — DSCR portfolio only, paid at closing.
  const buydownFee =
    ok && isDscr && input.buydown && input.buydown > 0 ? Math.round(input.buydown * totals.loan) : 0;

  const tierFees = FEES[family][tier];
  const fees: FeeLine[] = [
    { label: "Lender origination", amount: originationDollars },
    ...(isTpo
      ? [
          { label: `Broker points (${brokerPointsPct.toFixed(2)}%)`, amount: brokerPointsDollars },
          { label: "Broker processing fee", amount: brokerProcessingFee },
        ]
      : []),
    ...(buydownFee > 0
      ? [{ label: `Rate buydown (${(input.buydown! * 100).toFixed(2)} pt)`, amount: buydownFee }]
      : []),
    { label: "Processing", amount: tierFees.processing },
    { label: "Underwriting", amount: tierFees.underwriting },
    { label: "Legal / doc review", amount: THIRD_PARTY_FEES.legalReview },
    ...(isDscr ? [{ label: "Corelogix", amount: THIRD_PARTY_FEES.corelogix }] : []),
    { label: "Servicing setup", amount: THIRD_PARTY_FEES.servicingSetup },
    { label: `Appraisal (${n} propert${n === 1 ? "y" : "ies"})`, amount: null, display: `${THIRD_PARTY_FEES.appraisalRangePortfolio} each` },
    { label: "Title / settlement", amount: null, display: THIRD_PARTY_FEES.titleSettlement },
  ];

  const knownFees = sumKnownFees(fees);
  let cashToClose: number | null = null;
  let cashToBorrower: number | null = null;
  if (ok) {
    const base0 = isRefi ? totals.payoff : totals.asIs;
    const raw = base0 - totals.initialLoan + knownFees + interestReserve;
    if (raw >= 0) {
      cashToClose = Math.round(raw);
      cashToBorrower = 0;
    } else {
      cashToClose = 0;
      cashToBorrower = Math.round(-raw);
    }
  }

  if (ok) messages.push("Indicative — subject to underwriting, appraisal, title, and insurance. Not a commitment.");

  // ---- Rate/point ladder (DSCR portfolio only; buy-down side, par = 100) ----
  let rateLadder: RateLadderRow[] | undefined;
  if (ok && isDscr) {
    const cut = dscrBuydownReduction(input.buydown ?? 0);
    const parRatePct = +(ratePct + cut * 100).toFixed(3);
    rateLadder = buildRateLadder(parRatePct, DSCR_FLOOR * 100, totals.loan, !!input.interestOnly, (input.buydown ?? 0) * 100);
  }

  return {
    ok,
    blockers,
    messages,
    warnings,
    product,
    tier,
    count: n,
    rateLadder,
    initialCapPct,
    arltvCapPct,
    ltfcCapPct,
    ltvCapPct,
    properties: results,
    totals,
    blendedInitialLtc: +blendedInitialLtc.toFixed(4),
    blendedArltv: +blendedArltv.toFixed(4),
    blendedLtfc: +blendedLtfc.toFixed(4),
    blendedLtv: +blendedLtv.toFixed(4),
    blendedDscr,
    ratePct: ok ? ratePct : null,
    originationPct,
    originationDollars,
    points: originationPct * 100,
    brokerPointsPct,
    brokerPointsDollars,
    brokerProcessingFee,
    estMonthlyFullyDrawn: ok ? estMonthlyFullyDrawn : null,
    estMonthlyInitial: ok ? estMonthlyInitial : null,
    interestReserve: ok ? interestReserve : null,
    reserveLabel,
    knownFees,
    cashToClose,
    cashToBorrower,
    interestOnly,
    fees,
    rateBreakdown: breakdown,
  };
}
