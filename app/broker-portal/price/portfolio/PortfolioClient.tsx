"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Layers, Plus, Trash2, AlertTriangle, CheckCircle2, FileText, RotateCcw, XCircle, ArrowRight } from "lucide-react";
import {
  PRODUCTS,
  CHANNEL_OPTIONS,
  RESIDENCY_OPTIONS,
  EXPERIENCE_BUCKETS,
  LOAN_PURPOSE_OPTIONS,
  DSCR_TERM_OPTIONS,
  PPP_OPTIONS,
  MAX_PORTFOLIO_PROPERTIES,
  pricePortfolio,
  isRefiPurpose,
  fmtUsd,
  type ProductKey,
  type Channel,
  type LoanPurpose,
  type DscrTerm,
  type Ppp,
  type PortfolioProperty,
  type PortfolioInput,
} from "@/lib/pricing";
import PortfolioTermSheet from "./PortfolioTermSheet";
import { MoneyField as NumberField, PercentField as NumberPlainField, MoneyField, PctInput } from "@/components/NumericFields";
import { gradationStep } from "../PricingClient";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { CashToCloseCard, RateBreakdown, RateLadder } from "@/components/QuoteExtras";

// Stabilized Bridge is single-property only for now.
const products = Object.values(PRODUCTS).filter((p) => p.key !== "stabilized_bridge");

export interface PortfolioForm {
  product: ProductKey;
  channel: Channel;
  borrowerName: string;
  experienceBucket: number;
  licensedAgentOrGc: boolean;
  fico: number;
  residency: string;
  rural: boolean;
  multiUnit: boolean;
  loanPurpose: LoanPurpose;
  // bridge
  extendedTerm: boolean;
  permitsApproved: boolean;
  financedInterestReserve: boolean;
  defaultInitialLtcPct: number;
  holdbackPct: number;
  // dscr
  dscrTerm: DscrTerm;
  ppp: Ppp;
  interestOnly: boolean;
  buydown: number;
  defaultTargetLtvPct: number;
  // broker
  brokerPointsPct: number;
  brokerProcessingFee: number;
  properties: PortfolioProperty[];
}

const blankProp = (id: string): PortfolioProperty => ({
  id,
  address: "",
  asIsValue: 0,
  budget: 0,
  sunkCosts: 0,
  estimatedPayoff: 0,
  arv: 0,
  monthlyRent: 0,
  annualTaxes: 0,
  annualInsurance: 0,
  annualHoa: 0,
  loanOverride: null,
});

const DEFAULTS: PortfolioForm = {
  product: "fix_and_flip",
  channel: "tpo",
  borrowerName: "",
  experienceBucket: 2,
  licensedAgentOrGc: false,
  fico: 700,
  residency: "us_citizen",
  rural: false,
  multiUnit: false,
  loanPurpose: "purchase",
  extendedTerm: false,
  permitsApproved: true,
  financedInterestReserve: false,
  defaultInitialLtcPct: 0.7,
  holdbackPct: 1,
  dscrTerm: "frm_30",
  ppp: "ppp_5yr",
  interestOnly: false,
  buydown: 0,
  defaultTargetLtvPct: 0.75,
  brokerPointsPct: 0,
  brokerProcessingFee: 0,
  properties: [blankProp("p1")],
};

export default function PortfolioClient() {
  const [form, setForm] = useState<PortfolioForm>(DEFAULTS);
  const [showTermSheet, setShowTermSheet] = useState(false);
  const [ust, setUst] = useState<number | undefined>(undefined);

  useEffect(() => {
    fetch("/api/treasury")
      .then((r) => r.json())
      .then((d) => {
        if (typeof d?.fiveYearUST === "number") setUst(d.fiveYearUST);
      })
      .catch(() => {});
  }, []);

  const meta = PRODUCTS[form.product];
  const isBridge = meta.family === "bridge";
  const isGU = form.product === "new_construction";
  const isDscr = meta.family === "dscr";
  const isTpo = form.channel === "tpo";
  const isRefi = isRefiPurpose(form.loanPurpose);

  const set = <K extends keyof PortfolioForm>(k: K, v: PortfolioForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const updateProp = (id: string, patch: Partial<PortfolioProperty>) =>
    setForm((f) => ({ ...f, properties: f.properties.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  const addProp = () =>
    setForm((f) => (f.properties.length >= MAX_PORTFOLIO_PROPERTIES ? f : { ...f, properties: [...f.properties, blankProp(`p${Date.now()}`)] }));
  const removeProp = (id: string) => setForm((f) => ({ ...f, properties: f.properties.filter((p) => p.id !== id) }));

  const initSliderMaxPct = isGU ? (form.permitsApproved ? 75 : 60) : 90;
  const effInitialPct = Math.min(form.defaultInitialLtcPct, initSliderMaxPct / 100);

  const quote = useMemo(() => {
    const input: PortfolioInput = {
      product: form.product,
      channel: form.channel,
      fico: form.fico,
      experienceBucket: form.experienceBucket,
      licensedAgentOrGc: form.licensedAgentOrGc,
      rural: form.rural,
      residency: form.residency as import("@/lib/pricing").ResidencyKey,
      multiUnit: form.multiUnit,
      loanPurpose: form.loanPurpose,
      extendedTerm: form.extendedTerm,
      permitsApproved: form.permitsApproved,
      financedInterestReserve: form.financedInterestReserve,
      defaultInitialLtcPct: effInitialPct,
      holdbackPct: form.holdbackPct,
      dscrTerm: form.dscrTerm,
      ppp: form.ppp,
      interestOnly: form.interestOnly,
      buydown: form.buydown,
      defaultTargetLtvPct: form.defaultTargetLtvPct,
      ustBasis: ust,
      properties: form.properties,
      brokerPointsPct: form.brokerPointsPct,
      brokerProcessingFee: form.brokerProcessingFee,
    };
    return pricePortfolio(input);
  }, [form, effInitialPct, ust]);

  const budgetLabel = isRefi
    ? isGU
      ? "Remaining construction"
      : "Remaining rehab"
    : isGU
    ? "Construction budget"
    : "Rehab budget";

  return (
    <div className="p-5 sm:p-8 max-w-6xl mx-auto">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Layers size={22} className="text-gold-600" /> Portfolio Pricing
        </h1>
        <p className="text-slate-500 text-sm mt-1">Up to {MAX_PORTFOLIO_PROPERTIES} properties on a single loan.</p>
      </div>

      <div className="flex gap-1 mb-6 border-b border-slate-200">
        <Link href="/broker-portal/price" className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-900 border-b-2 border-transparent">
          Single Property
        </Link>
        <span className="px-4 py-2 text-sm font-semibold text-navy-900 border-b-2 border-gold-500">Portfolio</span>
      </div>

      {/* Program */}
      <div className="grid sm:grid-cols-3 gap-2 mb-3">
        {products.map((p) => (
          <button
            key={p.key}
            onClick={() => set("product", p.key)}
            className={`text-left px-4 py-3 rounded-xl border text-sm font-medium transition ${
              form.product === p.key
                ? "border-gold-500 bg-gold-500/10 text-navy-900"
                : "border-slate-200 text-slate-600 hover:border-slate-300 bg-white"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 mb-6">
        <span className="text-xs text-slate-500">Channel:</span>
        {CHANNEL_OPTIONS.map((c) => (
          <button
            key={c.key}
            onClick={() => set("channel", c.key)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${
              form.channel === c.key ? "border-navy-900 bg-navy-900 text-white" : "border-slate-300 text-slate-600 hover:border-slate-400"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-6">
          <Section title="Borrower Details">
            <TextField label="Borrower name" value={form.borrowerName} onChange={(v) => set("borrowerName", v)} />
            <SelectField
              label={`Experience — ${meta.experienceUnit}`}
              value={String(form.experienceBucket)}
              onChange={(v) => set("experienceBucket", Number(v))}
              options={EXPERIENCE_BUCKETS.map((b, i) => ({ value: String(i), label: `${b} (Tier ${i + 1})` }))}
            />
            <div className="grid sm:grid-cols-2 gap-4">
              <RangeField label="Estimated credit score (mid)" value={form.fico} min={600} max={800} onChange={(v) => set("fico", v)} display={String(form.fico)} unit="" step={5} />
              <SelectField
                label="Residency status"
                value={form.residency}
                onChange={(v) => set("residency", v)}
                options={RESIDENCY_OPTIONS.map((r) => ({ value: r.key, label: r.label }))}
              />
            </div>
            <CheckRow label="Licensed RE agent or GC? (bumps tier)" checked={form.licensedAgentOrGc} onChange={(v) => set("licensedAgentOrGc", v)} />
          </Section>

          <Section title="Loan Structure">
            <SelectField
              label="Loan purpose"
              value={form.loanPurpose}
              onChange={(v) => set("loanPurpose", v as LoanPurpose)}
              options={LOAN_PURPOSE_OPTIONS.map((o) => ({ value: o.key, label: o.label }))}
            />
            {isRefi && (
              <p className="text-xs text-slate-400 -mt-2">
                Refi selected — enter Estimated Payoff{isBridge ? " and Sunk Costs" : ""} on each property below.
                {isBridge && " Initial LTC is measured against purchase + sunk costs."}
              </p>
            )}

            {isBridge ? (
              <>
                {isGU && (
                  <SelectField
                    label="Are permits approved?"
                    value={form.permitsApproved ? "yes" : "no"}
                    onChange={(v) => set("permitsApproved", v === "yes")}
                    options={[
                      { value: "yes", label: "Yes — approved (up to 75% Initial LTC)" },
                      { value: "no", label: "No — not approved (up to 60% Initial LTC)" },
                    ]}
                  />
                )}
                <RangeField
                  label={`${isGU ? "Construction" : "Rehab"} holdback financed (%)`}
                  value={Math.round(form.holdbackPct * 100)}
                  min={0}
                  max={100}
                  onChange={(v) => set("holdbackPct", v / 100)}
                  display={`${Math.round(form.holdbackPct * 100)}%`}
                />
                <p className="text-xs text-slate-400 -mt-2">
                  Share of each property&rsquo;s budget we hold back and fund by draw. Applies to every
                  property in the portfolio.
                  {form.holdbackPct < 1 && " The borrower funds the remainder."}
                  {isGU && " LTFC is still measured against the full project cost."}
                </p>
                <RangeField
                  label="Default Initial LTC (% of total cost basis)"
                  value={Math.round(effInitialPct * 100)}
                  min={0}
                  max={initSliderMaxPct}
                  onChange={(v) => set("defaultInitialLtcPct", v / 100)}
                  display={`${Math.round(effInitialPct * 100)}%`}
                />
                <p className="text-xs text-slate-400 -mt-2">
                  Applies to any property without an Initial Loan Amount override. Caps: {(quote.initialCapPct * 100).toFixed(0)}% Initial LTC ·{" "}
                  {(quote.arltvCapPct * 100).toFixed(0)}% ARLTV{isGU ? ` · ${(quote.ltfcCapPct * 100).toFixed(0)}% LTFC` : " · no LTFC limit"} — per property and blended.
                  {isGU && " On Ground-Up the LTFC cap usually binds before the permit cap."}
                </p>
                {isGU && (
                  <CheckRow label="Finance interest reserve? (adds up to 5% of cost, reserve only)" checked={form.financedInterestReserve} onChange={(v) => set("financedInterestReserve", v)} />
                )}
              </>
            ) : (
              <>
                <div className="grid sm:grid-cols-2 gap-4">
                  <SelectField label="Term / amortization" value={form.dscrTerm} onChange={(v) => set("dscrTerm", v as DscrTerm)} options={DSCR_TERM_OPTIONS.map((t) => ({ value: t.key, label: t.label }))} />
                  <SelectField label="Prepay penalty (PPP)" value={form.ppp} onChange={(v) => set("ppp", v as Ppp)} options={PPP_OPTIONS.map((p) => ({ value: p.key, label: p.label }))} />
                </div>
                <RangeField
                  label="Default target LTV (%)"
                  value={Math.round(form.defaultTargetLtvPct * 100)}
                  min={10}
                  max={85}
                  onChange={(v) => set("defaultTargetLtvPct", v / 100)}
                  display={`${Math.round(form.defaultTargetLtvPct * 100)}%`}
                />
                <p className="text-xs text-slate-400 -mt-2">
                  Max LTV {(quote.ltvCapPct * 100).toFixed(1)}% · DSCR floor 1.05 — per property and blended.
                </p>
                <CheckRow label="Interest-only" checked={form.interestOnly} onChange={(v) => set("interestOnly", v)} />
              </>
            )}

            <div className="grid sm:grid-cols-3 gap-3 pt-1">
              <CheckRow label="Rural / stretch" checked={form.rural} onChange={(v) => set("rural", v)} />
              <CheckRow label="Any 2–4 unit" checked={form.multiUnit} onChange={(v) => set("multiUnit", v)} />
              {isBridge && <CheckRow label="18–24 mo term" checked={form.extendedTerm} onChange={(v) => set("extendedTerm", v)} />}
            </div>
          </Section>

          {/* Properties */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-900">
                Properties <span className="text-slate-400 font-normal">({form.properties.length}/{MAX_PORTFOLIO_PROPERTIES})</span>
              </h2>
              <button
                onClick={addProp}
                disabled={form.properties.length >= MAX_PORTFOLIO_PROPERTIES}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-navy-900 border border-slate-300 rounded-lg px-3 py-1.5 hover:border-gold-500 hover:bg-gold-500/10 transition disabled:opacity-40"
              >
                <Plus size={14} /> Add property
              </button>
            </div>

            <div className="space-y-4">
              {quote.properties.map((r, i) => {
                const p = r.property;
                return (
                  <div key={p.id} className={`rounded-xl border p-4 ${r.ok ? "border-slate-200 bg-slate-50/60" : "border-amber-300 bg-amber-50"}`}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-slate-400">Property {i + 1}</span>
                      <button onClick={() => removeProp(p.id)} className="text-slate-400 hover:text-red-600" aria-label="Remove property">
                        <Trash2 size={15} />
                      </button>
                    </div>

                    <AddressAutocomplete label="Address" value={p.address} onChange={(v) => updateProp(p.id, { address: v })} />

                    {isBridge ? (
                      <>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
                          <NumberField label={isGU ? "Land / purchase" : "Purchase / as-is"} value={p.asIsValue} onChange={(v) => updateProp(p.id, { asIsValue: v })} />
                          <NumberField label={budgetLabel} value={p.budget} onChange={(v) => updateProp(p.id, { budget: v })} />
                          <NumberField label="ARV" value={p.arv} onChange={(v) => updateProp(p.id, { arv: v })} />
                        </div>

                        {isRefi && (
                          <div className="grid grid-cols-2 gap-3 mt-3">
                            <NumberField label="Estimated payoff" value={p.estimatedPayoff} onChange={(v) => updateProp(p.id, { estimatedPayoff: v })} />
                            <NumberField label="Sunk costs (soft + hard)" value={p.sunkCosts} onChange={(v) => updateProp(p.id, { sunkCosts: v })} />
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-3 mt-3">
                          <OverrideField
                            label="Initial Loan Amount"
                            value={r.initialLoan}
                            overridden={p.loanOverride !== null}
                            resetLabel={`Use ${Math.round(effInitialPct * 100)}%`}
                            onChange={(v) => updateProp(p.id, { loanOverride: v })}
                            onReset={() => updateProp(p.id, { loanOverride: null })}
                          />
                          <ReadOnlyField label="Holdback" value={fmtUsd(r.holdback)} />
                        </div>

                        <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 pt-3 border-t border-slate-200 text-xs">
                          <Stat k="Total Loan Amount" v={fmtUsd(r.totalLoan)} strong />
                          <Stat k="Initial LTC" v={`${(r.initialLtc * 100).toFixed(1)}%`} />
                          <Stat k="ARLTV" v={`${(r.arltv * 100).toFixed(1)}%`} />
                          {isGU && <Stat k="LTFC" v={`${(r.ltfc * 100).toFixed(1)}%`} />}
                          <Stat k="Max Initial" v={fmtUsd(r.maxInitialLoan)} />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
                          <NumberField label="Purchase / as-is" value={p.asIsValue} onChange={(v) => updateProp(p.id, { asIsValue: v })} />
                          <NumberField label="Monthly rent" value={p.monthlyRent} onChange={(v) => updateProp(p.id, { monthlyRent: v })} />
                          <NumberField label="Annual taxes" value={p.annualTaxes} onChange={(v) => updateProp(p.id, { annualTaxes: v })} />
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
                          <NumberField label="Annual insurance" value={p.annualInsurance} onChange={(v) => updateProp(p.id, { annualInsurance: v })} />
                          <NumberField label="Annual HOA" value={p.annualHoa} onChange={(v) => updateProp(p.id, { annualHoa: v })} />
                          {isRefi ? (
                            <NumberField label="Estimated payoff" value={p.estimatedPayoff} onChange={(v) => updateProp(p.id, { estimatedPayoff: v })} />
                          ) : (
                            <OverrideField
                              label="Loan Amount"
                              value={r.totalLoan}
                              overridden={p.loanOverride !== null}
                              resetLabel={`Use ${Math.round(form.defaultTargetLtvPct * 100)}%`}
                              onChange={(v) => updateProp(p.id, { loanOverride: v })}
                              onReset={() => updateProp(p.id, { loanOverride: null })}
                            />
                          )}
                        </div>
                        {isRefi && (
                          <div className="grid grid-cols-2 gap-3 mt-3">
                            <OverrideField
                              label="Loan Amount"
                              value={r.totalLoan}
                              overridden={p.loanOverride !== null}
                              resetLabel={`Use ${Math.round(form.defaultTargetLtvPct * 100)}%`}
                              onChange={(v) => updateProp(p.id, { loanOverride: v })}
                              onReset={() => updateProp(p.id, { loanOverride: null })}
                            />
                          </div>
                        )}
                        <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 pt-3 border-t border-slate-200 text-xs">
                          <Stat k="LTV" v={`${(r.ltv * 100).toFixed(1)}%`} strong />
                          <Stat k="DSCR" v={r.dscr.toFixed(2)} />
                          <Stat k="PITIA" v={fmtUsd(r.monthlyPitia)} />
                          <Stat k="Max Loan" v={fmtUsd(r.maxTotalLoan)} />
                        </div>
                      </>
                    )}

                    {r.issues.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {r.issues.map((iss, k) => (
                          <li key={k} className="flex gap-1.5 text-xs text-amber-800">
                            <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                            {iss}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {isTpo && (
            <Section title="Broker Compensation (added to borrower cost)">
              <div className="grid sm:grid-cols-2 gap-4">
                <NumberPlainField label="Broker points (%)" value={form.brokerPointsPct} step={0.125} onChange={(v) => set("brokerPointsPct", v)} suffix="%" />
                <NumberField label="Broker processing fee" value={form.brokerProcessingFee} onChange={(v) => set("brokerProcessingFee", v)} />
              </div>
              <p className="text-xs text-slate-400">Combined lender + broker points must stay ≤ 5.00%.</p>
            </Section>
          )}
        </div>

        {/* Quote panel */}
        <div className="lg:col-span-2">
          <div className="lg:sticky lg:top-6 space-y-4">
            <div className={`rounded-2xl border shadow-card p-6 ${quote.ok ? "bg-navy-900 border-navy-800 text-white" : "bg-amber-50 border-amber-200"}`}>
              {quote.ok ? (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-xs uppercase tracking-widest text-gold-400 font-semibold">Portfolio Quote</p>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/10 text-slate-200">
                      Tier {quote.tier} · {quote.count} props
                    </span>
                  </div>
                  <Metric label="Interest Rate" value={`${quote.ratePct?.toFixed(3)}%`} big />
                  <div className="grid grid-cols-2 gap-4 mt-5">
                    <Metric label="Total Loan Amount" value={fmtUsd(quote.totals.loan)} />
                    {isBridge && <Metric label="Initial Loan Amount" value={fmtUsd(quote.totals.initialLoan)} />}
                    {isBridge && <Metric label="Holdback" value={fmtUsd(quote.totals.holdback)} />}
                    <Metric label="Lender Origination" value={`${quote.points.toFixed(2)}%`} />
                    {isTpo && <Metric label="Broker Points" value={`${quote.brokerPointsPct.toFixed(2)}%`} />}
                    {isBridge && <Metric label="Blended Initial LTC" value={`${(quote.blendedInitialLtc * 100).toFixed(1)}%`} />}
                    {isBridge && <Metric label="Blended ARLTV" value={`${(quote.blendedArltv * 100).toFixed(1)}%`} />}
                    {isGU && <Metric label="Blended LTFC" value={`${(quote.blendedLtfc * 100).toFixed(1)}%`} />}
                    {isDscr && <Metric label="Blended LTV" value={`${(quote.blendedLtv * 100).toFixed(1)}%`} />}
                    {isDscr && <Metric label="Blended DSCR" value={quote.blendedDscr.toFixed(2)} />}
                    <Metric
                      label={isDscr ? (quote.interestOnly ? "Monthly (IO)" : "Monthly (P&I)") : "Monthly (IO, fully drawn)"}
                      value={quote.estMonthlyFullyDrawn ? fmtUsd(quote.estMonthlyFullyDrawn) : "—"}
                    />
                    {isBridge && quote.estMonthlyInitial !== null && <Metric label="Monthly (IO, initial)" value={fmtUsd(quote.estMonthlyInitial)} />}
                    {quote.interestReserve !== null && <Metric label={`Reserve (${quote.reserveLabel})`} value={fmtUsd(quote.interestReserve)} />}
                  </div>
                  <button onClick={() => setShowTermSheet(true)} className="btn-primary w-full mt-6 text-sm">
                    <FileText size={16} /> Generate Term Sheet
                  </button>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-amber-800 font-semibold mb-1">
                    <AlertTriangle size={18} /> Not eligible as priced
                  </div>
                  <p className="text-sm text-amber-800/90 mb-4">
                    {quote.blockers.length === 1 ? "One item" : `${quote.blockers.length} items`} keep this portfolio outside
                    guidelines. Here&apos;s what to change:
                  </p>
                  <ul className="space-y-3">
                    {quote.blockers.map((b, i) => (
                      <li key={i} className="rounded-xl bg-white/70 border border-amber-200 p-3">
                        <div className="flex gap-2">
                          <XCircle size={15} className="text-red-500 shrink-0 mt-0.5" />
                          <p className="text-sm font-medium text-slate-800">{b.reason}</p>
                        </div>
                        <div className="flex gap-2 mt-1.5 pl-[23px]">
                          <ArrowRight size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                          <p className="text-sm text-emerald-800">{b.fix}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            {quote.warnings.length > 0 && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <ul className="space-y-1.5">
                  {quote.warnings.map((w, i) => (
                    <li key={i} className="flex gap-2 text-xs text-amber-800">
                      <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {quote.ok && quote.rateLadder && quote.rateLadder.length > 0 && (
              <RateLadder
                rows={quote.rateLadder}
                monthlyLabel={quote.interestOnly ? "Monthly (IO)" : "Monthly (P&I)"}
                onSelect={(fee) => set("buydown", fee)}
              />
            )}

            {quote.ok && quote.cashToClose !== null && (
              <CashToCloseCard
                isRefi={isRefi}
                basisAmount={isRefi ? quote.totals.payoff : quote.totals.asIs}
                loanApplied={quote.totals.initialLoan}
                knownFees={quote.knownFees}
                reserve={quote.interestReserve ?? 0}
                reserveLabel={quote.reserveLabel}
                cashToClose={quote.cashToClose}
                cashToBorrower={quote.cashToBorrower ?? 0}
              />
            )}

            {quote.ok && quote.ratePct !== null && <RateBreakdown items={quote.rateBreakdown} finalRatePct={quote.ratePct} />}

            {quote.ok && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">Estimated Fees</p>
                <ul className="text-sm divide-y divide-slate-100">
                  {quote.fees.map((f) => (
                    <li key={f.label} className="flex justify-between gap-3 py-1.5">
                      <span className="text-slate-500">{f.label}</span>
                      <span className="font-medium text-slate-900 text-right">{f.display ?? (f.amount === null ? "At cost" : fmtUsd(f.amount))}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <ul className="space-y-2">
              {quote.messages.map((m, i) => (
                <li key={i} className="flex gap-2 text-xs text-slate-500">
                  <CheckCircle2 size={14} className="text-slate-300 shrink-0 mt-0.5" />
                  {m}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {showTermSheet && quote.ok && <PortfolioTermSheet form={form} quote={quote} onClose={() => setShowTermSheet(false)} />}
    </div>
  );
}

/* ---------- field components ---------- */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-5 sm:p-6">
      <h2 className="font-semibold text-slate-900 mb-4">{title}</h2>
      <div className="space-y-4">{children}</div>
    </div>
  );
}
const labelCls = "block text-sm font-medium text-slate-700 mb-1.5";
const inputBase =
  "w-full rounded-xl border border-slate-300 py-2.5 px-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-gold-500 transition";

function Stat({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <span className="text-slate-500">
      {k}: <span className={strong ? "font-bold text-navy-900" : "font-semibold text-slate-800"}>{v}</span>
    </span>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <div className="rounded-xl border border-slate-200 bg-slate-100 py-2.5 px-3 text-slate-600">{value}</div>
    </div>
  );
}

function OverrideField({
  label,
  value,
  overridden,
  resetLabel,
  onChange,
  onReset,
}: {
  label: string;
  value: number;
  overridden: boolean;
  resetLabel: string;
  onChange: (n: number) => void;
  onReset: () => void;
}) {
  return (
    <MoneyField
      label={label}
      value={value}
      onChange={onChange}
      labelRight={
        overridden ? (
          <button onClick={onReset} className="inline-flex items-center gap-1 text-[11px] text-gold-600 font-semibold hover:underline">
            <RotateCcw size={11} /> {resetLabel}
          </button>
        ) : null
      }
    />
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} className={inputBase} />
    </div>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={`${inputBase} bg-white`}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Adaptive tick density + exact-entry box (see PricingClient for rationale). */
function RangeField({
  label,
  value,
  min,
  max,
  onChange,
  display,
  unit = "%",
  step = 5,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  display: string;
  unit?: string;
  step?: number;
}) {
  const major = gradationStep(min, max);
  const minor = Math.max(1, major / 2);
  const ticks: number[] = [];
  for (let v = Math.ceil(min / minor) * minor; v <= max; v += minor) ticks.push(v);
  const pos = (v: number) => (max > min ? ((v - min) / (max - min)) * 100 : 0);

  return (
    <div>
      <label className={labelCls}>
        {label} <span className="text-gold-600 font-semibold">({display})</span>
      </label>
      <div className="flex items-center gap-3 mt-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Math.max(min, Math.min(max, +e.target.value)))}
          className="flex-1 accent-gold-600"
        />
        <PctInput
          value={value}
          min={min}
          max={max}
          onCommit={onChange}
          unit={unit}
          className={`w-[4.5rem] rounded-lg border border-slate-300 py-1.5 pl-2 ${unit ? "pr-5" : "pr-2"} text-sm text-right text-slate-900 focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-gold-500`}
        />
      </div>
      <div className="relative h-5 mr-[5.5rem]">
        {ticks.map((v) => (
          <span key={v} className={`absolute top-0 w-px ${v % major === 0 ? "h-2 bg-slate-300" : "h-1 bg-slate-200"}`} style={{ left: `${pos(v)}%` }} />
        ))}
        {ticks
          .filter((v) => v % major === 0)
          .map((v) => (
            <span key={`l${v}`} className="absolute top-2 text-[10px] text-slate-400 -translate-x-1/2" style={{ left: `${pos(v)}%` }}>
              {v}
            </span>
          ))}
      </div>
    </div>
  );
}

function CheckRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer select-none">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded border-slate-300 accent-gold-600" />
      <span className="text-sm text-slate-700">{label}</span>
    </label>
  );
}

function Metric({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`font-bold ${big ? "text-4xl text-gold-400" : "text-lg"}`}>{value}</p>
    </div>
  );
}
