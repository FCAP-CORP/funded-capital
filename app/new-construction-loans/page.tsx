import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Building2,
  Hammer,
  Home,
  Layers,
  DollarSign,
  ChevronDown,
} from "lucide-react";

export const metadata: Metadata = {
  title: "New Construction Loans — Up to 85% LTC, Ground-Up Financing | Funded Capital",
  description:
    "Ground-up construction loans up to 85% LTC. Draw schedules, milestone funding. Rates from 8.75%. SFR, townhomes, small multifamily, ADUs. Apply in minutes.",
};

// ─── Data ─────────────────────────────────────────────────────────────────────

const trustStats = [
  { value: "Up to 85% LTC", label: "Loan-to-Cost" },
  { value: "From 8.75%", label: "Interest Rate" },
  { value: "Draw Schedule Included", label: "Disbursement" },
  { value: "12–24 Month Terms", label: "Loan Term" },
];

const drawSteps = [
  {
    step: "01",
    title: "Land + Plans",
    desc: "Secure your lot and finalize architectural plans. Funded Capital underwrites the full project cost upfront.",
  },
  {
    step: "02",
    title: "Construction Draws",
    desc: "Funds are released in draws tied to construction milestones — foundation, framing, mechanical, and completion — verified by inspections.",
  },
  {
    step: "03",
    title: "Certificate of Occupancy",
    desc: "Project is complete, CO is issued. Sell the property or refinance into a long-term DSCR loan. Your loan is fully paid off.",
  },
];

const assetTypes = [
  {
    icon: Home,
    title: "Single-Family Residences",
    desc: "Ground-up SFR builds from entry-level to luxury. We finance spec builds and custom homes alike.",
  },
  {
    icon: Building2,
    title: "Townhomes",
    desc: "Attached or semi-attached townhome developments. Single phased or multi-phase projects welcome.",
  },
  {
    icon: Layers,
    title: "Small Multifamily",
    desc: "2–4 unit residential construction. Perfect for investors building duplexes, triplexes, and quads.",
  },
  {
    icon: Hammer,
    title: "Accessory Dwelling Units (ADUs)",
    desc: "Detached or attached ADU construction on existing lots. A fast-growing asset class we actively support.",
  },
];

const rateTableHeaders = ["Project Size", "Max LTC", "Rate", "Draws", "Term"];
const rateTableRows = [
  ["Up to $1M", "85% LTC", "From 8.75%", "Monthly", "12 mo"],
  ["$1M–$5M", "85% LTC", "From 9.50%", "Milestone", "12–24 mo"],
  ["$5M+", "85% LTC", "From 10.25%", "Negotiated", "Up to 24 mo"],
];

const faqs = [
  {
    q: "How do construction draws work?",
    a: "Draws are disbursements released as construction milestones are completed and verified. Our team schedules inspections at key stages — foundation, framing, rough-in, drywall, and final completion. Once a milestone is confirmed, funds are released to your account.",
  },
  {
    q: "Do I need prior construction experience?",
    a: "Experienced builders are preferred, but first-time builders with a qualified general contractor may still qualify. We evaluate the strength of your build team, project plans, and overall deal economics.",
  },
  {
    q: "What is the maximum loan size for a ground-up project?",
    a: "We do not have a hard cap. Projects over $5M are evaluated on a case-by-case basis with negotiated rates and terms. Contact us directly to discuss your large-scale project.",
  },
  {
    q: "Can I refinance into a DSCR loan after construction is complete?",
    a: "Yes. Many of our borrowers build with us and then refinance into our 30-year DSCR rental loan once the property is stabilized. We make this transition as seamless as possible for repeat clients.",
  },
  {
    q: "What states do you lend in for new construction?",
    a: "We lend in 44 states nationwide. A few states are excluded due to licensing requirements. Contact a loan officer to confirm eligibility in your specific state before submitting an application.",
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function NewConstructionLoansPage() {
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
              New Construction Loans — Nationwide
            </div>
            <h1
              id="hero-heading"
              className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight"
            >
              New Construction Loans —{" "}
              <span className="text-gold-500">Up to 85% LTC</span>, Ground-Up Financing
            </h1>
            <p className="mt-6 text-lg text-slate-300 leading-relaxed max-w-2xl">
              Finance your ground-up development with flexible draw schedules and
              milestone-based funding. We underwrite the full project cost so you
              can build without capital constraints.
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
              {["Up to 85% LTC", "Draw schedule included", "680+ credit score", "SFR, townhomes, multifamily"].map((item) => (
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
      <section className="bg-navy-800 border-b border-navy-700" aria-label="New construction loan highlights">
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

      {/* ── How Construction Draws Work ───────────────────────────────────── */}
      <section className="section-padding bg-slate-50" aria-labelledby="draws-heading">
        <div className="section-container">
          <div className="text-center mb-12">
            <p className="section-label">The Build Process</p>
            <h2 id="draws-heading" className="section-heading">
              How Construction Draws Work
            </h2>
            <p className="section-sub max-w-2xl mx-auto">
              Funds are released in stages as your project hits milestones,
              so you only pay interest on what you&apos;ve drawn — minimizing carrying costs.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
            {drawSteps.map((step, i) => (
              <article key={step.step} className="relative card">
                {i < drawSteps.length - 1 && (
                  <div
                    className="hidden md:block absolute top-8 left-full w-8 h-px bg-gold-500/40 z-0"
                    aria-hidden="true"
                  />
                )}
                <span className="text-gold-500 font-bold text-4xl opacity-30 leading-none block mb-3">
                  {step.step}
                </span>
                <h3 className="font-bold text-navy-900 text-lg">{step.title}</h3>
                <p className="text-slate-500 text-sm mt-2 leading-relaxed">{step.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Rate Table ────────────────────────────────────────────────────── */}
      <section id="rates" className="section-padding bg-white scroll-mt-20" aria-labelledby="rates-heading">
        <div className="section-container">
          <div className="text-center mb-10">
            <p className="section-label">Pricing</p>
            <h2 id="rates-heading" className="section-heading">New Construction Loan Rates</h2>
            <p className="section-sub max-w-xl mx-auto">
              Competitive rates for projects of all sizes, from starter builds to large developments.
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
              * Rates and terms are indicative and subject to change. Final terms depend on project specifics and borrower profile.
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

      {/* ── What We Finance ───────────────────────────────────────────────── */}
      <section className="section-padding bg-slate-50" aria-labelledby="assets-heading">
        <div className="section-container">
          <div className="text-center mb-12">
            <p className="section-label">Asset Types</p>
            <h2 id="assets-heading" className="section-heading">
              What We Finance
            </h2>
            <p className="section-sub max-w-2xl mx-auto">
              From single-family spec builds to ADUs and small multifamily projects,
              our construction loans cover the full range of residential asset types.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {assetTypes.map((asset) => {
              const Icon = asset.icon;
              return (
                <article key={asset.title} className="card">
                  <div className="p-2.5 bg-gold-500/10 rounded-xl self-start inline-block mb-3">
                    <Icon size={20} className="text-gold-600" />
                  </div>
                  <h3 className="font-bold text-navy-900">{asset.title}</h3>
                  <p className="text-slate-500 text-sm mt-2 leading-relaxed">{asset.desc}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section className="section-padding bg-white" aria-labelledby="faq-heading">
        <div className="section-container">
          <div className="text-center mb-12">
            <p className="section-label">FAQ</p>
            <h2 id="faq-heading" className="section-heading">
              New Construction Loan Questions Answered
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
          <p className="section-label">Get Funded Fast</p>
          <h2 id="cta-heading" className="text-3xl lg:text-4xl font-bold text-white mt-2">
            Get Funding for Your Next Build
          </h2>
          <p className="text-slate-400 text-lg mt-4 max-w-xl mx-auto">
            Apply in minutes. Our construction loan specialists will review your project
            and get back to you within 2 hours.
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
