/**
 * Portal mock data + types.
 * These types mirror the future Supabase schema (see BROKER-PORTAL-BUILD-PLAN.md).
 * Swap these seed arrays for real DB queries when Supabase is wired in.
 */

import type { ProductKey } from "./pricing";

export type DealStatus =
  | "draft"
  | "submitted"
  | "in_review"
  | "approved"
  | "declined"
  | "funded";

export interface Deal {
  id: string;
  borrower: string;
  product: ProductKey;
  propertyAddress: string;
  loanAmount: number;
  propertyValue: number;
  fico: number;
  status: DealStatus;
  createdAt: string; // ISO date
  docsReceived: number;
  docsRequired: number;
}

export interface RequiredDoc {
  id: string;
  label: string;
  received: boolean;
}

export const STATUS_META: Record<
  DealStatus,
  { label: string; className: string }
> = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-600" },
  submitted: { label: "Submitted", className: "bg-blue-50 text-blue-700" },
  in_review: { label: "In Review", className: "bg-amber-50 text-amber-700" },
  approved: { label: "Approved", className: "bg-emerald-50 text-emerald-700" },
  declined: { label: "Declined", className: "bg-red-50 text-red-700" },
  funded: { label: "Funded", className: "bg-gold-500/15 text-gold-700" },
};

export const MOCK_BROKER = {
  name: "Marcus Reyes",
  company: "Summit Lending Partners",
  email: "marcus@summitlending.com",
  brokerId: "BRK-1042",
};

export const MOCK_DEALS: Deal[] = [
  {
    id: "FC-2041",
    borrower: "Delgado Holdings LLC",
    product: "fix_and_flip",
    propertyAddress: "418 Maple Ave, Tampa, FL",
    loanAmount: 312_000,
    propertyValue: 260_000,
    fico: 724,
    status: "in_review",
    createdAt: "2026-06-22",
    docsReceived: 4,
    docsRequired: 6,
  },
  {
    id: "FC-2038",
    borrower: "R. Okafor",
    product: "dscr",
    propertyAddress: "72 Birchwood Dr, Charlotte, NC",
    loanAmount: 288_000,
    propertyValue: 360_000,
    fico: 758,
    status: "approved",
    createdAt: "2026-06-18",
    docsReceived: 6,
    docsRequired: 6,
  },
  {
    id: "FC-2035",
    borrower: "Vantage REI LLC",
    product: "fix_and_flip",
    propertyAddress: "1290 Harbor St, San Diego, CA",
    loanAmount: 640_000,
    propertyValue: 980_000,
    fico: 701,
    status: "submitted",
    createdAt: "2026-06-15",
    docsReceived: 2,
    docsRequired: 5,
  },
  {
    id: "FC-2029",
    borrower: "K. Sistrunk",
    product: "dscr",
    propertyAddress: "55 Oakridge Ln, Austin, TX",
    loanAmount: 415_000,
    propertyValue: 520_000,
    fico: 742,
    status: "funded",
    createdAt: "2026-05-30",
    docsReceived: 6,
    docsRequired: 6,
  },
  {
    id: "FC-2044",
    borrower: "Northgate Capital LLC",
    product: "new_construction",
    propertyAddress: "8 Founders Way, Nashville, TN",
    loanAmount: 720_000,
    propertyValue: 900_000,
    fico: 688,
    status: "draft",
    createdAt: "2026-06-25",
    docsReceived: 0,
    docsRequired: 7,
  },
];

export function docChecklistFor(product: ProductKey): RequiredDoc[] {
  const base: RequiredDoc[] = [
    { id: "app", label: "Signed Loan Application", received: true },
    { id: "id", label: "Borrower ID / Entity Docs", received: true },
    { id: "contract", label: "Purchase Contract", received: false },
    { id: "bank", label: "Bank Statements (2 mo.)", received: false },
    { id: "insurance", label: "Insurance Binder", received: false },
  ];
  if (product === "fix_and_flip" || product === "new_construction") {
    base.push({ id: "scope", label: "Rehab / Construction Budget", received: false });
    base.push({ id: "arv", label: "ARV / Appraisal Support", received: false });
  }
  if (product === "dscr") {
    base.push({ id: "lease", label: "Lease / Rent Roll", received: false });
  }
  return base;
}

export function findDeal(id: string): Deal | undefined {
  return MOCK_DEALS.find((d) => d.id === id);
}
