"use client";

import { useState } from "react";
import { ChevronDown, Wallet, Info, TrendingDown, Check } from "lucide-react";
import { fmtUsd, type RateLadderRow } from "@/lib/pricing";

/**
 * Cash to Close
 * -------------
 * Purchase: purchase price − Initial Loan + fees + reserve
 * Refi:     estimated payoff − Initial Loan + fees + reserve
 * A negative result means proceeds exceed what's owed → cash TO the borrower.
 */
export function CashToCloseCard({
  isRefi,
  basisAmount,
  loanApplied,
  knownFees,
  reserve,
  reserveLabel,
  cashToClose,
  cashToBorrower,
}: {
  isRefi: boolean;
  basisAmount: number;
  loanApplied: number;
  knownFees: number;
  reserve: number;
  reserveLabel: string;
  cashToClose: number;
  cashToBorrower: number;
}) {
  const givesCash = cashToBorrower > 0;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-1.5">
        <Wallet size={13} /> {givesCash ? "Cash to Borrower" : "Cash to Close"}
      </p>

      <ul className="text-sm divide-y divide-slate-100">
        <Row k={isRefi ? "Estimated payoff" : "Purchase price"} v={fmtUsd(basisAmount)} />
        <Row k="Less: Initial Loan Amount" v={`(${fmtUsd(loanApplied)})`} negative />
        <Row k="Plus: lender & broker fees" v={fmtUsd(knownFees)} />
        <Row k={`Plus: interest reserve (${reserveLabel})`} v={fmtUsd(reserve)} />
      </ul>

      <div className={`mt-3 pt-3 border-t-2 flex items-center justify-between ${givesCash ? "border-emerald-200" : "border-slate-200"}`}>
        <span className="text-sm font-semibold text-slate-700">
          {givesCash ? "Estimated cash to borrower" : "Estimated cash to close"}
        </span>
        <span className={`text-xl font-bold ${givesCash ? "text-emerald-600" : "text-navy-900"}`}>
          {fmtUsd(givesCash ? cashToBorrower : cashToClose)}
        </span>
      </div>

      <p className="text-[11px] text-slate-400 mt-2 flex gap-1.5">
        <Info size={12} className="shrink-0 mt-0.5" />
        Excludes appraisal and title/settlement, which are quoted separately.
        {!isRefi && " Rehab/construction is funded by holdback, not at close."}
      </p>
    </div>
  );
}

/**
 * Rate/point ladder — buy the rate down with discount points, par = 100.
 * Click a row to apply that buy-down; the payment column updates live.
 */
export function RateLadder({
  rows,
  onSelect,
  monthlyLabel,
}: {
  rows: RateLadderRow[];
  onSelect: (feeFraction: number) => void;
  monthlyLabel: string;
}) {
  if (!rows || rows.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
          <TrendingDown size={13} /> Buy the rate down
        </span>
        <span className="text-[11px] text-slate-400">par = 100.00</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
              <th className="pl-4 pr-2 py-2 font-medium">Rate</th>
              <th className="px-2 py-2 font-medium">Points</th>
              <th className="px-2 py-2 font-medium">Price</th>
              <th className="px-2 py-2 font-medium text-right">Cost</th>
              <th className="px-2 py-2 font-medium text-right">{monthlyLabel}</th>
              <th className="pr-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={i}
                onClick={() => onSelect(r.pointsPct / 100)}
                className={`cursor-pointer border-b border-slate-50 transition-colors ${
                  r.isSelected ? "bg-gold-500/10" : "hover:bg-slate-50"
                }`}
              >
                <td className="pl-4 pr-2 py-2.5 font-semibold text-slate-900">
                  {r.ratePct.toFixed(3)}%
                  {r.isPar && <span className="ml-1.5 text-[10px] font-medium text-slate-400">PAR</span>}
                </td>
                <td className="px-2 py-2.5 text-slate-600">{r.pointsPct.toFixed(2)}</td>
                <td className="px-2 py-2.5 text-slate-500">{r.pricePct.toFixed(2)}</td>
                <td className="px-2 py-2.5 text-right text-slate-700">{r.feeDollars > 0 ? fmtUsd(r.feeDollars) : "—"}</td>
                <td className="px-2 py-2.5 text-right font-medium text-slate-900">{fmtUsd(r.monthly)}</td>
                <td className="pr-3 py-2.5 text-right">
                  {r.isSelected && <Check size={15} className="text-gold-600 inline" />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-slate-400 px-4 py-2.5 flex gap-1.5 border-t border-slate-100">
        <Info size={12} className="shrink-0 mt-0.5" />
        Discount points are paid at closing (~25 bps of rate per point) and are added to cash-to-close. Rate floors apply.
      </p>
    </div>
  );
}

function Row({ k, v, negative }: { k: string; v: string; negative?: boolean }) {
  return (
    <li className="flex justify-between gap-3 py-1.5">
      <span className="text-slate-500">{k}</span>
      <span className={`font-medium ${negative ? "text-emerald-600" : "text-slate-900"}`}>{v}</span>
    </li>
  );
}

/**
 * "Why this rate" — the base rate plus every adjuster the engine applied.
 */
export function RateBreakdown({
  items,
  finalRatePct,
}: {
  items: { label: string; value: number }[];
  finalRatePct: number;
}) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;

  const [base, ...adjusters] = items;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 transition-colors"
      >
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">Why this rate</span>
        <ChevronDown size={16} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="px-4 pb-4">
          <ul className="text-sm divide-y divide-slate-100">
            <li className="flex justify-between gap-3 py-1.5">
              <span className="text-slate-600 font-medium">{base.label}</span>
              <span className="font-semibold text-slate-900">{(base.value * 100).toFixed(3)}%</span>
            </li>
            {adjusters.map((a, i) => (
              <li key={i} className="flex justify-between gap-3 py-1.5">
                <span className="text-slate-500">{a.label}</span>
                <span className={`font-medium ${a.value < 0 ? "text-emerald-600" : "text-amber-600"}`}>
                  {a.value > 0 ? "+" : ""}
                  {(a.value * 100).toFixed(3)}%
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-2 pt-2 border-t-2 border-slate-200 flex justify-between">
            <span className="text-sm font-semibold text-slate-700">Final rate</span>
            <span className="text-sm font-bold text-navy-900">{finalRatePct.toFixed(3)}%</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            Rate floors apply — the final rate is never below the program floor.
          </p>
        </div>
      )}
    </div>
  );
}
