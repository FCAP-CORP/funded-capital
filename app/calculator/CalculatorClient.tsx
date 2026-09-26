'use client';

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Calculator } from "lucide-react";

// ─── Fix & Flip Calculator ────────────────────────────────────────────────────

function FixFlipCalculator() {
  const [purchasePrice, setPurchasePrice] = useState("");
  const [rehabBudget, setRehabBudget] = useState("");
  const [arv, setArv] = useState("");
  const [interestRate, setInterestRate] = useState("8.75");
  const [loanTermMonths, setLoanTermMonths] = useState("12");
  const [result, setResult] = useState<null | {
    loanAmount: number;
    monthlyInterest: number;
    totalInterest: number;
    closingCosts: number;
    estimatedProfit: number;
    roi: number;
  }>(null);

  function calculate() {
    const purchase = parseFloat(purchasePrice) || 0;
    const rehab = parseFloat(rehabBudget) || 0;
    const arvVal = parseFloat(arv) || 0;
    const rate = parseFloat(interestRate) / 100;
    const term = parseInt(loanTermMonths) || 12;

    const loanAmount = (purchase + rehab) * 0.9;
    const monthlyInterest = loanAmount * (rate / 12);
    const totalInterest = monthlyInterest * term;
    const closingCosts = arvVal * 0.03;
    const estimatedProfit = arvVal - purchase - rehab - totalInterest - closingCosts;
    const totalInvested = purchase + rehab + totalInterest + closingCosts;
    const roi = totalInvested > 0 ? (estimatedProfit / totalInvested) * 100 : 0;

    setResult({ loanAmount, monthlyInterest, totalInterest, closingCosts, estimatedProfit, roi });
  }

  const fmt = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12">
      {/* Inputs */}
      <div className="flex flex-col gap-5">
        <div>
          <label htmlFor="calc-ff-1" className="form-label">Purchase Price</label>
          <input
            id="calc-ff-1"
            type="number"
            placeholder="e.g. 250000"
            className="form-input"
            value={purchasePrice}
            onChange={(e) => setPurchasePrice(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="calc-ff-2" className="form-label">Rehab Budget</label>
          <input
            id="calc-ff-2"
            type="number"
            placeholder="e.g. 50000"
            className="form-input"
            value={rehabBudget}
            onChange={(e) => setRehabBudget(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="calc-ff-3" className="form-label">After Repair Value (ARV)</label>
          <input
            id="calc-ff-3"
            type="number"
            placeholder="e.g. 400000"
            className="form-input"
            value={arv}
            onChange={(e) => setArv(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="calc-ff-4" className="form-label">Interest Rate (%)</label>
            <input
              id="calc-ff-4"
              type="number"
              step="0.25"
              className="form-input"
              value={interestRate}
              onChange={(e) => setInterestRate(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="calc-ff-5" className="form-label">Loan Term (months)</label>
            <input
              id="calc-ff-5"
              type="number"
              className="form-input"
              value={loanTermMonths}
              onChange={(e) => setLoanTermMonths(e.target.value)}
            />
          </div>
        </div>
        <button type="button" onClick={calculate} className="btn-dark mt-2">
          <Calculator size={16} aria-hidden="true" />
          Calculate ROI
        </button>
      </div>

      {/* Results */}
      <div>
        {result ? (
          <div className="flex h-full flex-col bg-deep text-bone on-deep" aria-live="polite">
            <div className="p-6 lg:p-8">
              <h3 className="mb-5 border-b border-bone/20 pb-4 text-2xl">Your Fix &amp; Flip Estimate</h3>
              <dl className="flex flex-col">
                <div className="flex items-baseline justify-between gap-4 border-b border-dashed border-bone/20 py-3">
                  <dt className="text-[15px] text-[#A9B3C2]">Funded Capital Loan Amount (90% of cost)</dt>
                  <dd className="m-0 text-right font-figure text-base">{fmt(result.loanAmount)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 border-b border-dashed border-bone/20 py-3">
                  <dt className="text-[15px] text-[#A9B3C2]">Monthly Interest Payment</dt>
                  <dd className="m-0 text-right font-figure text-base text-brass-300">{fmt(result.monthlyInterest)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 border-b border-dashed border-bone/20 py-3">
                  <dt className="text-[15px] text-[#A9B3C2]">Total Interest Cost</dt>
                  <dd className="m-0 text-right font-figure text-base">{fmt(result.totalInterest)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 border-b border-dashed border-bone/20 py-3">
                  <dt className="text-[15px] text-[#A9B3C2]">Est. Closing Costs (3%)</dt>
                  <dd className="m-0 text-right font-figure text-base">{fmt(result.closingCosts)}</dd>
                </div>
                <hr className="my-2 border-bone/40" />
                <div className="flex items-baseline justify-between gap-4 py-3">
                  <dt className="font-semibold">Estimated Profit</dt>
                  <dd className={`m-0 font-figure text-2xl ${result.estimatedProfit >= 0 ? "text-brass-300" : "text-[#F2A7A0]"}`}>
                    {fmt(result.estimatedProfit)}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 py-3">
                  <dt className="font-semibold">ROI</dt>
                  <dd className={`m-0 font-figure text-2xl ${result.roi >= 0 ? "text-brass-300" : "text-[#F2A7A0]"}`}>
                    {result.roi.toFixed(1)}%
                  </dd>
                </div>
              </dl>
            </div>
            {/* CTA */}
            <div className="mt-auto flex flex-col gap-4 border-t border-bone/20 p-6 sm:flex-row sm:items-center sm:justify-between lg:px-8">
              <div>
                <p className="font-headline text-xl font-semibold">Ready to get funded?</p>
                <p className="mt-1 text-sm text-[#C9D1DD]">Get your term sheet in 2 hours on average.</p>
              </div>
              <Link href="/apply" className="btn-primary shrink-0 text-[15px]">
                Apply Now
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex h-full min-h-[300px] flex-col justify-center gap-4 bg-deep p-8 text-bone">
            <p className="font-figure text-[11px] uppercase tracking-[0.14em] text-brass-300">Your estimate</p>
            <p className="max-w-sm text-[15px] leading-relaxed text-[#C9D1DD]">Enter your deal details and click Calculate ROI to see your estimated returns.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── DSCR Calculator ──────────────────────────────────────────────────────────

function DSCRCalculator() {
  const [monthlyRent, setMonthlyRent] = useState("");
  const [propertyTaxes, setPropertyTaxes] = useState("");
  const [insurance, setInsurance] = useState("");
  const [hoa, setHoa] = useState("");
  const [loanAmount, setLoanAmount] = useState("");
  const [interestRate, setInterestRate] = useState("6.0");
  const [result, setResult] = useState<null | {
    monthlyPITI: number;
    monthlyCashFlow: number;
    dscr: number;
    qualifies: boolean;
    noi: number;
    annualDebtService: number;
  }>(null);

  function calculate() {
    const rent = parseFloat(monthlyRent) || 0;
    const taxes = parseFloat(propertyTaxes) || 0;
    const ins = parseFloat(insurance) || 0;
    const h = parseFloat(hoa) || 0;
    const loan = parseFloat(loanAmount) || 0;
    const rate = parseFloat(interestRate) / 100;

    // 30-year amortizing monthly payment
    const monthlyRate = rate / 12;
    const n = 360;
    const monthlyPI =
      monthlyRate > 0
        ? (loan * (monthlyRate * Math.pow(1 + monthlyRate, n))) /
          (Math.pow(1 + monthlyRate, n) - 1)
        : loan / n;

    const monthlyPITI = monthlyPI + taxes + ins + h;
    const monthlyCashFlow = rent - monthlyPITI;
    const noi = (rent - taxes - ins - h) * 12;
    const annualDebtService = monthlyPI * 12;
    const dscr = annualDebtService > 0 ? noi / annualDebtService : 0;
    const qualifies = dscr >= 1.0;

    setResult({ monthlyPITI, monthlyCashFlow, dscr, qualifies, noi, annualDebtService });
  }

  const fmt = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12">
      {/* Inputs */}
      <div className="flex flex-col gap-5">
        <div>
          <label htmlFor="calc-dscr-1" className="form-label">Monthly Rent</label>
          <input
            id="calc-dscr-1"
            type="number"
            placeholder="e.g. 2500"
            className="form-input"
            value={monthlyRent}
            onChange={(e) => setMonthlyRent(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="calc-dscr-2" className="form-label">Property Taxes / mo</label>
            <input
              id="calc-dscr-2"
              type="number"
              placeholder="e.g. 300"
              className="form-input"
              value={propertyTaxes}
              onChange={(e) => setPropertyTaxes(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="calc-dscr-3" className="form-label">Insurance / mo</label>
            <input
              id="calc-dscr-3"
              type="number"
              placeholder="e.g. 150"
              className="form-input"
              value={insurance}
              onChange={(e) => setInsurance(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label htmlFor="calc-dscr-4" className="form-label">HOA / mo (if applicable)</label>
          <input
            id="calc-dscr-4"
            type="number"
            placeholder="e.g. 0"
            className="form-input"
            value={hoa}
            onChange={(e) => setHoa(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="calc-dscr-5" className="form-label">Loan Amount</label>
          <input
            id="calc-dscr-5"
            type="number"
            placeholder="e.g. 300000"
            className="form-input"
            value={loanAmount}
            onChange={(e) => setLoanAmount(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="calc-dscr-6" className="form-label">Interest Rate (%) — 30-year fixed</label>
          <input
            id="calc-dscr-6"
            type="number"
            step="0.25"
            className="form-input"
            value={interestRate}
            onChange={(e) => setInterestRate(e.target.value)}
          />
        </div>
        <button type="button" onClick={calculate} className="btn-dark mt-2">
          <Calculator size={16} aria-hidden="true" />
          Calculate DSCR
        </button>
      </div>

      {/* Results */}
      <div>
        {result ? (
          <div className="flex h-full flex-col bg-deep text-bone on-deep" aria-live="polite">
            <div className="p-6 lg:p-8">
              <h3 className="mb-5 border-b border-bone/20 pb-4 text-2xl">DSCR Analysis</h3>
              <dl className="flex flex-col">
                <div className="flex items-baseline justify-between gap-4 border-b border-dashed border-bone/20 py-3">
                  <dt className="text-[15px] text-[#A9B3C2]">Monthly PITI Payment</dt>
                  <dd className="m-0 text-right font-figure text-base">{fmt(result.monthlyPITI)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 border-b border-dashed border-bone/20 py-3">
                  <dt className="text-[15px] text-[#A9B3C2]">Annual Net Operating Income</dt>
                  <dd className="m-0 text-right font-figure text-base">{fmt(result.noi)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 border-b border-dashed border-bone/20 py-3">
                  <dt className="text-[15px] text-[#A9B3C2]">Annual Debt Service</dt>
                  <dd className="m-0 text-right font-figure text-base">{fmt(result.annualDebtService)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 border-b border-dashed border-bone/20 py-3">
                  <dt className="text-[15px] text-[#A9B3C2]">Monthly Cash Flow</dt>
                  <dd
                    className={`m-0 text-right font-figure text-base ${
                      result.monthlyCashFlow >= 0 ? "text-brass-300" : "text-[#F2A7A0]"
                    }`}
                  >
                    {fmt(result.monthlyCashFlow)}
                  </dd>
                </div>
                <hr className="my-2 border-bone/40" />
                <div className="flex items-baseline justify-between gap-4 py-3">
                  <dt className="text-lg font-semibold">DSCR Ratio</dt>
                  <dd
                    className={`m-0 font-figure text-[32px] leading-none ${
                      result.dscr >= 1 ? "text-brass-300" : "text-[#F2A7A0]"
                    }`}
                  >
                    {result.dscr.toFixed(2)}x
                  </dd>
                </div>
                <div
                  className={`mt-3 rounded-[2px] border px-4 py-3 text-sm font-semibold ${
                    result.qualifies
                      ? "border-brass-500/60 text-brass-300"
                      : "border-[#F2A7A0]/60 text-[#F2A7A0]"
                  }`}
                >
                  {result.qualifies
                    ? "Qualifies — DSCR meets our minimum 1.0x requirement"
                    : "Does Not Qualify — DSCR is below the 1.0x minimum"}
                </div>
              </dl>
            </div>
            {/* CTA */}
            <div className="mt-auto flex flex-col gap-4 border-t border-bone/20 p-6 sm:flex-row sm:items-center sm:justify-between lg:px-8">
              <div>
                <p className="font-headline text-xl font-semibold">Ready to get funded?</p>
                <p className="mt-1 text-sm text-[#C9D1DD]">Get your term sheet in 2 hours on average.</p>
              </div>
              <Link href="/apply" className="btn-primary shrink-0 text-[15px]">
                Apply Now
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex h-full min-h-[300px] flex-col justify-center gap-4 bg-deep p-8 text-bone">
            <p className="font-figure text-[11px] uppercase tracking-[0.14em] text-brass-300">Your estimate</p>
            <p className="max-w-sm text-[15px] leading-relaxed text-[#C9D1DD]">
              Enter your rental property details to check DSCR qualification.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Loan Payment Calculator ──────────────────────────────────────────────────

function LoanPaymentCalculator() {
  const [loanAmount, setLoanAmount] = useState("");
  const [interestRate, setInterestRate] = useState("");
  const [loanType, setLoanType] = useState<"interest-only" | "amortizing">("interest-only");
  const [termMonths, setTermMonths] = useState("");
  const [result, setResult] = useState<null | {
    monthlyPayment: number;
    totalInterest: number;
    totalCost: number;
  }>(null);

  function calculate() {
    const loan = parseFloat(loanAmount) || 0;
    const rate = parseFloat(interestRate) / 100;
    const term = parseInt(termMonths) || 12;

    let monthlyPayment: number;
    let totalInterest: number;

    if (loanType === "interest-only") {
      monthlyPayment = loan * (rate / 12);
      totalInterest = monthlyPayment * term;
    } else {
      const monthlyRate = rate / 12;
      if (monthlyRate > 0) {
        monthlyPayment =
          (loan * (monthlyRate * Math.pow(1 + monthlyRate, term))) /
          (Math.pow(1 + monthlyRate, term) - 1);
      } else {
        monthlyPayment = loan / term;
      }
      totalInterest = monthlyPayment * term - loan;
    }

    const totalCost = loanType === "amortizing" ? loan + totalInterest : totalInterest;
    setResult({ monthlyPayment, totalInterest, totalCost });
  }

  const fmt = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12">
      {/* Inputs */}
      <div className="flex flex-col gap-5">
        <div>
          <label htmlFor="calc-pay-1" className="form-label">Loan Amount</label>
          <input
            id="calc-pay-1"
            type="number"
            placeholder="e.g. 500000"
            className="form-input"
            value={loanAmount}
            onChange={(e) => setLoanAmount(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="calc-pay-2" className="form-label">Interest Rate (%)</label>
          <input
            id="calc-pay-2"
            type="number"
            step="0.25"
            placeholder="e.g. 8.75"
            className="form-input"
            value={interestRate}
            onChange={(e) => setInterestRate(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="calc-pay-3" className="form-label">Loan Type</label>
          <select
            id="calc-pay-3"
            className="form-input"
            value={loanType}
            onChange={(e) =>
              setLoanType(e.target.value as "interest-only" | "amortizing")
            }
          >
            <option value="interest-only">Interest Only</option>
            <option value="amortizing">Amortizing</option>
          </select>
        </div>
        <div>
          <label htmlFor="calc-pay-4" className="form-label">Term (months)</label>
          <input
            id="calc-pay-4"
            type="number"
            placeholder="e.g. 12"
            className="form-input"
            value={termMonths}
            onChange={(e) => setTermMonths(e.target.value)}
          />
        </div>
        <button type="button" onClick={calculate} className="btn-dark mt-2">
          <Calculator size={16} aria-hidden="true" />
          Calculate Payment
        </button>
      </div>

      {/* Results */}
      <div>
        {result ? (
          <div className="flex h-full flex-col bg-deep text-bone on-deep" aria-live="polite">
            <div className="p-6 lg:p-8">
              <h3 className="mb-5 border-b border-bone/20 pb-4 text-2xl">Payment Summary</h3>
              <dl className="flex flex-col">
                <div className="flex items-baseline justify-between gap-4 py-3">
                  <dt className="text-lg font-semibold">Monthly Payment</dt>
                  <dd className="m-0 font-figure text-[32px] leading-none text-brass-300">{fmt(result.monthlyPayment)}</dd>
                </div>
                <hr className="my-2 border-bone/40" />
                <div className="flex items-baseline justify-between gap-4 border-b border-dashed border-bone/20 py-3">
                  <dt className="text-[15px] text-[#A9B3C2]">Total Interest</dt>
                  <dd className="m-0 text-right font-figure text-base">{fmt(result.totalInterest)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 border-b border-dashed border-bone/20 py-3">
                  <dt className="text-[15px] text-[#A9B3C2]">Total Cost of Loan</dt>
                  <dd className="m-0 text-right font-figure text-base">{fmt(result.totalCost)}</dd>
                </div>
              </dl>
            </div>
            {/* CTA */}
            <div className="mt-auto flex flex-col gap-4 border-t border-bone/20 p-6 sm:flex-row sm:items-center sm:justify-between lg:px-8">
              <div>
                <p className="font-headline text-xl font-semibold">Ready to get funded?</p>
                <p className="mt-1 text-sm text-[#C9D1DD]">Get your term sheet in 2 hours on average.</p>
              </div>
              <Link href="/apply" className="btn-primary shrink-0 text-[15px]">
                Apply Now
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex h-full min-h-[300px] flex-col justify-center gap-4 bg-deep p-8 text-bone">
            <p className="font-figure text-[11px] uppercase tracking-[0.14em] text-brass-300">Your estimate</p>
            <p className="max-w-sm text-[15px] leading-relaxed text-[#C9D1DD]">
              Enter your loan details to calculate monthly payments.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab definitions ──────────────────────────────────────────────────────────

const tabs = [
  { id: "fix-flip", label: "Fix & Flip ROI", component: FixFlipCalculator },
  { id: "dscr", label: "DSCR", component: DSCRCalculator },
  { id: "payment", label: "Loan Payment", component: LoanPaymentCalculator },
];

// ─── Client Root ──────────────────────────────────────────────────────────────

export default function CalculatorClient() {
  const [activeTab, setActiveTab] = useState("fix-flip");

  const ActiveComponent =
    tabs.find((t) => t.id === activeTab)?.component ?? FixFlipCalculator;

  return (
    <section aria-label="Calculators" className="bg-bone text-deep">
      <div className="section-container py-14 lg:py-20">
        {/* Tabs */}
        <div role="group" aria-label="Choose a calculator" className="mb-8 flex flex-col border-b border-rule sm:flex-row">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              aria-pressed={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`-mb-px min-h-[48px] border-b-2 px-1 py-3 text-left text-[15px] font-semibold transition-colors sm:mr-8 ${
                activeTab === tab.id
                  ? "border-brass-500 text-deep"
                  : "border-transparent text-deep-muted hover:text-deep"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Active tab content */}
        <div className="border border-rule bg-paper p-6 lg:p-8">
          <ActiveComponent />
        </div>

        <p className="mt-4 text-xs leading-relaxed text-deep-soft">
          * Calculations are estimates for informational purposes only and do not
          constitute a loan offer. Actual terms depend on deal specifics and borrower profile.
        </p>
      </div>
    </section>
  );
}
