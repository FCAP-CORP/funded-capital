/**
 * The public site's figures, in one place.
 *
 * Every number a visitor reads on a program page, the home page or the footer
 * comes from here, so a change is one edit instead of a hunt across fifteen
 * pages. That hunt is how "44 states", "close in 5 days" and a 680 credit
 * floor outlived the decisions that retired them (fixed 25 Sep 2026).
 *
 * Rules (brand voice guide, 04-brand/voice): rate RANGES only, never a quote;
 * every figure true today. Confirmed by Luis on 25 Sep 2026: 2-hour average
 * term sheet, $500M+ funded, 1,200+ deals, 200+ brokers, 0.5%-3% broker fee,
 * Fix & Flip up to 90% of cost, multifamily from 8.0% at up to 75% LTV over
 * 1-10 years, rehab draws funded within 1 business day.
 * Still unconfirmed in the voice guide: DSCR "up to 80% LTV" (carried over
 * from the live page unchanged; confirm before promoting it further).
 *
 * Ground-up leverage follows lib/pricing.ts (guLtfcCap): 85% of full cost as
 * standard, 90% for builders with five or more completed projects, plus a 5%
 * band that only finances the interest reserve. Never a flat "85% LTC".
 */

export const COMPANY = {
  phone: "(305) 857-5620",
  phoneHref: "tel:+13058575620",
  email: "processing@fundedcapital.com",
  address: "100 N Biscayne Blvd, Suite 1210, Miami, FL 33132",
} as const;

export const STATS = {
  states: "45",
  excludedStates: "VT, UT, OR, SD, ND",
  loanSizes: "$75K – $5M",
  close: "5–10 business days",
  termSheet: "2 hours",
  funded: "$500M+",
  deals: "1,200+",
  brokers: "200+",
  credit: "660+ most programs · 680+ best tiers",
  drawFunding: "1 business day",
} as const;

export const COMPLIANCE = "Terms are subject to underwriting, appraisal, title, and insurance.";

export interface Program {
  slug: string;
  href: string;
  name: string;
  short: string;
  pitch: string;
  figures: string;
  rows: { label: string; value: string }[];
}

export const PROGRAMS: Program[] = [
  {
    slug: "fix-and-flip",
    href: "/fix-and-flip-loans",
    name: "Fix & Flip",
    short: "Purchase and rehab in one loan.",
    pitch: "Purchase and rehab in one loan. Qualifies on the deal, not your W-2.",
    figures: "up to 90% of cost · from 8.75% · 12–24 months",
    rows: [
      { label: "Rate", value: "from 8.75%" },
      { label: "Leverage", value: "up to 90% of cost" },
      { label: "Term", value: "12–24 months" },
      { label: "Rehab", value: "financed, drawn" },
    ],
  },
  {
    slug: "dscr",
    href: "/dscr-loans",
    name: "DSCR Rental",
    short: "The rent qualifies the loan.",
    pitch: "The property's rent qualifies the loan. No tax returns, no W-2.",
    figures: "from 6.0% · 30-year · purchase or cash-out",
    rows: [
      { label: "Rate", value: "from 6.0%" },
      { label: "Leverage", value: "up to 80% LTV" },
      { label: "Term", value: "30-year" },
      { label: "Income docs", value: "none required" },
    ],
  },
  {
    slug: "ground-up",
    href: "/new-construction-loans",
    name: "Ground-Up",
    short: "Experience earns more of the cost.",
    pitch: "Build from the lot up. Five completed builds earn a higher share of the cost.",
    figures: "85% of cost · 90% with 5+ builds · +5% reserve",
    rows: [
      { label: "Leverage", value: "85% of full cost" },
      { label: "Experienced", value: "90% with 5+ builds" },
      { label: "Interest reserve", value: "+5% of cost, financed" },
      { label: "Term", value: "12–24 months" },
    ],
  },
  {
    slug: "multifamily",
    href: "/multifamily-loans",
    name: "Multifamily & Bridge",
    short: "Buy, stabilize, refinance.",
    pitch: "Short-term and term capital for 5+ unit buildings: buy, stabilize, refinance.",
    figures: "from 8.0% · up to 75% LTV · 1–10 years",
    rows: [
      { label: "Rate", value: "from 8.0%" },
      { label: "Leverage", value: "up to 75% LTV" },
      { label: "Term", value: "1–10 years" },
      { label: "Units", value: "5+" },
    ],
  },
];
