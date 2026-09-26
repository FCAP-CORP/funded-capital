import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { COMPLIANCE, STATS } from "@/lib/site/facts";
import { ArrowLink, Eyebrow, Ledger, Section, SectionHead } from "@/components/site/ui";

export const metadata: Metadata = {
  title: "Why Choose Funded Capital — Speed, Transparency & Competitive Rates",
  description:
    "See how Funded Capital compares to traditional banks and other hard money lenders. Term sheets in 2 hours, closings in 5–10 business days, transparent fees — every time.",
};

/*
 * Why us ("Ledger", 25 Sep 2026).
 *
 * PERFORMANCE: server component, no client JavaScript, no images. The
 * comparison is a real <table>, so it paints as text and scrolls sideways on
 * a phone instead of reflowing into cards.
 *
 * CONVERSION: the hero puts the numbers that decide a lender (term sheet,
 * close, loan size) on the first screen, then the side-by-side table answers
 * "why not my bank?" before the visitor has to ask it.
 */

const differentiators = [
  {
    title: "Speed that wins deals",
    desc: `The market moves fast and so do we. A written term sheet in ${STATS.termSheet} on average and a close in ${STATS.close}, so you never lose a deal to slow capital.`,
    stat: "2 hrs",
    statLabel: "average to term sheet",
  },
  {
    title: "Total transparency",
    desc: "Rates, fees and guidelines are published up front. Your term sheet is your contract, with no surprises at the closing table.",
    stat: "0",
    statLabel: "hidden fees",
  },
  {
    title: "Competitive pricing",
    desc: "Private lending does not have to mean predatory rates. Our institutional capital base lets us price competitively with the flexibility and speed of a private lender.",
    stat: "from 6.0%",
    statLabel: "rates starting from",
  },
  {
    title: "One loan officer, start to close",
    desc: "The same loan officer from application to closing. They know your deal, answer your calls and argue your file internally. Not a call center.",
    stat: "1",
    statLabel: "point of contact",
  },
  {
    title: "Clear communication",
    desc: "Regular status updates, and a loan officer you can reach by phone or email. When we need something, we ask once, not in waves.",
    stat: "< 2 hrs",
    statLabel: "typical response time",
  },
  {
    title: "Nationwide reach",
    desc: `We lend in ${STATS.states} states with a working knowledge of local markets, whether you invest in Miami or Minneapolis.`,
    stat: STATS.states,
    statLabel: "states",
  },
];

const comparison = {
  headers: ["Funded Capital", "Traditional banks", "Other hard money"],
  rows: [
    ["Term sheet time", `${STATS.termSheet} on average`, "Days to weeks", "1–3 days"],
    ["Closing time", STATS.close, "30–60 days", "10–21 days"],
    ["Income verification", "Not required (most programs)", "Required", "Varies"],
    ["Entity borrowing", "Yes", "Limited", "Sometimes"],
    ["Dedicated loan officer", "Always", "Rarely", "Sometimes"],
    ["Transparent fees", "Full disclosure up front", "Sometimes", "Rarely"],
    ["Credit flexibility", "660+ (most programs)", "700+ required", "600+"],
  ],
};

// Client reviews, quoted verbatim.
const testimonials = [
  {
    quote:
      "Funded Capital made the process seamless. I submitted my application and had a term sheet within hours. They closed on time and kept me informed every step of the way. Highly recommend!",
    name: "Carlos M.",
    role: "Real Estate Investor, Miami FL",
  },
  {
    quote:
      "As a broker, finding a reliable hard money lender is everything. Funded Capital delivers every single time — fast approvals, transparent terms, and they actually answer the phone. My go-to lender.",
    name: "Sandra L.",
    role: "Mortgage Broker, Miami FL",
  },
  {
    quote:
      "I've done multiple deals with Funded Capital and they never disappoint. The team is professional, responsive, and the rates are competitive. Will continue to use them for all my investment properties.",
    name: "David R.",
    role: "Fix & Flip Investor, South Florida",
  },
];

export default function WhyUsPage() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section aria-labelledby="why-heading" className="bg-deep text-bone on-deep">
        <div className="section-container grid gap-12 py-16 lg:grid-cols-12 lg:gap-6 lg:py-24">
          <div className="flex flex-col gap-6 lg:col-span-7">
            <nav aria-label="Breadcrumb" className="font-figure text-[13px] text-[#A9B3C2]">
              <ol className="flex flex-wrap gap-2">
                <li>
                  <Link href="/" className="hover:text-bone">Home</Link>
                </li>
                <li aria-hidden="true">/</li>
                <li aria-current="page" className="text-brass-300">Why us</li>
              </ol>
            </nav>
            <Eyebrow onDeep>Why Funded Capital</Eyebrow>
            <h1 id="why-heading" className="text-5xl leading-[0.98] sm:text-6xl lg:text-[80px]">
              The lender that actually delivers.
            </h1>
            <p className="font-headline text-2xl font-medium text-brass-300 sm:text-[28px]">
              Chosen on speed, transparency and follow-through.
            </p>
            <p className="max-w-xl text-lg leading-relaxed text-[#C9D1DD]">
              Investors don&apos;t choose us because we&apos;re the only option. They choose us because we beat the
              alternatives on the things that decide a deal: how fast the terms arrive, whether they hold, and whether
              someone answers the phone.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/apply" className="btn-primary text-base">
                Get a term sheet <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <Link href="/how-it-works" className="btn-secondary text-base">
                See how it works
              </Link>
            </div>
          </div>
          <aside aria-label="At a glance" className="self-start border border-bone/20 lg:col-span-4 lg:col-start-9 lg:mt-10">
            <p className="border-b border-bone/20 px-6 py-4 font-figure text-xs tracking-[0.12em] text-brass-300">AT A GLANCE</p>
            <Ledger
              onDeep
              className="px-6 py-1"
              rows={[
                { label: "Term sheet", value: `${STATS.termSheet} on average` },
                { label: "Close", value: STATS.close },
                { label: "Loan size", value: STATS.loanSizes },
                { label: "Funded", value: STATS.funded },
                { label: "States", value: STATS.states },
              ]}
            />
          </aside>
        </div>
      </section>

      {/* ── Differentiators ──────────────────────────────────────────── */}
      <Section labelledBy="edge-heading">
        <SectionHead eyebrow="01 — Our edge" id="edge-heading" title="What sets us apart." />
        <ul className="grid gap-x-6 gap-y-10 md:grid-cols-2 lg:grid-cols-3">
          {differentiators.map((d) => (
            <li key={d.title} className="flex flex-col gap-3 border-t-2 border-deep pt-6">
              <p className="flex items-baseline justify-between gap-4">
                <span className="font-figure text-2xl text-deep">{d.stat}</span>
                <span className="font-figure text-xs uppercase tracking-[0.1em] text-brass-700">{d.statLabel}</span>
              </p>
              <h3 className="text-2xl leading-tight">{d.title}</h3>
              <p className="text-[17px] leading-relaxed text-deep-muted">{d.desc}</p>
            </li>
          ))}
        </ul>
      </Section>

      {/* ── Comparison ───────────────────────────────────────────────── */}
      <Section tone="linen" labelledBy="compare-heading">
        <SectionHead
          eyebrow="02 — Side by side"
          id="compare-heading"
          title="How we stack up."
          intro="Funded Capital against a traditional bank and a typical hard money lender, on the terms that decide whether you close."
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-left text-[15px] sm:text-base">
            <caption className="sr-only">Funded Capital compared with traditional banks and other hard money lenders</caption>
            <thead>
              <tr className="border-b-2 border-deep font-figure text-xs uppercase tracking-[0.1em]">
                <th scope="col" className="py-4 pr-4 font-normal">
                  <span className="sr-only">Term</span>
                </th>
                {comparison.headers.map((h, i) => (
                  <th
                    key={h}
                    scope="col"
                    className={`py-4 pr-4 font-semibold ${i === 0 ? "bg-deep px-4 text-brass-300" : "text-deep"}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparison.rows.map(([label, ...cells]) => (
                <tr key={label} className="border-b border-rule">
                  <th scope="row" className="py-4 pr-4 font-headline text-lg font-semibold">
                    {label}
                  </th>
                  {cells.map((cell, j) => (
                    <td
                      key={j}
                      className={`py-4 pr-4 font-figure ${j === 0 ? "bg-paper px-4 font-semibold text-deep" : "text-deep-muted"}`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-6 text-sm text-deep-muted">Typical timelines and ranges, not quotes. {COMPLIANCE}</p>
      </Section>

      {/* ── Testimonials ─────────────────────────────────────────────── */}
      <Section labelledBy="reviews-heading">
        <SectionHead
          eyebrow="03 — Google reviews"
          id="reviews-heading"
          title="What our clients say."
          action={<ArrowLink href="/apply">Start your application</ArrowLink>}
        />
        <ul className="grid gap-10 md:grid-cols-3 md:gap-6">
          {testimonials.map((t) => (
            <li key={t.name}>
              <figure className="flex h-full flex-col gap-5 border-t-2 border-deep pt-6">
                <p className="font-figure text-xs tracking-[0.1em] text-brass-700">
                  <span aria-hidden="true">5 / 5</span>
                  <span className="sr-only">Rated 5 out of 5</span>
                </p>
                <blockquote className="font-headline text-xl font-medium leading-snug text-deep">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>
                <figcaption className="mt-auto border-t border-rule pt-4">
                  <span className="block font-semibold">{t.name}</span>
                  <span className="block text-sm text-deep-muted">{t.role}</span>
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
