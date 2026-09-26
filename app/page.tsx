import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getAllPosts } from "@/lib/blog";
import { COMPLIANCE, PROGRAMS, STATS } from "@/lib/site/facts";
import { StepsMark } from "@/components/site/Logo";
import { ArrowLink, Eyebrow, Ledger, Section, SectionHead } from "@/components/site/ui";
import { HomePhotoBand } from "@/components/site/HomePhotoBand";

export const metadata: Metadata = {
  title: "Funded Capital | Private Real Estate Lender — Fast, Flexible Loans",
  description:
    "Private real estate loans for investors and brokers: fix & flip, DSCR, ground-up and multifamily. $75K–$5M in 45 states. Term sheet in 2 hours on average; close in 5–10 business days.",
};

/*
 * Home ("Ledger", 25 Sep 2026).
 *
 * PERFORMANCE: a server component with no client JavaScript of its own and no
 * hero photograph. The largest paint is the headline text, which renders from
 * self-hosted fonts with metric-matched fallbacks, so there is no image to
 * wait for and no layout shift when the fonts arrive.
 *
 * CONVERSION: the hero answers the three questions an investor has on landing
 * (do you lend on this, how much, how fast) with a term-sheet card before any
 * scrolling. One brass action per screen: Get a term sheet. Price a deal is
 * the second path for visitors not ready to apply.
 */

const steps = [
  { n: "1", title: "Send the deal", body: "Address, price, rehab budget and your exit. Two minutes, no credit pull to start." },
  { n: "2", title: "Get real terms", body: `A written term sheet in about ${STATS.termSheet} on average, from a person who can explain every line.` },
  { n: "3", title: "Close", body: `Appraisal, title and insurance run in parallel. Typical close: ${STATS.close}.` },
];

const brokerPoints = [
  { title: "Instant pricing in your portal", body: "The rate ladder, live, for every file you submit." },
  { title: "Term sheets under your name", body: "Your logo on the page your client reads." },
  { title: "Paid at closing", body: "0.5%–3% per closed loan, across every program." },
];

export default function HomePage() {
  const posts = getAllPosts().slice(0, 3);
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
          "Funded Capital provides fast private real estate loans for investors and brokers. Fix & Flip, DSCR, New Construction, and Multifamily loans. Term sheets in 2 hours, closings in 5–10 business days.",
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaData) }} />

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section aria-labelledby="hero-heading" className="relative overflow-hidden bg-deep text-bone on-deep">
        <StepsMark className="pointer-events-none absolute -bottom-10 -right-24 hidden h-[420px] w-[620px] opacity-[0.06] lg:block" />
        <div className="section-container relative grid gap-12 py-16 lg:grid-cols-12 lg:gap-6 lg:py-28">
          <div className="flex flex-col gap-7 lg:col-span-7">
            <Eyebrow onDeep>Private lending · Real estate investors · {STATS.states} states</Eyebrow>
            <h1 id="hero-heading" className="text-[52px] leading-[0.98] sm:text-7xl lg:text-[96px] lg:tracking-[-0.03em]">
              We fund where <span className="text-brass-300">banks</span> won’t.
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-[#C9D1DD] sm:text-xl">
              Asset-based loans from $75K to $5M for fix &amp; flip, DSCR rentals, ground-up and multifamily. We
              underwrite the deal and the operator, not your W-2, and close in {STATS.close}.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/apply" className="btn-primary text-base sm:text-[17px]">
                Get a term sheet <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <Link href="/calculator" className="btn-secondary text-base sm:text-[17px]">
                Price a deal in 5 minutes
              </Link>
            </div>
          </div>

          <aside aria-label="Fix and flip at a glance" className="self-start bg-bone text-deep shadow-[0_30px_80px_rgba(0,0,0,0.35)] lg:col-span-4 lg:col-start-9 lg:mt-6">
            <div className="flex items-baseline justify-between border-b border-rule px-6 py-5">
              <p className="font-headline text-2xl font-semibold">Deal snapshot</p>
              <p className="font-figure text-xs tracking-[0.1em] text-deep-soft">FIX &amp; FLIP</p>
            </div>
            <Ledger
              className="px-6 py-1"
              rows={[
                { label: "Rate", value: "from 8.75%" },
                { label: "Leverage", value: "up to 90% of cost" },
                { label: "Loan size", value: STATS.loanSizes },
                { label: "Credit", value: "660+ most programs" },
                { label: "Close", value: STATS.close },
              ]}
            />
            <p className="bg-linen px-6 py-4 text-xs leading-relaxed text-deep-soft">Ranges, not quotes. {COMPLIANCE}</p>
          </aside>
        </div>
      </section>

      {/* ── Proof strip ──────────────────────────────────────────────── */}
      <section aria-label="Funded Capital at a glance" className="bg-deep-2 text-bone">
        <dl className="section-container grid grid-cols-2 gap-y-8 py-10 lg:grid-cols-5">
          {[
            { v: STATS.funded, l: "funded" },
            { v: STATS.deals, l: "deals closed" },
            { v: STATS.termSheet.replace(" hours", " hrs"), l: "average to term sheet" },
            { v: "5–10", l: "business days to close" },
            { v: STATS.states, l: `states · not ${STATS.excludedStates}` },
          ].map((s) => (
            <div key={s.l} className="flex flex-col-reverse gap-1 border-l border-bone/20 pl-5">
              <dt className="text-[13px] text-[#A9B3C2]">{s.l}</dt>
              <dd className="m-0 font-headline text-3xl font-semibold lg:text-[34px]">{s.v}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ── Photo band (the site's only photograph) ─────────────────── */}
      <HomePhotoBand />

      {/* ── Programs ─────────────────────────────────────────────────── */}
      <Section labelledBy="programs-heading">
        <SectionHead
          eyebrow="01 — Loan programs"
          id="programs-heading"
          title="Four ways to fund the deal in front of you."
          action={<ArrowLink href="/loan-programs">Compare every program</ArrowLink>}
        />
        <ul className="border-t-2 border-deep">
          {PROGRAMS.map((p, i) => (
            <li key={p.href} className="border-b border-rule">
              <Link
                href={p.href}
                className="group grid gap-2 py-7 sm:grid-cols-[64px_1fr] lg:grid-cols-[80px_minmax(0,1fr)_minmax(0,1.3fr)_40px] lg:items-center lg:gap-6 lg:py-9"
              >
                <span className="font-figure text-sm text-brass-700">{String(i + 1).padStart(2, "0")}</span>
                <span className="font-headline text-3xl font-semibold sm:text-4xl lg:text-[44px] group-hover:text-brass-700 transition-colors">
                  {p.name}
                </span>
                <span className="flex flex-col gap-1.5 sm:col-start-2 lg:col-start-auto">
                  <span className="text-[17px] text-deep-muted">{p.pitch}</span>
                  <span className="font-figure text-sm">{p.figures}</span>
                </span>
                <ArrowRight aria-hidden="true" className="hidden h-7 w-7 transition-transform group-hover:translate-x-1 lg:block" />
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      {/* ── How it works ─────────────────────────────────────────────── */}
      <Section tone="linen" labelledBy="process-heading">
        <SectionHead
          eyebrow="02 — How it works"
          id="process-heading"
          title="Three steps. No black box."
          action={<ArrowLink href="/how-it-works">The full process</ArrowLink>}
        />
        <ol className="grid gap-10 md:grid-cols-3 md:gap-6">
          {steps.map((s) => (
            <li key={s.n} className="flex flex-col gap-4 border-t-2 border-deep pt-7">
              <span className="font-headline text-6xl font-medium leading-none text-brass-500" aria-hidden="true">
                {s.n}
              </span>
              <h3 className="text-[28px] leading-tight">{s.title}</h3>
              <p className="text-[17px] leading-relaxed text-deep-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* ── Calculator ───────────────────────────────────────────────── */}
      <Section labelledBy="calc-heading">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-6">
          <div className="flex flex-col gap-5 lg:col-span-5">
            <Eyebrow>03 — Price a deal</Eyebrow>
            <h2 id="calc-heading" className="text-4xl leading-[1.05] sm:text-5xl lg:text-[56px]">
              Run the numbers before you call anyone.
            </h2>
            <p className="text-lg leading-relaxed text-deep-muted">
              Purchase price, rehab budget and after-repair value give you a loan amount, cash to close and monthly
              interest. The same math our underwriters start from.
            </p>
            <Link href="/calculator" className="btn-dark self-start text-base">
              Open the calculator
            </Link>
          </div>
          <div className="grid border border-rule bg-paper sm:grid-cols-2 lg:col-span-6 lg:col-start-7">
            <div className="flex flex-col gap-2 border-b border-rule p-7 sm:border-b-0 sm:border-r">
              <p className="font-figure text-xs tracking-[0.12em] text-brass-700">WHAT YOU ENTER</p>
              <ul className="mt-2 flex flex-col gap-4 text-[17px]">
                <li className="border-b border-dashed border-rule pb-3">Purchase price</li>
                <li className="border-b border-dashed border-rule pb-3">Rehab budget</li>
                <li>After-repair value</li>
              </ul>
            </div>
            <div className="flex flex-col gap-2 bg-deep p-7 text-bone">
              <p className="font-figure text-xs tracking-[0.12em] text-brass-300">WHAT YOU GET</p>
              <ul className="mt-2 flex flex-col gap-4 text-[17px]">
                <li className="border-b border-dashed border-bone/20 pb-3">Loan amount</li>
                <li className="border-b border-dashed border-bone/20 pb-3">Cash to close</li>
                <li>Monthly interest</li>
              </ul>
              <p className="mt-auto pt-6 text-xs leading-relaxed text-[#A9B3C2]">Rate ranges only. Final terms follow underwriting.</p>
            </div>
          </div>
        </div>
      </Section>

      {/* ── Brokers ──────────────────────────────────────────────────── */}
      <Section tone="deep" labelledBy="brokers-heading">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-6">
          <div className="flex flex-col gap-6 lg:col-span-6">
            <Eyebrow onDeep>04 — For brokers</Eyebrow>
            <h2 id="brokers-heading" className="text-4xl leading-[1.05] sm:text-5xl lg:text-[56px]">
              Bring us the deal. Keep the client.
            </h2>
            <p className="text-lg text-[#C9D1DD]">{STATS.brokers} brokers already place investor loans with us.</p>
            <Link href="/broker-program" className="btn-primary self-start text-base">
              Join the broker program
            </Link>
          </div>
          <ul className="lg:col-span-5 lg:col-start-8">
            {brokerPoints.map((b) => (
              <li key={b.title} className="flex flex-col gap-1.5 border-t border-bone/20 py-5 last:border-b">
                <span className="text-lg font-semibold">{b.title}</span>
                <span className="text-[15px] text-[#A9B3C2]">{b.body}</span>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* ── Insights ─────────────────────────────────────────────────── */}
      {posts.length > 0 && (
        <Section labelledBy="insights-heading">
          <SectionHead
            eyebrow="05 — Insights"
            id="insights-heading"
            title="Written by the people who underwrite."
            action={<ArrowLink href="/blog">All articles</ArrowLink>}
          />
          <ul className="grid gap-10 md:grid-cols-3 md:gap-6">
            {posts.map((post) => (
              <li key={post.slug}>
                <Link href={`/blog/${post.slug}`} className="group flex h-full flex-col gap-3 border-t-2 border-deep pt-6">
                  <span className="font-figure text-xs uppercase tracking-[0.1em] text-brass-700">
                    {post.category} · {post.readTime.replace(" read", "")}
                  </span>
                  <span className="font-headline text-2xl font-semibold leading-snug group-hover:text-brass-700 transition-colors">
                    {post.title}
                  </span>
                  <span className="text-[15px] leading-relaxed text-deep-muted line-clamp-3">{post.description}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}
