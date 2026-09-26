import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { STATS } from "@/lib/site/facts";
import { ArrowLink, Eyebrow, Ledger, Section, SectionHead } from "@/components/site/ui";

export const metadata: Metadata = {
  title: "About Funded Capital — Private Real Estate Lender, Miami FL",
  description:
    "Founded in Miami in 2018, Funded Capital has funded $500M+ in private real estate loans nationwide. Learn our story and why investors trust us to close.",
};

/*
 * About ("Ledger", 25 Sep 2026).
 *
 * PERFORMANCE: server component, no client JavaScript, no images. The
 * milestone timeline is a plain ruled list, not a decorative graphic.
 *
 * CONVERSION: trust is what this page sells. The hero Ledger states the
 * track record in figures, the story explains why the process is fast, and
 * the timeline shows the volume grew year over year. One Apply action.
 */

const values = [
  {
    title: "Speed with purpose",
    desc: "We move fast because deals don't wait. Every day of delay costs investors money, so the whole process is built around urgency without giving up quality.",
  },
  {
    title: "Investor-first thinking",
    desc: "We were real estate investors before we became lenders. We built the company we wished existed, one that treats borrowers like partners, not applicants.",
  },
  {
    title: "Transparent by design",
    desc: "No hidden fees. No bait-and-switch. No fine-print surprises. What you see in your term sheet is what you get at the closing table.",
  },
];

const milestones = [
  { year: "2018", event: "Funded Capital founded in Miami, FL" },
  { year: "2019", event: "Crossed $50M in loan originations" },
  { year: "2021", event: "Expanded lending nationwide, launched DSCR program" },
  { year: "2022", event: "Crossed $250M in funded deals" },
  { year: "2024", event: "Launched Broker Program with 200+ active partners" },
  { year: "2025", event: "Surpassed $500M in total loan volume" },
];

export default function AboutPage() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section aria-labelledby="about-heading" className="bg-deep text-bone on-deep">
        <div className="section-container grid gap-12 py-16 lg:grid-cols-12 lg:gap-6 lg:py-24">
          <div className="flex flex-col gap-6 lg:col-span-7">
            <nav aria-label="Breadcrumb" className="font-figure text-[13px] text-[#A9B3C2]">
              <ol className="flex flex-wrap gap-2">
                <li>
                  <Link href="/" className="hover:text-bone">Home</Link>
                </li>
                <li aria-hidden="true">/</li>
                <li aria-current="page" className="text-brass-300">About</li>
              </ol>
            </nav>
            <Eyebrow onDeep>About us</Eyebrow>
            <h1 id="about-heading" className="text-5xl leading-[0.98] sm:text-6xl lg:text-[80px]">
              Built by investors, for investors.
            </h1>
            <p className="font-headline text-2xl font-medium text-brass-300 sm:text-[28px]">Miami, since 2018.</p>
            <p className="max-w-xl text-lg leading-relaxed text-[#C9D1DD]">
              Funded Capital was founded on a simple frustration: getting a private loan was harder than it should be.
              Too slow, too opaque, too transactional. So we built something better.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/apply" className="btn-primary text-base">
                Work with us <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <Link href="/why-us" className="btn-secondary text-base">
                Why investors choose us
              </Link>
            </div>
          </div>
          <aside aria-label="Track record" className="self-start border border-bone/20 lg:col-span-4 lg:col-start-9 lg:mt-10">
            <p className="border-b border-bone/20 px-6 py-4 font-figure text-xs tracking-[0.12em] text-brass-300">TRACK RECORD</p>
            <Ledger
              onDeep
              className="px-6 py-1"
              rows={[
                { label: "Founded", value: "2018, Miami" },
                { label: "Funded", value: STATS.funded },
                { label: "Deals closed", value: STATS.deals },
                { label: "Broker partners", value: STATS.brokers },
                { label: "States", value: STATS.states },
              ]}
            />
          </aside>
        </div>
      </section>

      {/* ── Story + timeline ─────────────────────────────────────────── */}
      <Section labelledBy="story-heading">
        <div className="grid gap-14 lg:grid-cols-12 lg:gap-6">
          <div className="flex flex-col gap-6 lg:col-span-6">
            <Eyebrow>01 — Our story</Eyebrow>
            <h2 id="story-heading" className="text-4xl leading-[1.05] sm:text-5xl lg:text-[56px]">
              We know what it takes to close.
            </h2>
            <div className="flex flex-col gap-5 text-[17px] leading-relaxed text-deep-muted">
              <p>
                Funded Capital was founded in Miami in 2018 by a team of real estate investors who had lived the
                frustration of chasing capital when deals were on the line. We&apos;d lost deals to slow lenders.
                We&apos;d been surprised by fees at closing. We&apos;d dealt with lenders who didn&apos;t return calls.
              </p>
              <p>
                We started Funded Capital to be the lender we always wanted: one that says yes fast, keeps its word on
                terms, and treats every borrower like a long-term partner.
              </p>
              <p>
                Today we&apos;ve funded over $500 million in private real estate loans across {STATS.states} states,
                backing investors on everything from their first flip to 50-unit multifamily acquisitions.
              </p>
            </div>
            <ArrowLink href="/how-it-works">How our process works</ArrowLink>
          </div>

          <div className="lg:col-span-5 lg:col-start-8">
            <h3 className="mb-4 font-figure text-xs font-normal uppercase tracking-[0.14em] text-brass-700">Milestones</h3>
            <ol className="border-t-2 border-deep">
              {milestones.map((m) => (
                <li key={m.year} className="grid grid-cols-[72px_1fr] items-baseline gap-4 border-b border-rule py-5">
                  <span className="font-figure text-lg text-brass-700">{m.year}</span>
                  <span className="text-[17px] leading-snug">{m.event}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </Section>

      {/* ── Values ───────────────────────────────────────────────────── */}
      <Section tone="linen" labelledBy="values-heading">
        <SectionHead
          eyebrow="02 — What we stand for"
          id="values-heading"
          title="Our core values."
          action={<ArrowLink href="/apply">Start your application</ArrowLink>}
        />
        <ol className="grid gap-10 md:grid-cols-3 md:gap-6">
          {values.map((v, i) => (
            <li key={v.title} className="flex flex-col gap-4 border-t-2 border-deep pt-7">
              <span className="font-headline text-6xl font-medium leading-none text-brass-500" aria-hidden="true">
                {i + 1}
              </span>
              <h3 className="text-[28px] leading-tight">{v.title}</h3>
              <p className="text-[17px] leading-relaxed text-deep-muted">{v.desc}</p>
            </li>
          ))}
        </ol>
      </Section>
    </>
  );
}
