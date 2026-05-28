import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Layers,
  Building2,
  TrendingUp,
  Users,
  DollarSign,
  ChevronDown,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Multifamily Loans — Bridge & Term Financing for 5+ Units | Funded Capital",
  description:
    "Multifamily bridge and term loans for 5+ unit assets. Up to 75% LTV. Rates from 8.0%. Value-add and stabilized properties. Apply in minutes.",
};

// ─── Data ─────────────────────────────────────────────────────────────────────

const trustStats = [
  { value: "Up to 75% LTV", label: "Loan-to-Value" },
  { value: "From 8.0%", label: "Interest Rate" },
  { value: "1–10 Year Terms", label: "Loan Term" },
  { value: "5+ Units", label: "Minimum Property Size" },
];

const loanTypes = [
  {
    icon: TrendingUp,
    title: "Bridge Loans",
    subtitle: "Value-Add & Transitional Assets",
    desc: "Short-term bridge financing for multifamily properties that need renovation, lease-up, or repositioning. Ideal for value-add investors executing a business plan with a defined exit.",
    features: [
      "12–24 month terms",
      "Interest-only payments",
      "Up to 80% LTC on value-add",
      "Fast closings — as little as 10 days",
    ],
  },
  {
    icon: Building2,
    title: "Term Loans",
    subtitle: "Stabilized & Cash-Flowing Assets",
    desc: "Long-term financing for stabilized multifamily assets generating consistent rental income. Ideal for hold-and-collect investors seeking permanent capital solutions.",
    features: [
      "1–10 year fixed terms",
      "Recourse and non-recourse options",
      "Interest-only available",
      "Up to 75% LTV",
    ],
  },
];

const rateTableHeaders = ["Asset Type", "Max LTV", "Rate", "Points", "Term"];
const rateTableRows = [
  ["Stabilized (5–20 units)", "75% LTV", "From 8.0%", "1.0–1.5", "1–10 yrs"],
  ["Value-Add (5–20 units)", "80% LTC", "From 8.75%", "1.5–2.0", "1–10 yrs"],
  ["20+ Units", "70% LTV", "Negotiated", "Negotiated", "Negotiated"],
];

const assetTypes = [
  {
    icon: Layers,
    title: "Small Apartment Buildings",
    desc: "5–20 unit residential apartment complexes, whether garden-style, mid-rise, or walk-up buildings.",
  },
  {
    icon: Building2,
    title: "Mixed-Use Properties",
    desc: "Ground-floor commercial with residential units above. We lend on mixed-use where the majority of income is residential.",
  },
  {
    icon: Users,
    title: "Student Housing",
    desc: "Purpose-built or converted student housing near colleges and universities. We underwrite based on rental demand.",
  },
  {
    icon: TrendingUp,
    title: "Senior Housing",
    desc: "Independent living and market-rate senior apartment communities. Evaluated on occupancy and cash flow stability.",
  },
];

const faqs = [
  {
    q: "What is the minimum number of units to qualify?",
    a: "Our multifamily loan program requires a minimum of 5 residential units. Properties with 2–4 units may qualify under our DSCR rental loan program instead.",
  },
  {
    q: "Do you offer non-recourse multifamily loans?",
    a: "Yes. Non-recourse options are available for stabilized assets and qualified borrowers. Non-recourse loans typically require a stronger LTV, higher net worth, and a demonstrated track record. Talk to a loan officer to discuss eligibility.",
  },
  {
    q: "Can I do interest-only payments on a multifamily loan?",
    a: "Yes. Interest-only periods are available on both bridge and term loan structures, subject to underwriting approval. This can significantly improve cash flow during the hold period.",
  },
  {
    q: "What is the maximum LTV for value-add multifamily?",
    a: "For value-add properties, we go up to 80% of the total project cost (LTC). For stabilized assets, the maximum LTV is 75%. Properties with 20+ units are evaluated on an individual basis with negotiated terms.",
  },
  {
    q: "Do you lend on mixed-use properties?",
    a: "Yes. We lend on mixed-use properties where the majority of the income and value is derived from the residential component. Properties with significant commercial tenants may require additional review and may have adjusted LTV requirements.",
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function MultifamilyLoansPage() {
  const schemaData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "FAQPage",
        "mainEntity": [
          {
            "@type": "Question",
            "name": "What is the minimum number of units to qualify for a multifamily loan?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Our multifamily loan program requires a minimum of 5 residential units. Properties with 2–4 units may qualify under our DSCR rental loan program instead.",
            },
          },
          {
            "@type": "Question",
            "name": "Do you offer non-recourse multifamily loans?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Yes. Non-recourse options are available for stabilized assets and qualified borrowers. Non-recourse loans typically require a stronger LTV, higher net worth, and a demonstrated track record. Talk to a loan officer to discuss eligibility.",
            },
          },
          {
            "@type": "Question",
            "name": "Can I do interest-only payments on a multifamily loan?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Yes. Interest-only periods are available on both bridge and term loan structures, subject to underwriting approval. This can significantly improve cash flow during the hold period.",
            },
          },
          {
            "@type": "Question",
            "name": "What is the maximum LTV for value-add multifamily?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "For value-add properties, we go up to 80% of the total project cost (LTC). For stabilized assets, the maximum LTV is 75%. Properties with 20+ units are evaluated on an individual basis with negotiated terms.",
            },
          },
          {
            "@type": "Question",
            "name": "Do you lend on mixed-use properties?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Yes. We lend on mixed-use properties where the majority of the income and value is derived from the residential component. Properties with significant commercial tenants may require additional review and may have adjusted LTV requirements.",
            },
          },
        ],
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.fundedcapital.com" },
          { "@type": "ListItem", "position": 2, "name": "Loan Programs", "item": "https://www.fundedcapital.com/loan-programs" },
          { "@type": "ListItem", "position": 3, "name": "Multifamily Loans", "item": "https://www.fundedcapital.com/multifamily-loans" },
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
              Multifamily Loans — Nationwide
            </div>
            <h1
              id="hero-heading"
              className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight"
            >
              Multifamily Loans —{" "}
              <span className="text-gold-500">Bridge &amp; Term</span> Financing for 5+ Units
            </h1>
            <p className="mt-6 text-lg text-slate-300 leading-relaxed max-w-2xl">
              Scale your multifamily portfolio with flexible bridge loans for
              value-add execution and long-term financing for stabilized assets.
              We lend where conventional banks won&apos;t.
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
              {["5+ units", "Recourse & non-recourse", "Interest-only available", "Value-add & stabilized"].map((item) => (
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
      <section className="bg-navy-800 border-b border-navy-700" aria-label="Multifamily loan highlights">
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

      {/* ── Loan Types ────────────────────────────────────────────────────── */}
      <section className="section-padding bg-slate-50" aria-labelledby="loan-types-heading">
        <div className="section-container">
          <div className="text-center mb-12">
            <p className="section-label">Loan Structures</p>
            <h2 id="loan-types-heading" className="section-heading">
              Bridge Loans vs. Term Loans
            </h2>
            <p className="section-sub max-w-2xl mx-auto">
              We offer two core structures to match your investment strategy — short-term
              bridge capital for execution and long-term term loans for stabilized assets.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {loanTypes.map((type) => {
              const Icon = type.icon;
              return (
                <article key={type.title} className="card flex flex-col gap-4">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-gold-500/10 rounded-xl shrink-0">
                      <Icon size={24} className="text-gold-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-navy-900 text-xl">{type.title}</h3>
                      <p className="text-gold-600 font-medium text-sm mt-0.5">{type.subtitle}</p>
                    </div>
                  </div>
                  <p className="text-slate-600 text-sm leading-relaxed">{type.desc}</p>
                  <ul className="flex flex-col gap-2 mt-2">
                    {type.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-slate-700">
                        <CheckCircle2 size={15} className="text-gold-500 shrink-0 mt-0.5" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto pt-4">
                    <Link href="/apply" className="btn-primary text-sm w-full justify-center">
                      Apply Now
                      <ArrowRight size={14} />
                    </Link>
                  </div>
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
            <h2 id="rates-heading" className="section-heading">Multifamily Loan Rates</h2>
            <p className="section-sub max-w-xl mx-auto">
              Competitive rates for stabilized and value-add multifamily across all market types.
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
              * Rates and terms are indicative and subject to change. Final terms depend on asset type, deal specifics, and borrower profile.
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

      {/* ── Asset Types ───────────────────────────────────────────────────── */}
      <section className="section-padding bg-slate-50" aria-labelledby="assets-heading">
        <div className="section-container">
          <div className="text-center mb-12">
            <p className="section-label">What We Finance</p>
            <h2 id="assets-heading" className="section-heading">
              Asset Types We Lend On
            </h2>
            <p className="section-sub max-w-2xl mx-auto">
              From small apartment buildings to mixed-use and niche housing, our multifamily
              lending covers a broad range of asset types.
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
              Multifamily Loan Questions Answered
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
            Scale Your Multifamily Portfolio
          </h2>
          <p className="text-slate-400 text-lg mt-4 max-w-xl mx-auto">
            Apply in minutes. Our multifamily specialists will review your deal and
            issue a term sheet within 2 hours.
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
