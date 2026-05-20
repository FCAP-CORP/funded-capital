import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Zap,
  Shield,
  Hammer,
  DollarSign,
  ChevronDown,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Fix & Flip Loans — Up to 90% LTC, Close in 5 Days | Funded Capital",
  description:
    "Fix & Flip loans up to 90% LTC. No income verification. Rates from 8.75%. Close in as little as 5 days. Apply for your term sheet in 2 hours.",
};

// ─── Data ─────────────────────────────────────────────────────────────────────

const trustStats = [
  { value: "Up to 90% LTC", label: "Loan-to-Cost" },
  { value: "From 8.75%", label: "Interest Rate" },
  { value: "Close in 5 Days", label: "Speed to Close" },
  { value: "No Income Verification", label: "Qualification" },
];

const benefits = [
  {
    icon: Zap,
    title: "Speed That Wins Deals",
    desc: "Term sheet in 2 hours. Close in as little as 5 business days. When the deal is hot, we move fast.",
  },
  {
    icon: Shield,
    title: "Flexible Terms",
    desc: "12 or 24 month terms with interest-only payments. Tailor the loan to your flip timeline.",
  },
  {
    icon: CheckCircle2,
    title: "No Income Verification",
    desc: "We qualify on the deal, not your W-2. Self-employed investors and LLCs are fully welcome.",
  },
  {
    icon: Hammer,
    title: "Rehab Costs Included",
    desc: "We fund both the purchase and 100% of your rehab budget, so you can maximize your spread.",
  },
];

const steps = [
  {
    step: "01",
    title: "Submit Your Loan Request",
    desc: "Complete our streamlined online application in under 5 minutes. Tell us about the property and the deal.",
  },
  {
    step: "02",
    title: "Receive a Term Sheet",
    desc: "Get a preliminary term sheet within 2 hours — no fluff, no runaround. Real numbers you can plan around.",
  },
  {
    step: "03",
    title: "Underwriting & Approval",
    desc: "We move fast. Most Fix & Flip loans are fully approved within 5–7 business days.",
  },
  {
    step: "04",
    title: "Fund & Close",
    desc: "Loan is disbursed to the title company on the day of closing. You close, you renovate, you profit.",
  },
];

const rateTableHeaders = ["Loan Size", "Max LTC", "Rate", "Points", "Term"];
const rateTableRows = [
  ["$75K–$500K", "90% LTC", "From 8.75%", "1.5–2.5", "12–24 mo"],
  ["$500K–$2M", "90% LTC", "From 9.25%", "1.0–2.0", "12–24 mo"],
  ["$2M+", "90% LTC", "Negotiated", "Negotiated", "12–24 mo"],
];

const faqs = [
  {
    q: "What is the maximum LTC for Fix & Flip loans?",
    a: "We lend up to 90% of the combined purchase price and rehab budget (Loan-to-Cost). On the purchase component alone, we go up to 90% of the as-is value. We also fund 100% of rehab costs within that LTC.",
  },
  {
    q: "Do I need income verification or W-2s?",
    a: "No. Funded Capital's Fix & Flip loans are asset-based. We qualify on the deal — the property value, your ARV, and your exit strategy — not your personal income or employment history.",
  },
  {
    q: "How fast can I close?",
    a: "We issue term sheets within 2 hours of application and can close loans in as little as 5 business days for straightforward deals. More complex transactions typically close in 7–14 business days.",
  },
  {
    q: "What credit score do I need?",
    a: "We prefer a 680+ credit score, but we evaluate each deal holistically. Strong deals with experienced borrowers may qualify with scores below 680. Talk to a loan officer to discuss your specific situation.",
  },
  {
    q: "Can you fund the rehab costs as well as the purchase?",
    a: "Yes. We fund both the acquisition and up to 100% of your approved rehab budget within the overall 90% LTC cap. Rehab funds are disbursed via a draw schedule as work is completed and inspected.",
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function FixAndFlipLoansPage() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="bg-navy-900 py-20 lg:py-28 relative overflow-hidden" aria-labelledby="hero-heading">
        <div
          className="absolute top-0 right-0 w-1/2 h-full opacity-10"
          style={{ background: "radial-gradient(ellipse at top right, #C9A84C 0%, transparent 65%)" }}
          aria-hidden="true"
        />
        <div className="section-container relative z-10">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 bg-navy-800 border border-navy-700 text-gold-500 text-xs font-semibold px-4 py-2 rounded-full mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-gold-500 animate-pulse" />
              Fix &amp; Flip Loans — Nationwide
            </div>
            <h1
              id="hero-heading"
              className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight"
            >
              Fix &amp; Flip Loans —{" "}
              <span className="text-gold-500">Up to 90% LTC</span>, Close in 5 Days
            </h1>
            <p className="mt-6 text-lg text-slate-300 leading-relaxed max-w-2xl">
              Private Fix &amp; Flip financing with no income verification. We fund
              the purchase and the rehab so you can move fast, renovate smart, and
              maximize your spread.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-4">
              <Link href="/apply" className="btn-primary text-base px-8 py-4">
                Apply Now
                <ArrowRight size={18} />
              </Link>
              <a href="#rates" className="btn-secondary text-base px-8 py-4">
                View Rates
                <ChevronDown size={18} />
              </a>
            </div>
            <div className="mt-10 flex flex-wrap gap-x-6 gap-y-2">
              {["No income verification", "680+ credit score", "Close in 5 days", "Rehab included"].map((item) => (
                <span key={item} className="flex items-center gap-1.5 text-slate-400 text-sm">
                  <CheckCircle2 size={14} className="text-gold-500 shrink-0" />
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Trust Bar ─────────────────────────────────────────────────────── */}
      <section className="bg-navy-800 border-b border-navy-700" aria-label="Fix & Flip loan highlights">
        <div className="section-container py-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 text-center">
            {trustStats.map((stat) => (
              <div key={stat.label}>
                <p className="text-gold-500 font-bold text-xl lg:text-2xl">{stat.value}</p>
                <p className="text-slate-400 text-sm mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Benefits ──────────────────────────────────────────────────────── */}
      <section className="section-padding bg-slate-50" aria-labelledby="benefits-heading">
        <div className="section-container">
          <div className="text-center mb-12">
            <p className="section-label">Why Investors Choose Us</p>
            <h2 id="benefits-heading" className="section-heading">
              Fix &amp; Flip Financing Built for Speed
            </h2>
            <p className="section-sub max-w-2xl mx-auto">
              Every feature of our Fix &amp; Flip loan program is designed around one thing:
              helping you close, renovate, and sell faster than the competition.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {benefits.map((benefit) => {
              const Icon = benefit.icon;
              return (
                <article key={benefit.title} className="card">
                  <div className="p-2.5 bg-gold-500/10 rounded-xl self-start inline-block mb-3">
                    <Icon size={20} className="text-gold-600" />
                  </div>
                  <h3 className="font-bold text-navy-900">{benefit.title}</h3>
                  <p className="text-slate-500 text-sm mt-2 leading-relaxed">{benefit.desc}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Rate Table ────────────────────────────────────────────────────── */}
      <section id="rates" className="section-padding bg-white scroll-mt-20" aria-labelledby="rates-heading">
        <div className="section-container">
          <div className="text-center mb-10">
            <p className="section-label">Pricing</p>
            <h2 id="rates-heading" className="section-heading">Fix &amp; Flip Loan Rates</h2>
            <p className="section-sub max-w-xl mx-auto">
              Straightforward pricing with no hidden fees. What you see is what you get at closing.
            </p>
          </div>
          <div className="max-w-3xl mx-auto">
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-navy-900">
                    {rateTableHeaders.map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-white font-semibold text-xs uppercase tracking-wider"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rateTableRows.map((row, i) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                      {row.map((cell, j) => (
                        <td
                          key={j}
                          className={`px-4 py-3.5 text-slate-700 ${j === 2 ? "font-semibold text-gold-600" : ""}`}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-400 mt-2 pl-1">
              * Rates and terms are indicative and subject to change. Final terms depend on deal specifics and borrower profile.
            </p>
            <div className="mt-6 text-center">
              <Link href="/apply" className="btn-primary">
                Get Your Rate Today
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── How It Works ─────────────────────────────────────────────────── */}
      <section className="section-padding bg-slate-50" aria-labelledby="how-heading">
        <div className="section-container">
          <div className="text-center mb-12">
            <p className="section-label">Simple Process</p>
            <h2 id="how-heading" className="section-heading">
              From Application to Funded in 4 Steps
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {steps.map((step, i) => (
              <article key={step.step} className="relative">
                {i < steps.length - 1 && (
                  <div
                    className="hidden lg:block absolute top-7 left-full w-full h-px bg-slate-200 z-0"
                    aria-hidden="true"
                  />
                )}
                <div className="relative z-10">
                  <span className="text-gold-500 font-bold text-4xl opacity-30 leading-none">
                    {step.step}
                  </span>
                  <h3 className="font-bold text-navy-900 text-lg mt-2">{step.title}</h3>
                  <p className="text-slate-500 text-sm mt-2 leading-relaxed">{step.desc}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section className="section-padding bg-white" aria-labelledby="faq-heading">
        <div className="section-container">
          <div className="text-center mb-12">
            <p className="section-label">FAQ</p>
            <h2 id="faq-heading" className="section-heading">
              Fix &amp; Flip Loan Questions Answered
            </h2>
          </div>
          <div className="max-w-3xl mx-auto flex flex-col gap-4">
            {faqs.map((faq) => (
              <article key={faq.q} className="card">
                <h3 className="font-bold text-navy-900">{faq.q}</h3>
                <p className="text-slate-500 text-sm mt-2 leading-relaxed">{faq.a}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ───────────────────────────────────────────────────── */}
      <section className="bg-navy-900 py-20" aria-labelledby="cta-heading">
        <div className="section-container text-center">
          <div
            className="absolute inset-0 opacity-10 pointer-events-none"
            style={{ background: "radial-gradient(ellipse at center, #C9A84C 0%, transparent 65%)" }}
            aria-hidden="true"
          />
          <p className="section-label">Get Funded Fast</p>
          <h2 id="cta-heading" className="text-3xl lg:text-4xl font-bold text-white mt-2">
            Apply for Your Fix &amp; Flip Loan Today
          </h2>
          <p className="text-slate-400 text-lg mt-4 max-w-xl mx-auto">
            No commitment required. Get your term sheet within 2 hours and know
            exactly where you stand before you proceed.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/apply" className="btn-primary text-base px-10 py-4">
              Apply Now — It&apos;s Free
              <ArrowRight size={18} />
            </Link>
            <Link href="/contact" className="btn-secondary text-base px-10 py-4">
              <DollarSign size={16} />
              Talk to a Loan Officer
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
