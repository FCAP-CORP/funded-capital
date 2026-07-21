"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Calculator, AlertTriangle, CheckCircle2, FileText, XCircle, ArrowRight } from "lucide-react";
import {
  PRODUCTS,
  CHANNEL_OPTIONS,
  RESIDENCY_OPTIONS,
  PROPERTY_UNIT_OPTIONS,
  EXPERIENCE_BUCKETS,
  LOAN_PURPOSE_OPTIONS,
  DSCR_TERM_OPTIONS,
  PPP_OPTIONS,
  US_STATES,
  priceDeal,
  initialAdvanceCap,
  isRefiPurpose,
  fmtUsd,
  type ProductKey,
  type Channel,
  type LoanPurpose,
  type DscrTerm,
  type Ppp,
  type ResidencyKey,
  type QuoteInput,
} from "@/lib/pricing";
import TermSheet from "./TermSheet";
import { MoneyField as NumberField, PercentField as NumberPlainField } from "@/components/NumericFields";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { CashToCloseCard, RateBreakdown, RateLadder } from "@/components/QuoteExtras";

const products = Object.values(PRODUCTS);
const PROPERTY_TYPES = ["Single Family (1 unit)", "2–4 Units", "Condo", "Townhouse", "PUD"];

export interface DealForm {
  product: ProductKey;
  channel: Channel;
  borrowerName: string;
  experienceBucket: number;
  licensedAgentOrGc: boolean;
  fico: number;
  residency: string;
  propertyAddress: string;
  propertyState: string;
  propertyType: string;
  units: number;
  loanPurpose: LoanPurpose;
  rural: boolean;
  // bridge
  purchasePrice: number;
  rehabBudget: number; // held back (remaining on a refi)
  constructionBudget: number; // held back (remaining on a refi)
  sunkCosts: number;
  estimatedPayoff: number;
  arv: number;
  extendedTerm: boolean;
  permitsInHand: boolean;
  financedInterestReserve: boolean;
  initialAdvancePct: number;
  // dscr
  asIsValue: number;
  monthlyRent: number;
  annualTaxes: number;
  annualInsurance: number;
  annualHoa: number;
  dscrTerm: DscrTerm;
  ppp: Ppp;
  interestOnly: boolean;
  buydown: number;
  targetLtvPct: number;
  // broker
  brokerPointsPct: number;
  brokerProcessingFee: number;
}

const DEFAULTS: DealForm = {
  product: "dscr",
  channel: "tpo",
  borrowerName: "",
  experienceBucket: 2,
  licensedAgentOrGc: false,
  fico: 730,
  residency: "us_citizen",
  propertyAddress: "",
  propertyState: "",
  propertyType: PROPERTY_TYPES[0],
  units: 1,
  loanPurpose: "purchase",
  rural: false,
  purchasePrice: 400_000,
  rehabBudget: 75_000,
  constructionBudget: 300_000,
  sunkCosts: 0,
  estimatedPayoff: 0,
  arv: 550_000,
  extendedTerm: false,
  permitsInHand: true,
  financedInterestReserve: false,
  initialAdvancePct: 0.85,
  asIsValue: 400_000,
  monthlyRent: 3_200,
  annualTaxes: 4_800,
  annualInsurance: 1_800,
  annualHoa: 0,
  dscrTerm: "frm_30",
  ppp: "ppp_5yr",
  interestOnly: false,
  buydown: 0,
  targetLtvPct: 0.75,
  brokerPointsPct: 0,
  brokerProcessingFee: 0,
};

export default function PricingClient() {
  const [form, setForm] = useState<DealForm>(DEFAULTS);
  const [showTermSheet, setShowTermSheet] = useState(false);
  const [ust, setUst] = useState<{ fiveYearUST: number; percent: number; updatedAt: string } | null>(null);

  // Pull the live 5-yr Treasury (refreshed by a scheduled task at 8 AM / 1 PM ET).
  useEffect(() => {
    fetch("/api/treasury")
      .then((r) => r.json())
      .then((d) => {
        if (typeof d?.fiveYearUST === "number") setUst(d);
      })
      .catch(() => {});
  }, []);

  const meta = PRODUCTS[form.product];
  const isBridge = meta.family === "bridge";
  const isGU = form.product === "new_construction";
  const isStab = form.product === "stabilized_bridge";
  const isTpo = form.channel === "tpo";
  const isRefi = isRefiPurpose(form.loanPurpose);

  const set = <K extends keyof DealForm>(k: K, v: DealForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  // Initial LTC is measured against total cost basis (purchase + sunk costs).
  const build = isGU ? form.constructionBudget : form.rehabBudget; // held back
  const sunk = isRefi ? form.sunkCosts : 0;
  const costBasis = form.purchasePrice + sunk;
  const initSliderMaxPct = isGU ? (form.permitsInHand ? 75 : 60) : 90;
  const effInitialPct = Math.min(form.initialAdvancePct, initSliderMaxPct / 100);
  const initialLoan = Math.round(effInitialPct * costBasis);

  const dscrValue = form.loanPurpose === "purchase" ? Math.min(form.purchasePrice, form.asIsValue) : form.asIsValue;
  const ltvSliderMax = isStab ? 70 : 85; // Stabilized Bridge caps at 70% LTV
  const effTargetLtv = Math.min(form.targetLtvPct, ltvSliderMax / 100);
  const loanAmount = isBridge ? initialLoan + build : Math.round(effTargetLtv * dscrValue);

  const quote = useMemo(() => {
    const input: QuoteInput = {
      product: form.product,
      channel: form.channel,
      fico: form.fico,
      experienceBucket: form.experienceBucket,
      licensedAgentOrGc: form.licensedAgentOrGc,
      rural: form.rural,
      residency: form.residency as ResidencyKey,
      propertyState: form.propertyState,
      ustBasis: ust?.fiveYearUST,
      loanAmount,
      units: form.units,
      loanPurpose: form.loanPurpose,
      brokerPointsPct: form.brokerPointsPct,
      brokerProcessingFee: form.brokerProcessingFee,
      estimatedPayoff: isRefi ? form.estimatedPayoff : 0,
      ...(isBridge
        ? {
            purchasePrice: form.purchasePrice,
            rehabBudget: form.rehabBudget,
            constructionBudget: form.constructionBudget,
            sunkCosts: sunk,
            arv: form.arv,
            extendedTerm: form.extendedTerm,
            permitsInHand: form.permitsInHand,
            financedInterestReserve: form.financedInterestReserve,
            initialAdvancePct: effInitialPct,
          }
        : {
            purchasePrice: form.purchasePrice,
            asIsValue: form.asIsValue,
            monthlyRent: form.monthlyRent,
            annualTaxes: form.annualTaxes,
            annualInsurance: form.annualInsurance,
            annualHoa: form.annualHoa,
            dscrTerm: form.dscrTerm,
            ppp: form.ppp,
            interestOnly: isStab ? true : form.interestOnly,
            buydown: isStab ? 0 : form.buydown,
            extendedTerm: form.extendedTerm, // Stabilized Bridge: 18–24 mo extension
          }),
    };
    return priceDeal(input);
  }, [form, loanAmount, isBridge, isRefi, sunk, effInitialPct, ust]);

  const budgetLabel = isRefi
    ? isGU
      ? "Remaining construction budget"
      : "Remaining rehab budget"
    : isGU
    ? "Construction budget"
    : "Rehab budget";

  return (
    <div className="p-5 sm:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Calculator size={22} className="text-gold-600" /> Price a Deal
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Live pricing from the Funded Capital rate sheet. Generate a term sheet when it fits.
        </p>
        {ust && (
          <p className="text-xs text-slate-400 mt-1">
            5-yr US Treasury: <span className="font-semibold text-slate-600">{ust.percent.toFixed(3)}%</span> · updated{" "}
            {new Date(ust.updatedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
          </p>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-slate-200">
        <span className="px-4 py-2 text-sm font-semibold text-navy-900 border-b-2 border-gold-500">Single Property</span>
        <Link href="/broker-portal/price/portfolio" className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-900 border-b-2 border-transparent">
          Portfolio
        </Link>
      </div>

      {/* Program + channel */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
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
        {/* Inputs */}
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
              <RangeField label="Estimated credit score (mid)" value={form.fico} min={600} max={800} onChange={(v) => set("fico", v)} display={String(form.fico)} />
              <SelectField
                label="Residency status"
                value={form.residency}
                onChange={(v) => set("residency", v)}
                options={RESIDENCY_OPTIONS.map((r) => ({ value: r.key, label: r.label }))}
              />
            </div>
            <CheckRow label="Licensed RE agent or GC? (bumps tier)" checked={form.licensedAgentOrGc} onChange={(v) => set("licensedAgentOrGc", v)} />
          </Section>

          <Section title="Property Details">
            <AddressAutocomplete value={form.propertyAddress} onChange={(v) => set("propertyAddress", v)} />
            <div className="grid sm:grid-cols-3 gap-4">
              <SelectField
                label="State"
                value={form.propertyState}
                onChange={(v) => set("propertyState", v)}
                options={[{ value: "", label: "Select…" }, ...US_STATES.map((s) => ({ value: s, label: s }))]}
              />
              <SelectField label="Property type" value={form.propertyType} onChange={(v) => set("propertyType", v)} options={PROPERTY_TYPES.map((t) => ({ value: t, label: t }))} />
              <SelectField label="Units" value={String(form.units)} onChange={(v) => set("units", Number(v))} options={PROPERTY_UNIT_OPTIONS.map((u) => ({ value: u, label: `${u} unit${u === "1" ? "" : "s"}` }))} />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <SelectField
                label="Loan purpose"
                value={form.loanPurpose}
                onChange={(v) => set("loanPurpose", v as LoanPurpose)}
                options={LOAN_PURPOSE_OPTIONS.map((o) => ({ value: o.key, label: o.label }))}
              />
              <div className="flex items-end pb-1">
                <CheckRow label="Rural / stretch market" checked={form.rural} onChange={(v) => set("rural", v)} />
              </div>
            </div>
          </Section>

          <Section title="Project Details">
            {isBridge ? (
              <>
                <div className="grid sm:grid-cols-2 gap-4">
                  <NumberField label={isGU ? "Land / purchase price" : "Purchase price"} value={form.purchasePrice} onChange={(v) => set("purchasePrice", v)} />
                  <NumberField label={budgetLabel} value={isGU ? form.constructionBudget : form.rehabBudget} onChange={(v) => set(isGU ? "constructionBudget" : "rehabBudget", v)} />
                </div>

                {isRefi && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-4">
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Refinance Details</p>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <NumberField label="Estimated payoff" value={form.estimatedPayoff} onChange={(v) => set("estimatedPayoff", v)} />
                      <NumberField label="Sunk costs (soft + hard)" value={form.sunkCosts} onChange={(v) => set("sunkCosts", v)} />
                    </div>
                    <p className="text-xs text-slate-400">
                      Total cost basis = purchase + sunk costs = <strong className="text-slate-600">{fmtUsd(costBasis)}</strong>. Initial LTC is
                      measured against this.
                    </p>
                  </div>
                )}

                <NumberField label="After-Repair Value (ARV)" value={form.arv} onChange={(v) => set("arv", v)} />

                {isGU && (
                  <SelectField
                    label="Are permits approved?"
                    value={form.permitsInHand ? "yes" : "no"}
                    onChange={(v) => set("permitsInHand", v === "yes")}
                    options={[
                      { value: "yes", label: "Yes — approved (up to 75% Initial LTC)" },
                      { value: "no", label: "No — not approved (up to 60% Initial LTC)" },
                    ]}
                  />
                )}

                <RangeField
                  label="Initial LTC (% of total cost basis)"
                  value={Math.round(effInitialPct * 100)}
                  min={40}
                  max={initSliderMaxPct}
                  onChange={(v) => set("initialAdvancePct", v / 100)}
                  display={`${Math.round(effInitialPct * 100)}%`}
                />
                <p className="text-xs text-slate-400 -mt-2">
                  {isGU
                    ? `Capped at ${initSliderMaxPct}% — permits ${form.permitsInHand ? "approved" : "not approved"}.`
                    : `Max 90% · your Tier ${quote.tier}${form.fico >= 740 ? " (740+ FICO)" : " (<740 FICO)"} cap: ${Math.round(initialAdvanceCap("fix_and_flip", quote.tier, form.fico, true) * 100)}%.`}
                </p>

                <div className="rounded-xl bg-gold-500/10 border border-gold-400/40 px-4 py-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Initial Loan Amount</span>
                    <span className="font-semibold text-slate-900">{fmtUsd(initialLoan)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">+ Holdback</span>
                    <span className="font-semibold text-slate-900">{fmtUsd(build)}</span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-gold-400/40">
                    <span className="text-sm font-medium text-slate-700">Total Loan Amount</span>
                    <span className="text-lg font-bold text-navy-900">{fmtUsd(loanAmount)}</span>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <CheckRow label="Extended term (18–24 mo)" checked={form.extendedTerm} onChange={(v) => set("extendedTerm", v)} />
                  {isGU && (
                    <CheckRow label="Finance interest reserve? (LTFC 90%)" checked={form.financedInterestReserve} onChange={(v) => set("financedInterestReserve", v)} />
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="grid sm:grid-cols-2 gap-4">
                  <NumberField label="Purchase price" value={form.purchasePrice} onChange={(v) => set("purchasePrice", v)} />
                  <NumberField label="As-is / market value" value={form.asIsValue} onChange={(v) => set("asIsValue", v)} />
                </div>
                {isRefi && (
                  <NumberField label="Estimated payoff" value={form.estimatedPayoff} onChange={(v) => set("estimatedPayoff", v)} />
                )}
                <NumberField label="Monthly market rent" value={form.monthlyRent} onChange={(v) => set("monthlyRent", v)} />
                <div className="grid sm:grid-cols-2 gap-4">
                  <NumberField label="Annual taxes" value={form.annualTaxes} onChange={(v) => set("annualTaxes", v)} />
                  <NumberField label="Annual insurance" value={form.annualInsurance} onChange={(v) => set("annualInsurance", v)} />
                </div>
                <NumberField label="Annual HOA dues" value={form.annualHoa} onChange={(v) => set("annualHoa", v)} />
                {!isStab && (
                  <div className="grid sm:grid-cols-2 gap-4">
                    <SelectField label="Term / amortization" value={form.dscrTerm} onChange={(v) => set("dscrTerm", v as DscrTerm)} options={DSCR_TERM_OPTIONS.map((t) => ({ value: t.key, label: t.label }))} />
                    <SelectField label="Prepay penalty (PPP)" value={form.ppp} onChange={(v) => set("ppp", v as Ppp)} options={PPP_OPTIONS.map((p) => ({ value: p.key, label: p.label }))} />
                  </div>
                )}
                <RangeField
                  label={`Target LTV (%)${isStab ? " — max 70%" : ""}`}
                  value={Math.round(effTargetLtv * 100)}
                  min={40}
                  max={ltvSliderMax}
                  onChange={(v) => set("targetLtvPct", v / 100)}
                  display={`${Math.round(effTargetLtv * 100)}%`}
                />
                <div className="rounded-xl bg-gold-500/10 border border-gold-400/40 px-4 py-3 flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">Loan Amount</span>
                  <span className="text-lg font-bold text-navy-900">{fmtUsd(loanAmount)}</span>
                </div>
                {isStab ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
                    <p className="text-xs text-slate-500">
                      12-month <strong>interest-only</strong> bridge on a stabilized rental. DSCR is shown for reference —
                      there is no DSCR floor on this program.
                    </p>
                    <CheckRow label="Extend term to 18–24 months (+0.25%)" checked={form.extendedTerm} onChange={(v) => set("extendedTerm", v)} />
                  </div>
                ) : (
                  <CheckRow label="Interest-only" checked={form.interestOnly} onChange={(v) => set("interestOnly", v)} />
                )}
              </>
            )}
          </Section>

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
                    <p className="text-xs uppercase tracking-widest text-gold-400 font-semibold">Indicative Quote</p>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/10 text-slate-200">Tier {quote.tier}</span>
                  </div>
                  <Metric label="Interest Rate" value={`${quote.ratePct?.toFixed(3)}%`} big />
                  <div className="grid grid-cols-2 gap-4 mt-5">
                    <Metric label="Total Loan Amount" value={fmtUsd(quote.loanAmount)} />
                    {isBridge && <Metric label="Initial Loan Amount" value={fmtUsd(quote.initialLoan)} />}
                    {isBridge && <Metric label="Holdback" value={fmtUsd(quote.holdback)} />}
                    <Metric label={quote.interestOnly ? "Monthly (IO)" : "Monthly (P&I)"} value={quote.estMonthlyPayment ? fmtUsd(quote.estMonthlyPayment) : "—"} />
                    <Metric label="Lender Origination" value={`${quote.points.toFixed(2)}%`} />
                    {isTpo && <Metric label="Broker Points" value={`${quote.brokerPointsPct.toFixed(2)}%`} />}
                    {isBridge && quote.initialLtc !== null && <Metric label="Initial LTC" value={`${(quote.initialLtc * 100).toFixed(1)}%`} />}
                    <Metric label={quote.primaryRatioLabel} value={quote.primaryRatio !== null ? `${(quote.primaryRatio * 100).toFixed(1)}%` : "—"} />
                    {quote.arltv !== null && <Metric label="ARLTV" value={`${(quote.arltv * 100).toFixed(1)}%`} />}
                    {quote.dscr !== null && <Metric label="DSCR" value={quote.dscr.toFixed(2)} />}
                    {quote.interestReserve !== null && (
                      <Metric label={`Reserve (${quote.reserveLabel})`} value={fmtUsd(quote.interestReserve)} />
                    )}
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
                    {quote.blockers.length === 1 ? "One item" : `${quote.blockers.length} items`} keep this scenario outside
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

            {/* Warnings */}
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
                basisAmount={isRefi ? form.estimatedPayoff : isBridge ? form.purchasePrice : dscrValue}
                loanApplied={quote.initialLoan}
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

      {showTermSheet && quote.ok && <TermSheet form={form} quote={quote} onClose={() => setShowTermSheet(false)} />}
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

function RangeField({ label, value, min, max, onChange, display }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void; display: string }) {
  return (
    <div>
      <label className={labelCls}>
        {label} <span className="text-gold-600 font-semibold">({display})</span>
      </label>
      <input type="range" min={min} max={max} step={1} value={value} onChange={(e) => onChange(+e.target.value)} className="w-full accent-gold-600 mt-2" />
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
