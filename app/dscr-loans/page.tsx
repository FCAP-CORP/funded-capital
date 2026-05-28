import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  BarChart3,
  Users,
  TrendingUp,
  Building2,
  DollarSign,
  ChevronDown,
} from "lucide-react";

export const metadata: Metadata = {
  title: "DSCR Loans — Qualify on Rental Income, Not Your W-2 | Funded Capital",
  description:
    "DSCR rental loans up to 80% LTV. No income docs. Rates from 6.0%. 30-year fixed. Scale your rental portfolio without W-2 restrictions. Apply in minutes.",
};

// ─── Data ─────────────────────────────────────────────────────────────────────

const trustStats = [
  { value: "Up to 80% LTV", label: "Loan-to-Value" },
  { value: "From 6.0%", label: "Interest Rate" },
  { value: "30-Year Fixed", label: "Loan Term" },
  { value: "No Income Docs", label: "Qualification" },
];

const personas = [
  {
    icon: Building2,
    title: "Buy & Hold Investors",
    desc: "Add rental properties to your portfolio without the headache of income verification. Qualify on the property's cash flow alone.",
  },
  {
    icon: TrendingUp,
    title: "Portfolio Scalers",
    desc: "No limit on the number of properties. Stack loans across your portfolio and let rental income drive every qualification.",
  },
  {
    icon: Users,
    title: "Self-Employed Investors",
    desc: "Business owners and entrepreneurs often can't show traditional income. DSCR loans solve that — no W-2s, no tax return headaches.",
  },
];

const rateTableHeaders = ["Property Type", "Max LTV", "Rate", "DSCR Min", "Term"];
const rateTableRows = [
  ["SFR / Condo", "80% LTV", "From 6.0%", "1.0x", "30-yr fixed"],
  ["SFR / Condo", "80% LTV", "From 6.5%", "1.0x", "30-yr partial I/O"],
  ["2–4 Units", "80% LTV", "From 6.25%", "1.05x", "30-yr fixed"],
  ["2–4 Units", "80% LTV", "From 6.75%", "1.05x", "30-yr partial I/O"],
];

const faqs = [
  {
    q: "What is a DSCR loan?",
    a: "DSCR stands for Debt Service Coverage Ratio. It measures whether a property's rental income is sufficient to cover its debt payments. DSCR loans qualify you based on the property's income, not your personal W-2 or tax returns — making them ideal for investors.",
  },
  {
    q: "What is the minimum DSCR to qualify?",
    a: "Our minimum DSCR is 1.0x for SFR and condo properties, and 1.05x for 2–4 unit properties. A DSCR of 1.0x means the property's rent exactly covers the debt payment. Higher ratios may unlock better rates.",
  },
  {
    q: "Can I use projected rent to qualify?",
    a: "In some cases, yes. For new acquisitions, we may use a market rent analysis or appraiser's rental assessment when there is no current lease in place. Talk to a loan officer to confirm eligibility for your specific property.",
  },
  {
    q: "Is there a limit on the number of properties I can finance?",
    a: "No. Funded Capital places no limit on the number of DSCR loans you can have with us. This makes our program ideal for investors actively growing a rental portfolio.",
  },
  {
    q: "Do you offer cash-out refinance on DSCR loans?",
    a: "Yes. We offer cash-out refinance on stabilized rental properties up to 75% LTV. Use the proceeds to fund your next acquisition, complete renovations, or consolidate other debt.",
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function DSCRLoansPage() {
  const schemaData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "FAQPage",
        "mainEntity": [
          {
            "@type": "Question",
            "name": "What is a DSCR loan?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "DSCR stands for Debt Service Coverage Ratio. It measures whether a property's rental income is sufficient to cover its debt payments. DSCR loans qualify you based on the property's income, not your personal W-2 or tax returns — making them ideal for investors.",
            },
          },
          {
            "@type": "Question",
            "name": "What is the minimum DSCR to qualify?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Our minimum DSCR is 1.0x for SFR and condo properties, and 1.05x for 2–4 unit properties. A DSCR of 1.0x means the property's rent exactly covers the debt payment. Higher ratios may unlock better rates.",
            },
          },
          {
            "@type": "Question",
            "name": "Can I use projected rent to qualify for a DSCR loan?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "In some cases, yes. For new acquisitions, we may use a market rent analysis or appraiser's rental assessment when there is no current lease in place. Talk to a loan officer to confirm eligibility for your specific property.",
            },
          },
          {
            "@type": "Question",
            "name": "Is there a limit on the number of properties I can finance with DSCR loans?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "No. Funded Capital places no limit on the number of DSCR loans you can have with us. This makes our program ideal for investors actively growing a rental portfolio.",
            },
          },
          {
            "@type": "Question",
            "name": "Do you offer cash-out refinance on DSCR loans?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Yes. We offer cash-out refinance on stabilized rental properties up to 75% LTV. Use the proceeds to fund your next acquisition, complete renovations, or consolidate other debt.",
            },
          },
        ],
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.fundedcapital.com" },
          { "@type": "ListItem", "position": 2, "name": "Loan Programs", "item": "https://www.fundedcapital.com/loan-programs" },
          { "@type": "ListItem", "position": 3, "name": "DSCR / Rental Loans", "item": "https://www.fundedcapital.com/dscr-loans" },
        ],
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaData) }}
      />
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
              DSCR / Rental Loans — Nationwide
            </div>
            <h1
              id="hero-heading"
              className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight"
            >
              DSCR Loans — Qualify on{" "}
              <span className="text-gold-500">Rental Income</span>, Not Your W-2
            </h1>
            <p className="mt-6 text-lg text-slate-300 leading-relaxed max-w-2xl">
              Scale your rental portfolio without income documentation. Our DSCR loans
              qualify on the property&apos;s cash flow — not your tax returns or employment history.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-4">
              <Link href="/apply" className="btn-primary text-base px-8 py-4">
                Apply Now
                <ArrowRight size={18} />
              </Link>
              <Link href="/calculator" className="btn-secondary text-base px-8 py-4">
                <BarChart3 size={18} />
                Calculate My DSCR
              </Link>
            </div>
            <div className="mt-10 flex flex-wrap gap-x-6 gap-y-2">
              {["No income verification", "No limit on properties", "30-year fixed", "Cash-out available"].map((item) => (
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
      <section className="bg-navy-800 border-b border-navy-700" aria-label="DSCR loan highlights">
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

      {/* ── Who It's For ──────────────────────────────────────────────────── */}
      <section className="section-padding bg-slate-50" aria-labelledby="who-heading">
        <div className="section-container">
          <div className="text-center mb-12">
            <p className="section-label">Who DSCR Loans Are For</p>
            <h2 id="who-heading" className="section-heading">
              Built for Serious Rental Investors
            </h2>
            <p className="section-sub max-w-2xl mx-auto">
              Whether you&apos;re building your first rental or managing a large portfolio,
              DSCR loans remove the income verification barriers so you can scale faster.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {personas.map((persona) => {
              const Icon = persona.icon;
              return (
                <article key={persona.title} className="card">
                  <div className="p-2.5 bg-gold-500/10 rounded-xl self-start inline-block mb-3">
                    <Icon size={20} className="text-gold-600" />
                  </div>
                  <h3 className="font-bold text-navy-900">{persona.title}</h3>
                  <p className="text-slate-500 text-sm mt-2 leading-relaxed">{persona.desc}</p>
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
            <h2 id="rates-heading" className="section-heading">DSCR Loan Rates</h2>
            <p className="section-sub max-w-xl mx-auto">
              Competitive long-term rates for SFR, condos, and 2–4 unit properties.
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

      {/* ── DSCR Explained ───────────────────────────────────────────────── */}
      <section className="section-padding bg-slate-50" aria-labelledby="explained-heading">
        <div className="section-container">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <p className="section-label">The Formula</p>
              <h2 id="explained-heading" className="section-heading">
                What Is DSCR and How Is It Calculated?
              </h2>
              <p className="section-sub">
                DSCR — Debt Service Coverage Ratio — measures whether a
                property&apos;s income covers its debt payments.
              </p>
              <p className="text-slate-600 mt-4 leading-relaxed">
                The formula is simple:
              </p>
              <div className="my-6 bg-navy-900 rounded-2xl px-6 py-5 text-center">
                <p className="text-gold-500 font-bold text-lg">
                  DSCR = Net Operating Income (NOI) ÷ Annual Debt Service
                </p>
              </div>
              <p className="text-slate-600 leading-relaxed">
                A DSCR of <strong className="text-navy-900">1.0x</strong> means the rent exactly
                covers the mortgage payment. A ratio above 1.0x means positive cash flow.
                Below 1.0x means the rent doesn&apos;t cover the loan — and the property typically
                won&apos;t qualify.
              </p>
              <p className="text-slate-600 mt-4 leading-relaxed">
                Not sure where your property stands?
              </p>
              <Link href="/calculator" className="btn-primary mt-4 inline-flex">
                <BarChart3 size={16} />
                Use Our Free DSCR Calculator
              </Link>
            </div>
            <div className="flex flex-col gap-4">
              {[
                { label: "DSCR &lt; 1.0x", desc: "Rent does not cover the payment. Does not qualify.", color: "border-red-200 bg-red-50" },
                { label: "DSCR = 1.0x", desc: "Rent exactly covers the payment. Minimum qualifying threshold.", color: "border-slate-200 bg-white" },
                { label: "DSCR &gt; 1.25x", desc: "Strong cash flow. May qualify for better rates and terms.", color: "border-gold-500 bg-gold-50" },
              ].map((item) => (
                <div key={item.label} className={`rounded-2xl border p-5 ${item.color}`}>
                  <p
                    className="font-bold text-navy-900"
                    dangerouslySetInnerHTML={{ __html: item.label }}
                  />
                  <p className="text-slate-500 text-sm mt-1">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section className="section-padding bg-white" aria-labelledby="faq-heading">
        <div className="section-container">
          <div className="text-center mb-12">
            <p className="section-label">FAQ</p>
            <h2 id="faq-heading" className="section-heading">
              DSCR Loan Questions Answered
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
            Start Building Your Rental Portfolio
          </h2>
          <p className="text-slate-400 text-lg mt-4 max-w-xl mx-auto">
            Apply in minutes. Get a term sheet in 2 hours. No income docs required.
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
