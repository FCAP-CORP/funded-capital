"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Printer } from "lucide-react";
import {
  RESIDENCY_OPTIONS,
  EXPERIENCE_BUCKETS,
  CHANNEL_OPTIONS,
  LOAN_PURPOSE_OPTIONS,
  DSCR_TERM_OPTIONS,
  PPP_OPTIONS,
  isRefiPurpose,
  fmtUsd,
  type PortfolioQuoteResult,
} from "@/lib/pricing";
import {
  useBrokerBrand,
  BrandBar,
  BrandHeaderMark,
  BrandContact,
  brandPreparedBy,
} from "@/components/TermSheetBranding";
import type { PortfolioForm } from "./PortfolioClient";

const TERM_SHEET_DATE = "2026";

export default function PortfolioTermSheet({
  form,
  quote,
  onClose,
}: {
  form: PortfolioForm;
  quote: PortfolioQuoteResult;
  onClose: () => void;
}) {
  const isBridge = quote.product.family === "bridge";
  const isGU = form.product === "new_construction";
  const isDscr = !isBridge;
  const isRefi = isRefiPurpose(form.loanPurpose);
  const { brand, setBrand, mode, setMode } = useBrokerBrand(form.channel === "tpo" ? "whitelabel" : "funded");
  const branded = mode === "funded"; // Funded Capital letterhead vs. broker white-label

  const residency = RESIDENCY_OPTIONS.find((r) => r.key === form.residency)?.label ?? "—";
  const experience = `${EXPERIENCE_BUCKETS[form.experienceBucket]} (Tier ${quote.tier})`;
  const channel = CHANNEL_OPTIONS.find((c) => c.key === form.channel)?.label ?? "—";
  const purpose = LOAN_PURPOSE_OPTIONS.find((p) => p.key === form.loanPurpose)?.label ?? "—";
  const term = DSCR_TERM_OPTIONS.find((t) => t.key === form.dscrTerm)?.label ?? "—";
  const ppp = PPP_OPTIONS.find((p) => p.key === form.ppp)?.label ?? "—";

  const [ref] = useState(() => `TS-P${Math.floor(10000 + Math.random() * 89999)}`);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const accentBox = branded ? "bg-navy-900 text-white" : "bg-slate-800 text-white";
  const accentText = branded ? "text-gold-400" : "text-slate-200";
  const sectionHead = branded ? "text-gold-600" : "text-slate-500";
  const titleColor = branded ? "text-navy-900" : "text-slate-900";

  const feeLeft = quote.fees.slice(0, Math.ceil(quote.fees.length / 2));
  const feeRight = quote.fees.slice(Math.ceil(quote.fees.length / 2));
  const budgetLabel = isGU ? "Constr." : "Rehab";

  const content = (
    <div className="fixed inset-0 z-50 bg-slate-900/60 overflow-y-auto p-4 sm:p-8 flex justify-center no-print-bg ts-print-root">
      <div className="w-full max-w-4xl">
        <div className="no-print flex justify-between items-center mb-3">
          <button onClick={onClose} className="inline-flex items-center gap-1.5 text-white/90 hover:text-white text-sm">
            <X size={18} /> Close
          </button>
          <button onClick={() => window.print()} className="btn-primary text-sm px-4 py-2.5">
            <Printer size={16} /> Print / Save as PDF
          </button>
        </div>

        <BrandBar brand={brand} setBrand={setBrand} mode={mode} setMode={setMode} />

        <article id="term-sheet" className="bg-white rounded-2xl shadow-card-hover text-slate-800">
          <div className="ts-inner p-8 sm:p-10">
            <header className="flex items-start justify-between border-b border-slate-200 pb-5 mb-6">
              <div>
                <BrandHeaderMark mode={mode} brand={brand} />
                <p className="text-xs text-slate-400 mt-2">Portfolio Term Sheet · Not a commitment to lend</p>
                <BrandContact mode={mode} brand={brand} />
              </div>
              <div className="text-right text-xs text-slate-500">
                <p className="font-semibold text-slate-700">{ref}</p>
                <p>Issued {TERM_SHEET_DATE}</p>
                <p>Lock: 30 days post-approval</p>
                {branded && <p>{channel} channel</p>}
              </div>
            </header>

            <h1 className={`text-xl font-bold mb-1 ${titleColor}`}>
              {quote.product.label} Portfolio — {quote.count} Properties
            </h1>
            <p className="text-sm text-slate-500 mb-6">{form.borrowerName || "Borrower"} · Single loan, cross-collateralized</p>

            {/* Headline */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              <Headline label="Interest Rate" value={`${quote.ratePct?.toFixed(3)}%`} boxCls={accentBox} accentText={accentText} accent />
              <Headline label="Total Loan Amount" value={fmtUsd(quote.totals.loan)} />
              {isBridge ? (
                <>
                  <Headline label="Initial Loan Amount" value={fmtUsd(quote.totals.initialLoan)} />
                  <Headline label="Holdback" value={fmtUsd(quote.totals.holdback)} />
                </>
              ) : (
                <>
                  <Headline label="Blended DSCR" value={quote.blendedDscr.toFixed(2)} />
                  <Headline label={quote.interestOnly ? "Payment (IO)" : "Payment (P&I)"} value={quote.estMonthlyFullyDrawn ? fmtUsd(quote.estMonthlyFullyDrawn) : "—"} />
                </>
              )}
            </div>

            {/* Property schedule */}
            <h3 className={`text-xs font-semibold uppercase tracking-widest mb-2 ${sectionHead}`}>Property Schedule</h3>
            <table className="w-full text-[11px] mb-6 border-collapse">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-1.5 pr-2 font-medium">#</th>
                  <th className="py-1.5 pr-2 font-medium">Address</th>
                  <th className="py-1.5 pr-2 font-medium text-right">As-Is</th>
                  {isBridge ? (
                    <>
                      <th className="py-1.5 pr-2 font-medium text-right">{budgetLabel}</th>
                      <th className="py-1.5 pr-2 font-medium text-right">ARV</th>
                      <th className="py-1.5 pr-2 font-medium text-right">Initial</th>
                      <th className="py-1.5 pr-2 font-medium text-right">Holdback</th>
                      <th className="py-1.5 pr-2 font-medium text-right">Total</th>
                      <th className="py-1.5 font-medium text-right">ARLTV</th>
                    </>
                  ) : (
                    <>
                      <th className="py-1.5 pr-2 font-medium text-right">Rent</th>
                      <th className="py-1.5 pr-2 font-medium text-right">PITIA</th>
                      <th className="py-1.5 pr-2 font-medium text-right">Loan</th>
                      <th className="py-1.5 pr-2 font-medium text-right">LTV</th>
                      <th className="py-1.5 font-medium text-right">DSCR</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {quote.properties.map((r, i) => (
                  <tr key={r.property.id} className="border-b border-slate-100">
                    <td className="py-1.5 pr-2 text-slate-400">{i + 1}</td>
                    <td className="py-1.5 pr-2 font-medium text-slate-900">{r.property.address || "—"}</td>
                    <td className="py-1.5 pr-2 text-right">{fmtUsd(r.property.asIsValue)}</td>
                    {isBridge ? (
                      <>
                        <td className="py-1.5 pr-2 text-right">{fmtUsd(r.property.budget)}</td>
                        <td className="py-1.5 pr-2 text-right">{fmtUsd(r.property.arv)}</td>
                        <td className="py-1.5 pr-2 text-right">{fmtUsd(r.initialLoan)}</td>
                        <td className="py-1.5 pr-2 text-right">{fmtUsd(r.holdback)}</td>
                        <td className="py-1.5 pr-2 text-right font-semibold text-slate-900">{fmtUsd(r.totalLoan)}</td>
                        <td className="py-1.5 text-right">{(r.arltv * 100).toFixed(1)}%</td>
                      </>
                    ) : (
                      <>
                        <td className="py-1.5 pr-2 text-right">{fmtUsd(r.property.monthlyRent)}</td>
                        <td className="py-1.5 pr-2 text-right">{fmtUsd(r.monthlyPitia)}</td>
                        <td className="py-1.5 pr-2 text-right font-semibold text-slate-900">{fmtUsd(r.totalLoan)}</td>
                        <td className="py-1.5 pr-2 text-right">{(r.ltv * 100).toFixed(1)}%</td>
                        <td className="py-1.5 text-right">{r.dscr.toFixed(2)}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 font-bold text-slate-900">
                  <td className="py-2 pr-2"></td>
                  <td className="py-2 pr-2">Portfolio Total</td>
                  <td className="py-2 pr-2 text-right">{fmtUsd(quote.totals.asIs)}</td>
                  {isBridge ? (
                    <>
                      <td className="py-2 pr-2 text-right">{fmtUsd(quote.totals.budget)}</td>
                      <td className="py-2 pr-2 text-right">{fmtUsd(quote.totals.arv)}</td>
                      <td className="py-2 pr-2 text-right">{fmtUsd(quote.totals.initialLoan)}</td>
                      <td className="py-2 pr-2 text-right">{fmtUsd(quote.totals.holdback)}</td>
                      <td className="py-2 pr-2 text-right">{fmtUsd(quote.totals.loan)}</td>
                      <td className="py-2 text-right">{(quote.blendedArltv * 100).toFixed(1)}%</td>
                    </>
                  ) : (
                    <>
                      <td className="py-2 pr-2 text-right">{fmtUsd(quote.totals.monthlyRent)}</td>
                      <td className="py-2 pr-2 text-right">{fmtUsd(quote.totals.monthlyPitia)}</td>
                      <td className="py-2 pr-2 text-right">{fmtUsd(quote.totals.loan)}</td>
                      <td className="py-2 pr-2 text-right">{(quote.blendedLtv * 100).toFixed(1)}%</td>
                      <td className="py-2 text-right">{quote.blendedDscr.toFixed(2)}</td>
                    </>
                  )}
                </tr>
              </tfoot>
            </table>

            <div className="grid sm:grid-cols-2 gap-x-10 gap-y-6">
              <TermBlock title="Loan Terms" headCls={sectionHead}>
                <Line k="Program" v={`${quote.product.label} (Portfolio)`} />
                <Line k="Properties" v={String(quote.count)} />
                <Line k="Purpose" v={purpose} />
                <Line k="Term" v={quote.product.termLabel} />
                {isRefi && <Line k="Total Estimated Payoff" v={fmtUsd(quote.totals.payoff)} />}
                {isRefi && isBridge && <Line k="Total Sunk Costs" v={fmtUsd(quote.totals.sunk)} />}
                {isBridge ? (
                  <>
                    <Line k="Blended Initial LTC" v={`${(quote.blendedInitialLtc * 100).toFixed(1)}%`} />
                    <Line k="Blended ARLTV" v={`${(quote.blendedArltv * 100).toFixed(1)}%`} />
                    {isGU && <Line k="Blended LTFC" v={`${(quote.blendedLtfc * 100).toFixed(1)}%`} />}
                    <Line k="Monthly (IO, fully drawn)" v={quote.estMonthlyFullyDrawn ? fmtUsd(quote.estMonthlyFullyDrawn) : "—"} />
                    {quote.estMonthlyInitial !== null && <Line k="Monthly (IO, initial)" v={fmtUsd(quote.estMonthlyInitial)} />}
                  </>
                ) : (
                  <>
                    <Line k="Purpose" v={purpose} />
                    <Line k="Amortization" v={term} />
                    <Line k="Prepay Penalty" v={ppp} />
                    <Line k="Blended LTV" v={`${(quote.blendedLtv * 100).toFixed(1)}%`} />
                    <Line k="Blended DSCR" v={quote.blendedDscr.toFixed(2)} />
                  </>
                )}
                <Line k={`Interest Reserve (${quote.reserveLabel})`} v={quote.interestReserve !== null ? fmtUsd(quote.interestReserve) : "—"} />
              </TermBlock>

              <TermBlock title="Borrower & Guidelines" headCls={sectionHead}>
                <Line k="Name" v={form.borrowerName || "—"} />
                <Line k="Experience" v={experience} />
                <Line k="Credit Score" v={String(form.fico)} />
                <Line k="Residency" v={residency} />
                {isBridge ? (
                  <>
                    <Line k={isGU ? "Construction Funding" : "Rehab Funding"} v="100%, held back and released by draw" />
                    {isGU && <Line k="Permits" v={form.permitsApproved ? "Approved" : "Not approved"} />}
                    <Line
                      k="Caps Applied"
                      v={`${(quote.initialCapPct * 100).toFixed(0)}% Initial LTC · ${(quote.arltvCapPct * 100).toFixed(0)}% ARLTV${
                        isGU ? ` · ${(quote.ltfcCapPct * 100).toFixed(0)}% LTFC` : ""
                      }`}
                    />
                  </>
                ) : (
                  <Line k="Caps Applied" v={`${(quote.ltvCapPct * 100).toFixed(1)}% max LTV · 1.05 DSCR floor`} />
                )}
              </TermBlock>
            </div>

            {/* Fees */}
            <div className="mt-8">
              <h3 className={`text-xs font-semibold uppercase tracking-widest mb-2 ${sectionHead}`}>Estimated Fees</h3>
              <div className="grid sm:grid-cols-2 gap-x-10">
                <dl className="divide-y divide-slate-100 text-sm">
                  {feeLeft.map((f) => (
                    <Line key={f.label} k={f.label} v={f.display ?? (f.amount === null ? "At cost" : fmtUsd(f.amount))} />
                  ))}
                </dl>
                <dl className="divide-y divide-slate-100 text-sm">
                  {feeRight.map((f) => (
                    <Line key={f.label} k={f.label} v={f.display ?? (f.amount === null ? "At cost" : fmtUsd(f.amount))} />
                  ))}
                </dl>
              </div>
            </div>

            {/* Cash to close */}
            {quote.cashToClose !== null && (
              <div className="mt-6 rounded-xl bg-slate-50 border border-slate-200 p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-700">
                    {(quote.cashToBorrower ?? 0) > 0 ? "Estimated Cash to Borrower" : "Estimated Cash to Close"}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {isRefi ? "Total payoff" : "Total purchase price"} − Initial Loan Amount + lender/broker fees + interest
                    reserve. Excludes appraisal and title.
                  </p>
                </div>
                <p className="text-xl font-bold text-navy-900 shrink-0 ml-4">
                  {fmtUsd((quote.cashToBorrower ?? 0) > 0 ? quote.cashToBorrower ?? 0 : quote.cashToClose)}
                </p>
              </div>
            )}

            <footer className="mt-8 pt-5 border-t border-slate-200 text-[11px] leading-relaxed text-slate-400">
              This preliminary term sheet is for discussion purposes only and does not constitute a commitment to lend or
              an offer of credit. All terms are indicative and subject to full underwriting, appraisal, title review,
              insurance, and final credit approval.
              {isBridge ? " Rehab/construction funds are held back and released by draw upon inspection." : ""} Business-purpose
              loans only. Not available in all states.
              {brandPreparedBy(mode, brand)}
            </footer>
          </div>
        </article>
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(content, document.body);
}

function Headline({ label, value, accent, boxCls, accentText }: { label: string; value: string; accent?: boolean; boxCls?: string; accentText?: string }) {
  return (
    <div className={`rounded-xl p-3 ${accent ? boxCls : "bg-slate-50"}`}>
      <p className={`text-[11px] ${accent ? accentText : "text-slate-400"}`}>{label}</p>
      <p className={`text-lg font-bold ${accent ? accentText : "text-slate-900"}`}>{value}</p>
    </div>
  );
}

function TermBlock({ title, headCls, children }: { title: string; headCls: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className={`text-xs font-semibold uppercase tracking-widest mb-2 ${headCls}`}>{title}</h3>
      <dl className="divide-y divide-slate-100 text-sm">{children}</dl>
    </div>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between py-1.5 gap-4">
      <dt className="text-slate-500">{k}</dt>
      <dd className="font-medium text-slate-900 text-right">{v}</dd>
    </div>
  );
}
