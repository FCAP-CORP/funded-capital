import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Shield,
  TrendingUp,
  Users,
  Zap,
  Building2,
  Hammer,
  Home,
  BarChart3,
  Layers,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Funded Capital | Private Real Estate Lender — Fast, Flexible Loans",
  description:
    "Funded Capital provides fast private real estate loans for investors and brokers. Fix & Flip, DSCR, New Construction, Multifamily. Apply in minutes. Term sheet in 2 hours.",
};

// ─── Data ────────────────────────────────────────────────────────────────────

const trustStats = [
  { value: "$500M+", label: "Loans Funded" },
  { value: "2 hrs", label: "Avg. Time to Term Sheet" },
  { value: "1,200+", label: "Deals Closed" },
  { value: "44 States", label: "Nationwide Lending" },
];

const loanPrograms = [
  {
    icon: Hammer,
    title: "Fix & Flip",
    ltv: "Up to 90% LTC",
    rate: "From 8.75%",
    term: "12–24 months",
    highlight: true,
  },
  {
    icon: BarChart3,
    title: "DSCR / Rental",
    ltv: "Up to 80% LTV",
    rate: "From 6.0%",
    term: "30-year fixed or P/I",
    highlight: false,
  },
  {
    icon: Building2,
    title: "New Construction",
    ltv: "Up to 85% LTC",
    rate: "From 8.75%",
    term: "12–24 months",
    highlight: false,
  },
  {
    icon: Layers,
    title: "Multifamily",
    ltv: "Up to 75% LTV",
    rate: "From 8.0%",
    term: "1–10 years",
    highlight: false,
  },
];

const steps = [
  {
    step: "01",
    title: "Submit Your Loan Request",
    desc: "Complete our streamlined online application in under 5 minutes.",
  },
  {
    step: "02",
    title: "Receive a Term Sheet",
    desc: "Get a preliminary term sheet within 2 hours — no fluff, no runaround.",
  },
  {
    step: "03",
    title: "Underwriting & Approval",
    desc: "We move fast. Most loans are fully approved within 5–7 business days.",
  },
  {
    step: "04",
    title: "Fund & Close",
    desc: "Loan is disbursed to the title company on the day of closing. You close the deal. We celebrate with you.",
  },
];

const whyUs = [
  {
    icon: Zap,
    title: "Speed That Wins Deals",
    desc: "Term sheet in 2 hours. Closings in as little as 5 days. When timing is everything, we deliver.",
  },
  {
    icon: Shield,
    title: "Transparent Terms",
    desc: "No hidden fees, no bait-and-switch. What you see in the term sheet is what you get at closing.",
  },
  {
    icon: TrendingUp,
    title: "Competitive Rates",
    desc: "Institutional-grade pricing with the flexibility of a private lender. Best of both worlds.",
  },
  {
    icon: Users,
    title: "Relationship Driven",
    desc: "Your dedicated loan officer answers the phone. Real people, real decisions — not a black box.",
  },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function HomePage() {
  const schemaData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": ["Organization", "FinancialService"],
        "@id": "https://www.fundedcapital.com/#organization",
        "name": "Funded Capital",
        "url": "https://www.fundedcapital.com",
        "logo": {
          "@type": "ImageObject",
          "url": "https://www.fundedcapital.com/Original.png",
        },
        "description":
          "Funded Capital provides fast private real estate loans for investors and brokers. Fix & Flip, DSCR, New Construction, and Multifamily loans. Term sheets in 2 hours, closings in as little as 5 days.",
        "telephone": "+13058575620",
        "email": "processing@fundedcapital.com",
        "address": {
          "@type": "PostalAddress",
          "streetAddress": "100 N Biscayne Blvd, Suite 1210",
          "addressLocality": "Miami",
          "addressRegion": "FL",
          "postalCode": "33132",
          "addressCountry": "US",
        },
        "areaServed": { "@type": "Country", "name": "United States" },
        "openingHoursSpecification": [
          {
            "@type": "OpeningHoursSpecification",
            "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
            "opens": "08:00",
            "closes": "18:00",
          },
          {
            "@type": "OpeningHoursSpecification",
            "dayOfWeek": ["Saturday"],
            "opens": "10:00",
            "closes": "14:00",
          },
        ],
        "aggregateRating": {
          "@type": "AggregateRating",
          "ratingValue": "5",
          "reviewCount": "3",
        },
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
      <section className="relative bg-navy-900 overflow-hidden">
        {/* Aerial background photo */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: "url('/hero-aerial.jpg')" }}
          aria-hidden="true"
        />
        {/* Dark navy overlay — keeps text fully readable while image shows through */}
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(135deg, rgba(15,23,42,0.88) 0%, rgba(15,23,42,0.72) 50%, rgba(15,23,42,0.60) 100%)" }}
          aria-hidden="true"
        />
        {/* Gold accent glow top-right */}
        <div
          className="absolute top-0 right-0 w-1/2 h-full opacity-15"
          style={{
            background:
              "radial-gradient(ellipse at top right, #C9A84C 0%, transparent 65%)",
          }}
          aria-hidden="true"
        />

        <div className="section-container relative z-10 py-20 lg:py-28">
          <div className="max-w-3xl">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-navy-800 border border-navy-700 text-gold-500 text-xs font-semibold px-4 py-2 rounded-full mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-gold-500 animate-pulse" />
              Private Lending — Nationwide
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight">
              Fast Capital for{" "}
              <span className="text-gold-500">Real Estate</span>{" "}
              Investors
            </h1>

            <p className="mt-6 text-lg text-slate-300 leading-relaxed max-w-2xl">
              Funded Capital provides institutional-grade private loans for
              fix &amp; flip, DSCR, new construction, and multifamily — with
              term sheets in 2 hours and closings in days, not months.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row gap-4">
              <Link href="/apply" className="btn-primary text-base px-8 py-4">
                Apply Now
                <ArrowRight size={18} />
              </Link>
              <Link
                href="/loan-programs"
                className="btn-secondary text-base px-8 py-4"
              >
                View Loan Programs
              </Link>
            </div>

            {/* Trust signals */}
            <div className="mt-10 flex flex-wrap gap-x-6 gap-y-2">
              {[
                "No upfront fees",
                "680+ credit score",
                "Close in 5 days",
                "Nationwide",
              ].map((item) => (
                <span
                  key={item}
                  className="flex items-center gap-1.5 text-slate-400 text-sm"
                >
                  <CheckCircle2 size={14} className="text-gold-500 shrink-0" />
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Trust Stats Bar ───────────────────────────────────────────────── */}
      <section className="bg-navy-800 border-b border-navy-700" aria-label="Key statistics">
        <div className="section-container py-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 text-center">
            {trustStats.map((stat) => (
              <div key={stat.label}>
                <p className="text-gold-500 font-bold text-2xl lg:text-3xl">
                  {stat.value}
                </p>
                <p className="text-slate-400 text-sm mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Loan Programs Preview ─────────────────────────────────────────── */}
      <section className="section-padding bg-slate-50" aria-labelledby="programs-heading">
        <div className="section-container">
          <div className="text-center mb-12">
            <p className="section-label">What We Offer</p>
            <h2 id="programs-heading" className="section-heading">
              Loan Programs Built for Investors
            </h2>
            <p className="section-sub max-w-2xl mx-auto">
              From single-family flips to large multifamily acquisitions, we have
              the right capital solution for your strategy.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {loanPrograms.map((program) => {
              const Icon = program.icon;
              return (
                <article
                  key={program.title}
                  className={`card flex flex-col gap-4 ${
                    program.highlight
                      ? "border-gold-500 ring-1 ring-gold-500/30"
                      : ""
                  }`}
                >
                  {program.highlight && (
                    <span className="self-start bg-gold-500 text-navy-900 text-xs font-bold px-2.5 py-1 rounded-full">
                      Most Popular
                    </span>
                  )}
                  <div className="p-2.5 bg-slate-100 rounded-xl self-start">
                    <Icon size={20} className="text-navy-900" />
                  </div>
                  <div>
                    <h3 className="font-bold text-navy-900">{program.title}</h3>
                    <ul className="mt-2 flex flex-col gap-1 text-sm text-slate-500">
                      <li>{program.ltv}</li>
                      <li className="text-gold-600 font-semibold">{program.rate}</li>
                      <li>{program.term}</li>
                    </ul>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="text-center mt-8">
            <Link href="/loan-programs" className="btn-primary">
              See All Programs &amp; Rates
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── How It Works ─────────────────────────────────────────────────── */}
      <section className="section-padding bg-white" aria-labelledby="how-heading">
        <div className="section-container">
          <div className="text-center mb-12">
            <p className="section-label">Simple Process</p>
            <h2 id="how-heading" className="section-heading">
              From Application to Funding in 4 Steps
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
                  <h3 className="font-bold text-navy-900 text-lg mt-2">
                    {step.title}
                  </h3>
                  <p className="text-slate-500 text-sm mt-2 leading-relaxed">
                    {step.desc}
                  </p>
                </div>
              </article>
            ))}
          </div>

          <div className="text-center mt-10">
            <Link href="/how-it-works" className="btn-secondary">
              Learn More About Our Process
            </Link>
          </div>
        </div>
      </section>

      {/* ── Why Us ───────────────────────────────────────────────────────── */}
      <section className="section-padding bg-slate-50" aria-labelledby="why-heading">
        <div className="section-container">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <p className="section-label">Why Funded Capital</p>
              <h2 id="why-heading" className="section-heading">
                The Lender Investors Trust to Close
              </h2>
              <p className="section-sub">
                We built Funded Capital for real estate professionals who
                can&apos;t afford to lose a deal to slow underwriting or vague pricing.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Link href="/apply" className="btn-primary">
                  Apply Now
                  <ArrowRight size={16} />
                </Link>
                <Link href="/why-us" className="btn-secondary">
                  Our Story
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {whyUs.map((item) => {
                const Icon = item.icon;
                return (
                  <article key={item.title} className="card">
                    <div className="p-2 bg-gold-500/10 rounded-lg self-start inline-block mb-3">
                      <Icon size={20} className="text-gold-600" />
                    </div>
                    <h3 className="font-bold text-navy-900 text-sm">
                      {item.title}
                    </h3>
                    <p className="text-slate-500 text-sm mt-1 leading-relaxed">
                      {item.desc}
                    </p>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ── Broker CTA Strip ─────────────────────────────────────────────── */}
      <section className="bg-navy-900 py-14" aria-labelledby="broker-cta-heading">
        <div className="section-container flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <p className="section-label">For Brokers</p>
            <h2 id="broker-cta-heading" className="text-2xl font-bold text-white mt-1">
              Partner with Us &amp; Earn More on Every Deal
            </h2>
            <p className="text-slate-400 text-sm mt-2">
              Earn up to 3% per closed loan. Dedicated support and fast closings
              keep your clients coming back.
            </p>
          </div>
          <Link href="/broker-program" className="btn-primary shrink-0">
            Join Our Broker Program
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* ── Apply Now CTA ────────────────────────────────────────────────── */}
      <section className="section-padding bg-white" aria-labelledby="apply-cta-heading">
        <div className="section-container text-center">
          <p className="section-label">Get Funded Fast</p>
          <h2 id="apply-cta-heading" className="section-heading">
            Your Next Deal is One Application Away
          </h2>
          <p className="section-sub max-w-xl mx-auto">
            No commitment required. Get your term sheet within 2 hours and
            know exactly where you stand before you proceed.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/apply" className="btn-primary text-base px-10 py-4">
              Apply Now — It&apos;s Free
              <ArrowRight size={18} />
            </Link>
            <Link href="/contact" className="btn-secondary text-base px-10 py-4">
              <Home size={16} />
              Talk to a Loan Officer
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
