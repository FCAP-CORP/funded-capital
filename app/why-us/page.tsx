import type { Metadata } from "next";
import Link from "next/link";
import {
  Zap,
  Shield,
  TrendingUp,
  Users,
  MessageCircle,
  Globe,
  ArrowRight,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Why Choose Funded Capital — Speed, Transparency & Competitive Rates",
  description:
    "See how Funded Capital compares to traditional banks and other hard money lenders. Term sheets in 2 hours, closings in 5 days, transparent fees — every time.",
};

const differentiators = [
  {
    icon: Zap,
    title: "Speed That Wins Deals",
    desc: "The real estate market moves fast. We move faster. Our streamlined underwriting delivers term sheets in 2 hours and closings in as little as 5 business days — so you never lose a deal to slow capital.",
    stat: "2 hrs",
    statLabel: "Term sheet turnaround",
  },
  {
    icon: Shield,
    title: "Total Transparency",
    desc: "We publish our rates, fees, and guidelines upfront. Your term sheet is your contract — no surprises at the closing table. We earn your trust before we earn your business.",
    stat: "0",
    statLabel: "Hidden fees",
  },
  {
    icon: TrendingUp,
    title: "Competitive Pricing",
    desc: "Private lending doesn't have to mean predatory rates. Our institutional capital base allows us to price deals competitively while maintaining the flexibility and speed of a private lender.",
    stat: "From 6.0%",
    statLabel: "Rates starting from",
  },
  {
    icon: Users,
    title: "Dedicated Loan Officers",
    desc: "You'll work with the same loan officer from application to closing. They know your deal, answer your calls, and advocate for you internally. Not a call center — a real relationship.",
    stat: "1 point of contact",
    statLabel: "Throughout your loan",
  },
  {
    icon: MessageCircle,
    title: "Clear Communication",
    desc: "We'll never ghost you. You'll receive regular status updates, and your loan officer is reachable by phone or email. When we need something, we ask once — not in waves.",
    stat: "< 2 hrs",
    statLabel: "Response time guarantee",
  },
  {
    icon: Globe,
    title: "Nationwide Reach",
    desc: "We lend in 44 states with a deep understanding of local markets. Whether you're investing in Miami or Minneapolis, we have the knowledge and licensing to close your deal.",
    stat: "44 states",
    statLabel: "Nationwide coverage",
  },
];

const comparison = {
  headers: ["", "Funded Capital", "Traditional Banks", "Other Hard Money"],
  rows: [
    ["Term Sheet Time", "2 hours", "Days to weeks", "1–3 days"],
    ["Closing Time", "5–10 days", "30–60 days", "10–21 days"],
    ["Income Verification", "Not required (most programs)", "Required", "Varies"],
    ["Entity Borrowing", "Yes", "Limited", "Sometimes"],
    ["Dedicated Loan Officer", "Always", "Rarely", "Sometimes"],
    ["Transparent Fees", "Full disclosure upfront", "Sometimes", "Rarely"],
    ["Credit Flexibility", "680+ preferred", "700+ required", "600+"],
  ],
};

const testimonials = [
  {
    quote:
      "Funded Capital made the process seamless. I submitted my application and had a term sheet within hours. They closed on time and kept me informed every step of the way. Highly recommend!",
    name: "Carlos M.",
    role: "Real Estate Investor, Miami FL",
    stars: 5,
  },
  {
    quote:
      "As a broker, finding a reliable hard money lender is everything. Funded Capital delivers every single time — fast approvals, transparent terms, and they actually answer the phone. My go-to lender.",
    name: "Sandra L.",
    role: "Mortgage Broker, Miami FL",
    stars: 5,
  },
  {
    quote:
      "I've done multiple deals with Funded Capital and they never disappoint. The team is professional, responsive, and the rates are competitive. Will continue to use them for all my investment properties.",
    name: "David R.",
    role: "Fix & Flip Investor, South Florida",
    stars: 5,
  },
];

export default function WhyUsPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-navy-900 py-16 lg:py-20">
        <div className="section-container max-w-3xl">
          <p className="section-label">Why Funded Capital</p>
          <h1 className="text-4xl lg:text-5xl font-bold text-white mt-2">
            The Lender That Actually Delivers
          </h1>
          <p className="text-slate-300 text-lg mt-5 leading-relaxed">
            Investors don&apos;t choose us because we&apos;re the only option. They choose us
            because we outperform every alternative on speed, transparency, and
            follow-through — every single time.
          </p>
        </div>
      </section>

      {/* Differentiators */}
      <section className="section-padding bg-white">
        <div className="section-container">
          <div className="text-center mb-12">
            <p className="section-label">Our Edge</p>
            <h2 className="section-heading">What Sets Us Apart</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {differentiators.map((d) => {
              const Icon = d.icon;
              return (
                <article key={d.title} className="card flex flex-col gap-4">
                  <div className="flex items-start justify-between">
                    <div className="p-2.5 bg-gold-500/10 rounded-xl">
                      <Icon size={20} className="text-gold-600" />
                    </div>
                    <div className="text-right">
                      <p className="text-gold-500 font-bold text-lg">{d.stat}</p>
                      <p className="text-slate-400 text-xs">{d.statLabel}</p>
                    </div>
                  </div>
                  <div>
                    <h3 className="font-bold text-navy-900">{d.title}</h3>
                    <p className="text-slate-500 text-sm mt-2 leading-relaxed">{d.desc}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* Comparison Table */}
      <section className="section-padding bg-slate-50">
        <div className="section-container">
          <div className="text-center mb-10">
            <p className="section-label">Side by Side</p>
            <h2 className="section-heading">How We Stack Up</h2>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-navy-900">
                  {comparison.headers.map((h, i) => (
                    <th
                      key={h || i}
                      className={`px-5 py-4 text-left font-semibold text-xs uppercase tracking-wider ${
                        i === 1 ? "text-gold-400" : "text-slate-300"
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparison.rows.map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                    {row.map((cell, j) => (
                      <td
                        key={j}
                        className={`px-5 py-4 ${
                          j === 0
                            ? "font-semibold text-navy-900"
                            : j === 1
                            ? "text-green-700 font-medium"
                            : "text-slate-500"
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
        </div>
      </section>

      {/* Testimonials */}
      <section className="section-padding bg-white">
        <div className="section-container">
          <div className="text-center mb-10">
            <p className="section-label">Google Reviews</p>
            <h2 className="section-heading">What Our Clients Say</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((t) => (
              <article key={t.name} className="card flex flex-col gap-4">
                <div className="flex gap-1">
                  {[...Array(t.stars)].map((_, i) => (
                    <span key={i} className="text-gold-500 text-sm">★</span>
                  ))}
                </div>
                <p className="text-slate-600 text-sm leading-relaxed italic">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div className="mt-auto">
                  <p className="font-bold text-navy-900 text-sm">{t.name}</p>
                  <p className="text-slate-400 text-xs">{t.role}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gold-500 py-14">
        <div className="section-container text-center">
          <h2 className="text-2xl font-bold text-navy-900">
            Experience the Difference Yourself
          </h2>
          <p className="text-navy-800 text-sm mt-2">
            Apply today. Get a term sheet within 2 hours. No obligation, no fees.
          </p>
          <Link
            href="/apply"
            className="inline-flex items-center gap-2 mt-6 bg-navy-900 hover:bg-navy-800 text-white font-semibold px-8 py-4 rounded-xl transition-colors"
          >
            Apply Now
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </>
  );
}
