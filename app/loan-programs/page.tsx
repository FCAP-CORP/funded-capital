import type { Metadata } from "next";
import Link from "next/link";
import {
  Hammer,
  BarChart3,
  Building2,
  Layers,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Loan Programs",
  description:
    "Explore Funded Capital's private real estate loan programs — Fix & Flip, DSCR, New Construction, and Multifamily. Competitive rates, term sheets in 2 hours.",
};

const programs = [
  {
    id: "fix-flip",
    icon: Hammer,
    title: "Fix & Flip",
    tagline: "Fast capital for value-add acquisitions",
    description:
      "Our Fix & Flip loans are purpose-built for investors who buy, renovate, and sell. We fund the purchase and the rehab — so you can move fast and maximize your spread.",
    highlights: [
      "Up to 90% of purchase price (LTC)",
      "Up to 100% of rehab costs",
      "Rates from 8.75% interest-only",
      "Terms: 12 or 24 months",
      "No income verification required",
      "Credit score: 680+ preferred",
      "Close in as little as 5 business days",
    ],
    table: {
      headers: ["Loan Size", "Max LTC", "Rate", "Points", "Term"],
      rows: [
        ["$75K–$500K", "90% LTC", "From 8.75%", "1.5–2.5", "12–24 mo"],
        ["$500K–$2M", "90% LTC", "From 9.25%", "1.0–2.0", "12–24 mo"],
        ["$2M+", "90% LTC", "Negotiated", "Negotiated", "12–24 mo"],
      ],
    },
    cta: "Apply for Fix & Flip",
  },
  {
    id: "dscr",
    icon: BarChart3,
    title: "DSCR / Rental Loans",
    tagline: "Long-term financing based on the property's cash flow",
    description:
      "DSCR (Debt Service Coverage Ratio) loans qualify on the rental income of the property — not your personal income. Perfect for scaling a rental portfolio without W-2 restrictions.",
    highlights: [
      "Up to 80% LTV (purchase and refi)",
      "Rates from 6.0%",
      "30-year fixed or 30-year partial interest only",
      "DSCR minimum: 1.0x",
      "No personal income verification",
      "SFR, 2–4 units, condos",
      "Unlimited property count",
      "Cash-out available",
    ],
    table: {
      headers: ["Property Type", "Max LTV", "Rate", "DSCR Min", "Term"],
      rows: [
        ["SFR / Condo", "80% LTV", "From 6.0%", "1.0x", "30-yr fixed"],
        ["SFR / Condo", "80% LTV", "From 6.5%", "1.0x", "30-yr partial I/O"],
        ["2–4 Units", "80% LTV", "From 6.25%", "1.05x", "30-yr fixed"],
        ["2–4 Units", "80% LTV", "From 6.75%", "1.05x", "30-yr partial I/O"],
      ],
    },
    cta: "Apply for DSCR Loan",
  },
  {
    id: "construction",
    icon: Building2,
    title: "New Construction",
    tagline: "Ground-up construction financing with draw schedules",
    description:
      "Fund your ground-up development projects with a construction loan structured around your build schedule. We release draws as milestones are hit, minimizing carrying costs.",
    highlights: [
      "Up to 85% of total project cost (LTC)",
      "Rates from 8.75% to 10.25% interest-only",
      "Terms: 12 or 24 months",
      "Draw schedule aligned to milestones",
      "SFR, townhomes, small multifamily",
      "Credit score: 680+ preferred",
      "Experienced builders preferred",
    ],
    table: {
      headers: ["Project Size", "Max LTC", "Rate", "Draws", "Term"],
      rows: [
        ["Up to $1M", "85% LTC", "From 8.75%", "Monthly", "12 mo"],
        ["$1M–$5M", "85% LTC", "From 9.50%", "Milestone", "12–24 mo"],
        ["$5M+", "85% LTC", "From 10.25%", "Negotiated", "Up to 24 mo"],
      ],
    },
    cta: "Apply for Construction Loan",
  },
  {
    id: "multifamily",
    icon: Layers,
    title: "Multifamily",
    tagline: "Bridge and term loans for 5+ unit residential assets",
    description:
      "Scale your multifamily portfolio with flexible bridge or term loans. We lend on stabilized and value-add multifamily assets — from small apartment buildings to larger complexes.",
    highlights: [
      "Up to 75% LTV (stabilized)",
      "Up to 80% LTC (value-add)",
      "Rates from 8.0%",
      "Terms: 1–10 years",
      "5+ residential units",
      "Recourse and non-recourse options",
      "Interest-only available",
      "Credit score: 680+ preferred",
    ],
    table: {
      headers: ["Asset Type", "Max LTV", "Rate", "Points", "Term"],
      rows: [
        ["Stabilized (5–20 units)", "75% LTV", "From 8.0%", "1.0–1.5", "1–10 yrs"],
        ["Value-Add (5–20 units)", "80% LTC", "From 8.75%", "1.5–2.0", "1–10 yrs"],
        ["20+ Units", "70% LTV", "Negotiated", "Negotiated", "Negotiated"],
      ],
    },
    cta: "Apply for Multifamily Loan",
  },
];

export default function LoanProgramsPage() {
  return (
    <>
      {/* Page Hero */}
      <section className="bg-navy-900 py-16 lg:py-20">
        <div className="section-container">
          <p className="section-label">Loan Programs</p>
          <h1 className="text-4xl lg:text-5xl font-bold text-white mt-2 max-w-2xl">
            Capital Solutions for Every Strategy
          </h1>
          <p className="text-slate-300 text-lg mt-4 max-w-2xl leading-relaxed">
            Whether you&apos;re flipping your first property or scaling a
            50-unit portfolio, Funded Capital has the right loan — with the
            speed and terms serious investors demand.
          </p>
          <Link href="/apply" className="btn-primary mt-8 inline-flex">
            Apply Now
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* Program Cards */}
      <section className="section-padding bg-white">
        <div className="section-container">
          <div className="flex flex-col gap-16">
            {programs.map((program) => {
              const Icon = program.icon;
              return (
                <article
                  key={program.id}
                  id={program.id}
                  className="scroll-mt-20"
                >
                  {/* Header */}
                  <div className="flex items-start gap-4 mb-6">
                    <div className="p-3 bg-slate-100 rounded-xl shrink-0">
                      <Icon size={24} className="text-navy-900" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-navy-900">
                        {program.title}
                      </h2>
                      <p className="text-gold-600 font-medium mt-0.5">
                        {program.tagline}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Description + highlights */}
                    <div className="lg:col-span-1">
                      <p className="text-slate-600 leading-relaxed">
                        {program.description}
                      </p>
                      <ul className="mt-5 flex flex-col gap-2">
                        {program.highlights.map((h) => (
                          <li
                            key={h}
                            className="flex items-start gap-2 text-sm text-slate-700"
                          >
                            <CheckCircle2
                              size={15}
                              className="text-gold-500 shrink-0 mt-0.5"
                            />
                            {h}
                          </li>
                        ))}
                      </ul>
                      <Link
                        href="/apply"
                        className="btn-primary mt-6 inline-flex text-sm"
                      >
                        {program.cta}
                        <ArrowRight size={14} />
                      </Link>
                    </div>

                    {/* Rate table */}
                    <div className="lg:col-span-2">
                      <div className="overflow-x-auto rounded-2xl border border-slate-200">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-navy-900">
                              {program.table.headers.map((h) => (
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
                            {program.table.rows.map((row, i) => (
                              <tr
                                key={i}
                                className={
                                  i % 2 === 0 ? "bg-white" : "bg-slate-50"
                                }
                              >
                                {row.map((cell, j) => (
                                  <td
                                    key={j}
                                    className={`px-4 py-3.5 text-slate-700 ${
                                      j === 2
                                        ? "font-semibold text-gold-600"
                                        : ""
                                    }`}
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
                        * Rates and terms are indicative and subject to change.
                        Final terms depend on deal specifics and borrower profile.
                      </p>
                    </div>
                  </div>

                  <hr className="mt-12 border-slate-100" />
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="bg-slate-50 py-14">
        <div className="section-container text-center">
          <h2 className="text-2xl font-bold text-navy-900">
            Not sure which program fits?
          </h2>
          <p className="text-slate-500 mt-3">
            Talk to a loan officer — we&apos;ll help you structure the right deal.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/apply" className="btn-primary">
              Apply Now
              <ArrowRight size={16} />
            </Link>
            <Link href="/contact" className="btn-secondary">
              Speak with a Loan Officer
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
