"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Printer } from "lucide-react";
import {
  RESIDENCY_OPTIONS,
  LOAN_PURPOSE_OPTIONS,
  EXPERIENCE_BUCKETS,
  CHANNEL_OPTIONS,
  PPP_OPTIONS,
  isRefiPurpose,
  fmtUsd,
  type QuoteResult,
} from "@/lib/pricing";
import {
  useBrokerBrand,
  BrandBar,
  BrandHeaderMark,
  BrandContact,
  brandPreparedBy,
} from "@/components/TermSheetBranding";
import type { DealForm, PricedOption } from "./PricingClient";

const TERM_SHEET_DATE = "2026"; // static year to satisfy Cache Components

/**
 * Rows for the "Compare Pricing Options" table — one column per priced option,
 * mirroring the layout of the internal committee conditional quote.
 */
function comparisonRows(options: PricedOption[], isBridge: boolean, isTpo: boolean) {
  const val = (fn: (o: PricedOption) => string) => options.map(fn);
  const rows: { label: string; values: string[]; section?: boolean }[] = [];
  const push = (label: string, fn: (o: PricedOption) => string) => rows.push({ label, values: val(fn) });

  if (isBridge) {
    push("Initial LTC", (o) => `${(o.effInitialPct * 100).toFixed(1)}%`);
    push("Initial Loan Amount", (o) => fmtUsd(o.initialLoan));
    push("Holdback", (o) => fmtUsd(o.build));
    push("Holdback Financed", (o) => `${Math.round(o.holdbackPct * 100)}%`);
    push("Total Loan Amount", (o) => fmtUsd(o.loanAmount));
    push(options[0].quote.primaryRatioLabel, (o) => (o.quote.primaryRatio !== null ? `${(o.quote.primaryRatio * 100).toFixed(1)}%` : "—"));
  } else {
    push("LTV", (o) => (o.quote.primaryRatio !== null ? `${(o.quote.primaryRatio * 100).toFixed(1)}%` : "—"));
    push("Loan Amount", (o) => fmtUsd(o.loanAmount));
    push("Amortization", (o) => (o.interestOnly ? "Interest-Only" : "Fully Amortizing"));
    push("Pre-Payment Penalty", (o) => PPP_OPTIONS.find((p) => p.key === o.ppp)?.label ?? "—");
  }

  push("Today's Gross Rate", (o) => (o.quote.ratePct !== null ? `${o.quote.ratePct.toFixed(3)}%` : "—"));
  push("Discount Points", (o) => (o.buydownPct > 0 ? `${(o.buydownPct * 100).toFixed(2)} pt` : "None"));
  push(isBridge ? "Monthly Payment (IO, fully drawn)" : "Monthly Payment", (o) =>
    o.quote.estMonthlyPayment ? fmtUsd(o.quote.estMonthlyPayment) : "—"
  );
  if (!isBridge) push("DSCR", (o) => (o.quote.dscr !== null ? o.quote.dscr.toFixed(2) : "—"));
  push("Origination Points", (o) => `${o.quote.points.toFixed(2)}%`);

  // ---- Itemized fees, so nothing is hidden inside a lump sum ----
  // Fee labels are identical across options except the buydown, whose label
  // carries the point count — normalize that one so it lines up in a single row.
  rows.push({ label: "Estimated Fees", values: [], section: true });
  const feeKey = (l: string) => (l.startsWith("Rate buydown") ? "Rate buydown" : l);
  const keys: string[] = [];
  options.forEach((o) =>
    o.quote.fees.forEach((f) => {
      const k = feeKey(f.label);
      if (!keys.includes(k)) keys.push(k);
    })
  );
  for (const k of keys) {
    rows.push({
      label: k === "Rate buydown" ? "Rate buydown (discount points)" : k,
      values: options.map((o) => {
        const f = o.quote.fees.find((x) => feeKey(x.label) === k);
        if (!f) return "—";
        return f.display ?? (f.amount === null ? "At cost" : fmtUsd(f.amount));
      }),
    });
  }
  push("Total Estimated Fees", (o) => fmtUsd(o.quote.knownFees));

  push(`Interest Reserve (${options[0].quote.reserveLabel})`, (o) =>
    o.quote.interestReserve !== null ? fmtUsd(o.quote.interestReserve) : "—"
  );
  push("Estimated Cash to Close", (o) =>
    o.quote.cashToClose === null
      ? "—"
      : (o.quote.cashToBorrower ?? 0) > 0
      ? `(${fmtUsd(o.quote.cashToBorrower ?? 0)}) to borrower`
      : fmtUsd(o.quote.cashToClose)
  );
  return rows;
}

export default function TermSheet({
  form,
  quote,
  options,
  onClose,
}: {
  form: DealForm;
  quote: QuoteResult;
  options?: PricedOption[];
  onClose: () => void;
}) {
  const multi = !!options && options.length > 1;
  const isBridge = quote.product.family === "bridge";
  const isGU = form.product === "new_construction";
  const isRefi = isRefiPurpose(form.loanPurpose);
  // Broker term sheets default to the broker's own brand; retail defaults to Funded Capital.
  const { brand, setBrand, mode, setMode } = useBrokerBrand(form.channel === "tpo" ? "whitelabel" : "funded");
  const branded = mode === "funded"; // Funded Capital letterhead vs. broker white-label
  const residency = RESIDENCY_OPTIONS.find((r) => r.key === form.residency)?.label ?? "—";
  const experience = `${EXPERIENCE_BUCKETS[form.experienceBucket]} (Tier ${quote.tier})`;
  const purpose = LOAN_PURPOSE_OPTIONS.find((p) => p.key === form.loanPurpose)?.label ?? "—";
  const channel = CHANNEL_OPTIONS.find((c) => c.key === form.channel)?.label ?? "—";
  const [ref] = useState(() => `TS-${Math.floor(100000 + Math.random() * 899999)}`);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Accent classes swap between branded (navy/gold) and neutral (slate) white-label.
  const accentBox = branded ? "bg-navy-900 text-white" : "bg-slate-800 text-white";
  const accentText = branded ? "text-gold-400" : "text-slate-200";
  const sectionHead = branded ? "text-gold-600" : "text-slate-500";
  const titleColor = branded ? "text-navy-900" : "text-slate-900";

  const feeLeft = quote.fees.slice(0, Math.ceil(quote.fees.length / 2));
  const feeRight = quote.fees.slice(Math.ceil(quote.fees.length / 2));

  const content = (
    <div className="fixed inset-0 z-50 bg-slate-900/60 overflow-y-auto p-4 sm:p-8 flex justify-center no-print-bg ts-print-root">
      <div className="w-full max-w-3xl">
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
                <p className="text-xs text-slate-400 mt-2">Preliminary Term Sheet · Not a commitment to lend</p>
                <BrandContact mode={mode} brand={brand} />
              </div>
              <div className="text-right text-xs text-slate-500">
                <p className="font-semibold text-slate-700">{ref}</p>
                <p>Issued {TERM_SHEET_DATE}</p>
                <p>Lock: 30 days post-approval</p>
                {branded && <p>{channel} channel</p>}
              </div>
            </header>

            <h1 className={`text-xl font-bold mb-1 ${titleColor}`}>{quote.product.label} — Indicative Terms</h1>
            <p className="text-sm text-slate-500 mb-6">
              {form.borrowerName || "Borrower"} · {form.propertyAddress || "Subject property"}
            </p>

            {/* Headline — single option only */}
            {!multi && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
                <Headline label="Interest Rate" value={`${quote.ratePct?.toFixed(3)}%`} boxCls={accentBox} accentText={accentText} accent />
                <Headline label="Loan Amount" value={fmtUsd(quote.loanAmount)} />
                <Headline label={branded ? "Lender Origination" : "Origination"} value={`${quote.points.toFixed(2)}%`} />
                <Headline label={quote.interestOnly ? "Payment (IO)" : "Payment (P&I)"} value={quote.estMonthlyPayment ? fmtUsd(quote.estMonthlyPayment) : "—"} />
              </div>
            )}

            {/* Compare Pricing Options */}
            {multi && (
              <div className="mb-8">
                <h3 className={`text-xs font-semibold uppercase tracking-widest mb-2 ${sectionHead}`}>Compare Pricing Options</h3>
                <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
                  <thead>
                    <tr>
                      <th className="text-left font-medium text-slate-500 py-2 pr-3" style={{ width: "34%" }}></th>
                      {options!.map((o, i) => (
                        <th key={i} className={`text-center font-bold py-2 px-2 rounded-t ${i === 0 ? accentBox : "bg-slate-100 text-slate-800"}`}>
                          {o.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonRows(options!, isBridge, form.channel === "tpo").map((r, ri) =>
                      r.section ? (
                        <tr key={ri}>
                          <td
                            colSpan={options!.length + 1}
                            className={`pt-3 pb-1 text-xs font-semibold uppercase tracking-widest ${sectionHead}`}
                          >
                            {r.label}
                          </td>
                        </tr>
                      ) : (
                        <tr key={ri} className="border-b border-slate-100">
                          <td className="text-slate-500 py-1.5 pr-3">{r.label}</td>
                          {r.values.map((v, vi) => (
                            <td key={vi} className={`text-center py-1.5 px-2 font-medium ${vi === 0 ? "text-navy-900" : "text-slate-800"}`}>
                              {v}
                            </td>
                          ))}
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
                <p className="text-[11px] text-slate-400 mt-2">
                  All options reflect the same borrower, property, and program. Appraisal and title/settlement are quoted separately.
                </p>
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-x-10 gap-y-6">
              {!multi && (
              <TermBlock title="Loan Terms" headCls={sectionHead}>
                <Line k="Program" v={quote.product.label} />
                <Line k="Purpose" v={purpose} />
                <Line k="Term" v={quote.product.termLabel} />
                {isBridge && <Line k="Initial Loan Amount" v={fmtUsd(quote.initialLoan)} />}
                {isBridge && <Line k="Holdback" v={fmtUsd(quote.holdback)} />}
                {isBridge && quote.initialLtc !== null && <Line k="Initial LTC" v={`${(quote.initialLtc * 100).toFixed(1)}%`} />}
                <Line k={quote.primaryRatioLabel} v={quote.primaryRatio !== null ? `${(quote.primaryRatio * 100).toFixed(1)}%` : "—"} />
                {quote.arltv !== null && <Line k="ARLTV" v={`${(quote.arltv * 100).toFixed(1)}%`} />}
                {quote.dscr !== null && <Line k="DSCR" v={quote.dscr.toFixed(2)} />}
                <Line k="Max Loan (caps)" v={quote.maxLoan ? fmtUsd(quote.maxLoan) : "—"} />
                <Line k={`Interest Reserve (${quote.reserveLabel})`} v={quote.interestReserve !== null ? fmtUsd(quote.interestReserve) : "—"} />
                {quote.liquidityRequirement !== null && <Line k="Reserves (12 mo PITIA)" v={fmtUsd(quote.liquidityRequirement)} />}
              </TermBlock>
              )}

              {multi && (
                <TermBlock title="Loan Terms" headCls={sectionHead}>
                  <Line k="Program" v={quote.product.label} />
                  <Line k="Purpose" v={purpose} />
                  <Line k="Term" v={quote.product.termLabel} />
                  {quote.liquidityRequirement !== null && <Line k="Reserves (12 mo PITIA)" v={fmtUsd(quote.liquidityRequirement)} />}
                </TermBlock>
              )}

              <TermBlock title="Borrower" headCls={sectionHead}>
                <Line k="Name" v={form.borrowerName || "—"} />
                <Line k="Experience" v={experience} />
                <Line k="Credit Score" v={String(form.fico)} />
                <Line k="Residency" v={residency} />
                {form.licensedAgentOrGc && <Line k="Licensed Agent/GC" v="Yes" />}
              </TermBlock>

              <TermBlock title="Property" headCls={sectionHead}>
                <Line k="Address" v={form.propertyAddress || "—"} />
                <Line k="Type" v={form.propertyType} />
                <Line k="Units" v={String(form.units)} />
                {form.rural && <Line k="Market" v="Rural / stretch" />}
              </TermBlock>

              <TermBlock title="Project Economics" headCls={sectionHead}>
                <Line k="Purchase / As-Is" v={fmtUsd(form.purchasePrice)} />
                {isRefi && <Line k="Estimated Payoff" v={fmtUsd(form.estimatedPayoff)} />}
                {isRefi && isBridge && <Line k="Sunk Costs" v={fmtUsd(form.sunkCosts)} />}
                {isBridge ? (
                  <>
                    <Line
                      k={isRefi ? (isGU ? "Remaining Construction" : "Remaining Rehab") : isGU ? "Construction Budget" : "Rehab Budget"}
                      v={fmtUsd(isGU ? form.constructionBudget : form.rehabBudget)}
                    />
                    <Line k="Est. ARV" v={fmtUsd(form.arv)} />
                    {isGU && <Line k="Permits" v={form.permitsInHand ? "Approved" : "Not approved"} />}
                    {isGU && <Line k="Interest Reserve" v={form.financedInterestReserve ? "Financed (LTFC 90%)" : "Not financed (LTFC 85%)"} />}
                  </>
                ) : (
                  <>
                    <Line k="Market Value" v={fmtUsd(form.asIsValue)} />
                    <Line k="Monthly Rent" v={fmtUsd(form.monthlyRent)} />
                    <Line k="Annual Taxes" v={fmtUsd(form.annualTaxes)} />
                    <Line k="Annual Insurance" v={fmtUsd(form.annualInsurance)} />
                    {form.annualHoa > 0 && <Line k="Annual HOA" v={fmtUsd(form.annualHoa)} />}
                  </>
                )}
              </TermBlock>
            </div>

            {/* Fees — itemized for a single option; folded into the table when comparing */}
            <div className="mt-8" style={multi ? { display: "none" } : undefined}>
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
            {!multi && quote.cashToClose !== null && (
              <div className="mt-6 rounded-xl bg-slate-50 border border-slate-200 p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-700">
                    {(quote.cashToBorrower ?? 0) > 0 ? "Estimated Cash to Borrower" : "Estimated Cash to Close"}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {isRefi ? "Payoff" : "Purchase price"} − Initial Loan Amount + lender/broker fees + interest reserve.
                    Excludes appraisal and title.
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
              insurance, and final credit approval. Business-purpose loans only. Not available in all states; exclusions
              and state-specific requirements apply.
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
