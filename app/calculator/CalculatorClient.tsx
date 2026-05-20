'use client';

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Calculator, TrendingUp, DollarSign } from "lucide-react";

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
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Inputs */}
      <div className="flex flex-col gap-4">
        <div>
          <label className="form-label">Purchase Price</label>
          <input
            type="number"
            placeholder="e.g. 250000"
            className="form-input"
            value={purchasePrice}
            onChange={(e) => setPurchasePrice(e.target.value)}
          />
        </div>
        <div>
          <label className="form-label">Rehab Budget</label>
          <input
            type="number"
            placeholder="e.g. 50000"
            className="form-input"
            value={rehabBudget}
            onChange={(e) => setRehabBudget(e.target.value)}
          />
        </div>
        <div>
          <label className="form-label">After Repair Value (ARV)</label>
          <input
            type="number"
            placeholder="e.g. 400000"
            className="form-input"
            value={arv}
            onChange={(e) => setArv(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Interest Rate (%)</label>
            <input
              type="number"
              step="0.25"
              className="form-input"
              value={interestRate}
              onChange={(e) => setInterestRate(e.target.value)}
            />
          </div>
          <div>
            <label className="form-label">Loan Term (months)</label>
            <input
              type="number"
              className="form-input"
              value={loanTermMonths}
              onChange={(e) => setLoanTermMonths(e.target.value)}
            />
          </div>
        </div>
        <button onClick={calculate} className="btn-primary mt-2">
          <Calculator size={16} />
          Calculate ROI
        </button>
      </div>

      {/* Results */}
      <div>
        {result ? (
          <div className="flex flex-col gap-4">
            <div className="card border-gold-500 ring-1 ring-gold-500/20">
              <h3 className="font-bold text-navy-900 mb-4 text-base">Your Fix &amp; Flip Estimate</h3>
              <dl className="flex flex-col gap-3">
                <div className="flex justify-between text-sm">
                  <dt className="text-slate-500">Funded Capital Loan Amount (90% LTC)</dt>
                  <dd className="font-semibold text-navy-900">{fmt(result.loanAmount)}</dd>
                </div>
                <div className="flex justify-between text-sm">
                  <dt className="text-slate-500">Monthly Interest Payment</dt>
                  <dd className="font-semibold text-gold-600">{fmt(result.monthlyInterest)}</dd>
                </div>
                <div className="flex justify-between text-sm">
                  <dt className="text-slate-500">Total Interest Cost</dt>
                  <dd className="font-semibold text-navy-900">{fmt(result.totalInterest)}</dd>
                </div>
                <div className="flex justify-between text-sm">
                  <dt className="text-slate-500">Est. Closing Costs (3%)</dt>
                  <dd className="font-semibold text-navy-900">{fmt(result.closingCosts)}</dd>
                </div>
                <hr className="border-slate-100" />
                <div className="flex justify-between">
                  <dt className="font-bold text-navy-900">Estimated Profit</dt>
                  <dd className={`font-bold text-lg ${result.estimatedProfit >= 0 ? "text-gold-600" : "text-red-500"}`}>
                    {fmt(result.estimatedProfit)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="font-bold text-navy-900">ROI</dt>
                  <dd className={`font-bold text-lg ${result.roi >= 0 ? "text-gold-600" : "text-red-500"}`}>
                    {result.roi.toFixed(1)}%
                  </dd>
                </div>
              </dl>
            </div>
            {/* CTA */}
            <div className="bg-navy-900 rounded-2xl p-5 text-center">
              <p className="text-white font-bold">Ready to get funded?</p>
              <p className="text-slate-400 text-sm mt-1">Get your term sheet in 2 hours.</p>
              <Link href="/apply" className="btn-primary mt-4 text-sm">
                Apply Now
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        ) : (
          <div className="card h-full flex flex-col items-center justify-center text-center gap-3 min-h-[300px] border-dashed">
            <TrendingUp size={32} className="text-slate-300" />
            <p className="text-slate-400 text-sm">Enter your deal details and click Calculate ROI to see your estimated returns.</p>
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
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Inputs */}
      <div className="flex flex-col gap-4">
        <div>
          <label className="form-label">Monthly Rent</label>
          <input
            type="number"
            placeholder="e.g. 2500"
            className="form-input"
            value={monthlyRent}
            onChange={(e) => setMonthlyRent(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Property Taxes / mo</label>
            <input
              type="number"
              placeholder="e.g. 300"
              className="form-input"
              value={propertyTaxes}
              onChange={(e) => setPropertyTaxes(e.target.value)}
            />
          </div>
          <div>
            <label className="form-label">Insurance / mo</label>
            <input
              type="number"
              placeholder="e.g. 150"
              className="form-input"
              value={insurance}
              onChange={(e) => setInsurance(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="form-label">HOA / mo (if applicable)</label>
          <input
            type="number"
            placeholder="e.g. 0"
            className="form-input"
            value={hoa}
            onChange={(e) => setHoa(e.target.value)}
          />
        </div>
        <div>
          <label className="form-label">Loan Amount</label>
          <input
            type="number"
            placeholder="e.g. 300000"
            className="form-input"
            value={loanAmount}
            onChange={(e) => setLoanAmount(e.target.value)}
          />
        </div>
        <div>
          <label className="form-label">Interest Rate (%) — 30-year fixed</label>
          <input
            type="number"
            step="0.25"
            className="form-input"
            value={interestRate}
            onChange={(e) => setInterestRate(e.target.value)}
          />
        </div>
        <button onClick={calculate} className="btn-primary mt-2">
          <Calculator size={16} />
          Calculate DSCR
        </button>
      </div>

      {/* Results */}
      <div>
        {result ? (
          <div className="flex flex-col gap-4">
            <div className="card border-gold-500 ring-1 ring-gold-500/20">
              <h3 className="font-bold text-navy-900 mb-4 text-base">DSCR Analysis</h3>
              <dl className="flex flex-col gap-3">
                <div className="flex justify-between text-sm">
                  <dt className="text-slate-500">Monthly PITI Payment</dt>
                  <dd className="font-semibold text-navy-900">{fmt(result.monthlyPITI)}</dd>
                </div>
                <div className="flex justify-between text-sm">
                  <dt className="text-slate-500">Annual Net Operating Income</dt>
                  <dd className="font-semibold text-navy-900">{fmt(result.noi)}</dd>
                </div>
                <div className="flex justify-between text-sm">
                  <dt className="text-slate-500">Annual Debt Service</dt>
                  <dd className="font-semibold text-navy-900">{fmt(result.annualDebtService)}</dd>
                </div>
                <div className="flex justify-between text-sm">
                  <dt className="text-slate-500">Monthly Cash Flow</dt>
                  <dd
                    className={`font-semibold ${
                      result.monthlyCashFlow >= 0 ? "text-gold-600" : "text-red-500"
                    }`}
                  >
                    {fmt(result.monthlyCashFlow)}
                  </dd>
                </div>
                <hr className="border-slate-100" />
                <div className="flex justify-between items-center">
                  <dt className="font-bold text-navy-900 text-lg">DSCR Ratio</dt>
                  <dd
                    className={`font-bold text-2xl ${
                      result.dscr >= 1 ? "text-gold-600" : "text-red-500"
                    }`}
                  >
                    {result.dscr.toFixed(2)}x
                  </dd>
                </div>
                <div
                  className={`rounded-xl px-4 py-3 text-center font-semibold text-sm ${
                    result.qualifies
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "bg-red-50 text-red-700 border border-red-200"
                  }`}
                >
                  {result.qualifies
                    ? "Qualifies ✓ — DSCR meets our minimum 1.0x requirement"
                    : "Does Not Qualify — DSCR is below the 1.0x minimum"}
                </div>
              </dl>
            </div>
            {/* CTA */}
            <div className="bg-navy-900 rounded-2xl p-5 text-center">
              <p className="text-white font-bold">Ready to get funded?</p>
              <p className="text-slate-400 text-sm mt-1">Get your term sheet in 2 hours.</p>
              <Link href="/apply" className="btn-primary mt-4 text-sm">
                Apply Now
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        ) : (
          <div className="card h-full flex flex-col items-center justify-center text-center gap-3 min-h-[300px] border-dashed">
            <DollarSign size={32} className="text-slate-300" />
            <p className="text-slate-400 text-sm">
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
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Inputs */}
      <div className="flex flex-col gap-4">
        <div>
          <label className="form-label">Loan Amount</label>
          <input
            type="number"
            placeholder="e.g. 500000"
            className="form-input"
            value={loanAmount}
            onChange={(e) => setLoanAmount(e.target.value)}
          />
        </div>
        <div>
          <label className="form-label">Interest Rate (%)</label>
          <input
            type="number"
            step="0.25"
            placeholder="e.g. 8.75"
            className="form-input"
            value={interestRate}
            onChange={(e) => setInterestRate(e.target.value)}
          />
        </div>
        <div>
          <label className="form-label">Loan Type</label>
          <select
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
          <label className="form-label">Term (months)</label>
          <input
            type="number"
            placeholder="e.g. 12"
            className="form-input"
            value={termMonths}
            onChange={(e) => setTermMonths(e.target.value)}
          />
        </div>
        <button onClick={calculate} className="btn-primary mt-2">
          <Calculator size={16} />
          Calculate Payment
        </button>
      </div>

      {/* Results */}
      <div>
        {result ? (
          <div className="flex flex-col gap-4">
            <div className="card border-gold-500 ring-1 ring-gold-500/20">
              <h3 className="font-bold text-navy-900 mb-4 text-base">Payment Summary</h3>
              <dl className="flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <dt className="font-bold text-navy-900 text-lg">Monthly Payment</dt>
                  <dd className="font-bold text-2xl text-gold-600">{fmt(result.monthlyPayment)}</dd>
                </div>
                <hr className="border-slate-100" />
                <div className="flex justify-between text-sm">
                  <dt className="text-slate-500">Total Interest</dt>
                  <dd className="font-semibold text-navy-900">{fmt(result.totalInterest)}</dd>
                </div>
                <div className="flex justify-between text-sm">
                  <dt className="text-slate-500">Total Cost of Loan</dt>
                  <dd className="font-semibold text-navy-900">{fmt(result.totalCost)}</dd>
                </div>
              </dl>
            </div>
            {/* CTA */}
            <div className="bg-navy-900 rounded-2xl p-5 text-center">
              <p className="text-white font-bold">Ready to get funded?</p>
              <p className="text-slate-400 text-sm mt-1">Get your term sheet in 2 hours.</p>
              <Link href="/apply" className="btn-primary mt-4 text-sm">
                Apply Now
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        ) : (
          <div className="card h-full flex flex-col items-center justify-center text-center gap-3 min-h-[300px] border-dashed">
            <Calculator size={32} className="text-slate-300" />
            <p className="text-slate-400 text-sm">
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
    <>
      {/* Hero */}
      <section className="bg-navy-900 py-16 lg:py-20">
        <div className="section-container">
          <p className="section-label">Free Tools</p>
          <h1 className="text-4xl lg:text-5xl font-bold text-white mt-2 max-w-2xl">
            Real Estate Loan Calculator
          </h1>
          <p className="text-slate-300 text-lg mt-4 max-w-2xl leading-relaxed">
            Estimate Fix &amp; Flip ROI, check DSCR qualification, or calculate
            monthly payments — instantly, for free.
          </p>
        </div>
      </section>

      {/* Calculator */}
      <section className="section-padding bg-slate-50">
        <div className="section-container">
          {/* Tabs */}
          <div className="flex flex-col sm:flex-row gap-2 mb-8 bg-white border border-slate-200 p-1.5 rounded-2xl shadow-sm w-fit">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-5 py-2.5 rounded-xl font-semibold text-sm transition-all duration-200 ${
                  activeTab === tab.id
                    ? "bg-navy-900 text-white shadow-sm"
                    : "text-slate-500 hover:text-navy-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Active tab content */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 lg:p-8 shadow-sm">
            <ActiveComponent />
          </div>

          <p className="text-xs text-slate-400 mt-4 pl-1">
            * Calculations are estimates for informational purposes only and do not
            constitute a loan offer. Actual terms depend on deal specifics and borrower profile.
          </p>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="bg-navy-900 py-14">
        <div className="section-container text-center">
          <p className="section-label">Get Funded Fast</p>
          <h2 className="text-3xl font-bold text-white mt-2">
            Like what you see? Apply in minutes.
          </h2>
          <p className="text-slate-400 mt-3 max-w-xl mx-auto">
            Our loan officers review every application personally. Get a term sheet within 2 hours.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/apply" className="btn-primary text-base px-10 py-4">
              Apply Now — It&apos;s Free
              <ArrowRight size={18} />
            </Link>
            <Link href="/loan-programs" className="btn-secondary text-base px-10 py-4">
              View All Loan Programs
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
