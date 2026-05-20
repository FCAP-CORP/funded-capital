import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Target, Heart, Lightbulb } from "lucide-react";

export const metadata: Metadata = {
  title: "About Funded Capital — Private Real Estate Lender, Miami FL",
  description:
    "Founded in Miami in 2018, Funded Capital has funded $500M+ in private real estate loans nationwide. Learn our story and why investors trust us to close.",
};

const values = [
  {
    icon: Target,
    title: "Speed with Purpose",
    desc: "We move fast because deals don't wait. Every day of delay costs investors money — so we built our entire process around urgency without sacrificing quality.",
  },
  {
    icon: Heart,
    title: "Investor-First Thinking",
    desc: "We were real estate investors before we became lenders. We built the company we wished existed — one that treats borrowers like partners, not applicants.",
  },
  {
    icon: Lightbulb,
    title: "Transparent by Design",
    desc: "No hidden fees. No bait-and-switch. No fine print surprises. What you see in your term sheet is what you get at the closing table.",
  },
];

const milestones = [
  { year: "2018", event: "Funded Capital founded in Miami, FL" },
  { year: "2019", event: "Crossed $50M in loan originations" },
  { year: "2021", event: "Expanded to 48 states, launched DSCR program" },
  { year: "2022", event: "Crossed $250M in funded deals" },
  { year: "2024", event: "Launched Broker Program with 200+ active partners" },
  { year: "2025", event: "Surpassed $500M in total loan volume" },
];

export default function AboutPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-navy-900 py-16 lg:py-20">
        <div className="section-container max-w-3xl">
          <p className="section-label">About Us</p>
          <h1 className="text-4xl lg:text-5xl font-bold text-white mt-2">
            Built by Investors, for Investors
          </h1>
          <p className="text-slate-300 text-lg mt-5 leading-relaxed">
            Funded Capital was founded on a simple frustration: getting a private
            loan was harder than it should be. Too slow, too opaque, too
            transactional. So we built something better.
          </p>
        </div>
      </section>

      {/* Story */}
      <section className="section-padding bg-white">
        <div className="section-container">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
            <div>
              <p className="section-label">Our Story</p>
              <h2 className="section-heading">We Know What It Takes to Close</h2>
              <div className="mt-6 flex flex-col gap-4 text-slate-600 leading-relaxed">
                <p>
                  Funded Capital was founded in Miami in 2018 by a team of real
                  estate investors who had lived the frustration of chasing
                  capital when deals were on the line. We&apos;d lost deals to
                  slow lenders. We&apos;d been surprised by fees at closing. We&apos;d
                  dealt with lenders who didn&apos;t return calls.
                </p>
                <p>
                  We started Funded Capital to be the lender we always wanted —
                  one that says yes fast, keeps its word on terms, and treats
                  every borrower like a long-term partner.
                </p>
                <p>
                  Today, we&apos;ve funded over $500 million in private real estate
                  loans across 48 states, supporting investors on everything
                  from their first flip to 50-unit multifamily acquisitions.
                </p>
              </div>
              <Link href="/apply" className="btn-primary mt-8 inline-flex">
                Work with Us
                <ArrowRight size={16} />
              </Link>
            </div>

            {/* Timeline */}
            <div>
              <h3 className="font-bold text-navy-900 text-lg mb-6">
                Our Milestones
              </h3>
              <div className="relative pl-6 border-l-2 border-slate-200 flex flex-col gap-6">
                {milestones.map((m) => (
                  <div key={m.year} className="relative">
                    <div className="absolute -left-[1.65rem] top-1 w-3 h-3 rounded-full bg-gold-500 ring-4 ring-white" />
                    <p className="text-gold-600 font-bold text-sm">{m.year}</p>
                    <p className="text-slate-700 text-sm mt-0.5">{m.event}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="section-padding bg-slate-50">
        <div className="section-container">
          <div className="text-center mb-10">
            <p className="section-label">What We Stand For</p>
            <h2 className="section-heading">Our Core Values</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {values.map((v) => {
              const Icon = v.icon;
              return (
                <article key={v.title} className="card text-center">
                  <div className="inline-flex p-3 bg-gold-500/10 rounded-xl mb-4">
                    <Icon size={22} className="text-gold-600" />
                  </div>
                  <h3 className="font-bold text-navy-900">{v.title}</h3>
                  <p className="text-slate-500 text-sm mt-2 leading-relaxed">{v.desc}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-navy-900 py-14">
        <div className="section-container text-center">
          <h2 className="text-2xl font-bold text-white">Let&apos;s Fund Your Next Deal</h2>
          <p className="text-slate-400 text-sm mt-2">
            Join 1,200+ investors who trust Funded Capital to close fast and deliver on their terms.
          </p>
          <Link href="/apply" className="btn-primary mt-6 inline-flex">
            Apply Now
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </>
  );
}
