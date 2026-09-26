import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { COMPANY, STATS } from "@/lib/site/facts";
import { CtaPanel, Eyebrow, Faq, Ledger, Section, SectionHead } from "@/components/site/ui";

export const metadata: Metadata = {
  title: "How Our Private Loan Process Works — From Application to Funded in 5–10 Business Days",
  description:
    "Funded Capital's 5-step loan process: apply in 5 minutes, get a term sheet in 2 hours, close in 5–10 business days. No income verification for most programs.",
};

/*
 * How it works ("Ledger", 25 Sep 2026).
 *
 * PERFORMANCE: server component, no client JavaScript. FAQ answers use native
 * <details>, so expanding them costs nothing.
 *
 * CONVERSION: each step pairs "what happens" with "what you'll need", so an
 * investor can have the documents ready before they apply. The timeline in
 * the hero Ledger answers "how long?" on the first screen.
 */

const steps = [
  {
    n: "01",
    title: "Submit your application",
    desc: "Complete the online form in under 5 minutes. Tell us about the property, the deal structure and your experience. No tax returns or pay stubs for most programs.",
    details: [
      "Property address and type",
      "Purchase price or current value",
      "Loan amount requested",
      "Your real estate experience",
      "Exit strategy",
    ],
  },
  {
    n: "02",
    title: "Receive a preliminary term sheet",
    desc: `In ${STATS.termSheet} on average, a loan officer reviews your file and issues a preliminary term sheet with your rate, leverage, points and estimated closing date.`,
    details: [
      "No commitment required to receive a term sheet",
      "Clear, itemized fee disclosure",
      "Estimated closing timeline",
      "List of required documents",
    ],
  },
  {
    n: "03",
    title: "Submit your documents",
    desc: "Once you accept the terms, we collect a focused set of documents. We don't hold a file waiting on items that don't change the decision.",
    details: [
      "Purchase contract (or draft)",
      "Entity documents (if applicable)",
      "Scope of work and budget (Fix & Flip)",
      "Property photos or inspection",
      "Bank statements (2 months)",
    ],
  },
  {
    n: "04",
    title: "Underwriting and approval",
    desc: "Our in-house underwriting team reviews your file and orders a third-party appraisal or BPO. Most loans receive a final commitment letter within 5–7 business days.",
    details: [
      "In-house appraisal management",
      "Title report review",
      "Borrower and entity verification",
      "Final loan commitment issued",
    ],
  },
  {
    n: "05",
    title: "Close and fund",
    desc: "Funds go to the title company on the day of closing, and you close the deal.",
    details: [
      "Wire same day as closing",
      "Flexible closing scheduling",
      "Post-close support team available",
      `Rehab draws typically funded within ${STATS.drawFunding}`,
    ],
  },
];

const faqs = [
  {
    q: "Do I need to be an experienced investor?",
    a: "No. We work with both experienced investors and first-time borrowers. Your exit strategy, the property, and the deal economics matter most.",
  },
  {
    q: "How fast can you really close?",
    a: "Most deals close in 5–10 business days, depending on title, appraisal, and document turnaround.",
  },
  {
    q: "Is there a minimum credit score?",
    a: "Most programs start at 660+, and the best pricing tiers need 680+. Scores from 640 to 659 are reviewed case by case.",
  },
  {
    q: "Do you charge application fees?",
    a: "No application fees. You'll only incur costs if you move forward — typically an appraisal fee and points at closing.",
  },
  {
    q: "Can I borrow through an LLC or entity?",
    a: "Yes. Most of our borrowers close in an LLC, LP, or other business entity. We encourage it.",
  },
  {
    q: "Do you lend outside your listed states?",
    a: "We lend in 45 states. Contact us to confirm availability in your market.",
  },
];

export default function HowItWorksPage() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section aria-labelledby="process-hero-heading" className="bg-deep text-bone on-deep">
        <div className="section-container grid gap-12 py-16 lg:grid-cols-12 lg:gap-6 lg:py-24">
          <div className="flex flex-col gap-6 lg:col-span-7">
            <nav aria-label="Breadcrumb" className="font-figure text-[13px] text-[#A9B3C2]">
              <ol className="flex flex-wrap gap-2">
                <li>
                  <Link href="/" className="hover:text-bone">Home</Link>
                </li>
                <li aria-hidden="true">/</li>
                <li aria-current="page" className="text-brass-300">How it works</li>
              </ol>
            </nav>
            <Eyebrow onDeep>Our process</Eyebrow>
            <h1 id="process-hero-heading" className="text-5xl leading-[0.98] sm:text-6xl lg:text-[80px]">
              From application to funded, in days.
            </h1>
            <p className="font-headline text-2xl font-medium text-brass-300 sm:text-[28px]">Five steps. No black box.</p>
            <p className="max-w-xl text-lg leading-relaxed text-[#C9D1DD]">
              Serious investors don&apos;t have time to waste. Every step below is built to move fast without cutting
              corners, and you know what we need before we ask for it.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/apply" className="btn-primary text-base">
                Get a term sheet <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <a href={COMPANY.phoneHref} className="btn-secondary font-figure text-base">
                {COMPANY.phone}
              </a>
            </div>
          </div>
          <aside aria-label="Timeline" className="self-start border border-bone/20 lg:col-span-4 lg:col-start-9 lg:mt-10">
            <p className="border-b border-bone/20 px-6 py-4 font-figure text-xs tracking-[0.12em] text-brass-300">TIMELINE</p>
            <Ledger
              onDeep
              className="px-6 py-1"
              rows={[
                { label: "Application", value: "under 5 min" },
                { label: "Term sheet", value: `${STATS.termSheet} on average` },
                { label: "Commitment", value: "5–7 business days" },
                { label: "Close", value: STATS.close },
                { label: "Rehab draws", value: STATS.drawFunding },
              ]}
            />
          </aside>
        </div>
      </section>

      {/* ── Steps ────────────────────────────────────────────────────── */}
      <Section labelledBy="steps-heading">
        <SectionHead eyebrow="01 — The steps" id="steps-heading" title="What happens, and what you'll need." />
        <ol className="border-t-2 border-deep">
          {steps.map((s) => (
            <li
              key={s.n}
              className="grid gap-6 border-b border-rule py-10 lg:grid-cols-12 lg:gap-6 lg:py-12"
            >
              <span className="font-headline text-6xl font-medium leading-none text-brass-500 lg:col-span-2" aria-hidden="true">
                {s.n}
              </span>
              <div className="flex flex-col gap-3 lg:col-span-5">
                <h3 className="text-3xl leading-tight">
                  <span className="sr-only">Step {Number(s.n)}: </span>
                  {s.title}
                </h3>
                <p className="text-[17px] leading-relaxed text-deep-muted">{s.desc}</p>
              </div>
              <div className="border border-rule bg-paper p-6 lg:col-span-5">
                <p className="font-figure text-xs tracking-[0.12em] text-brass-700">WHAT&apos;S NEEDED / WHAT TO EXPECT</p>
                <ul className="mt-3">
                  {s.details.map((d) => (
                    <li key={d} className="border-b border-dashed border-rule py-2.5 text-[15px] last:border-b-0">
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <CtaPanel
        title="Ready to send the deal?"
        body={`Apply in about 5 minutes and get a written term sheet in ${STATS.termSheet} on average.`}
        label="Get a term sheet"
      />

      {/* ── FAQ ──────────────────────────────────────────────────────── */}
      <Section tone="linen" labelledBy="faq-heading">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-6">
          <div className="flex flex-col gap-4 lg:col-span-4">
            <Eyebrow>02 — Common questions</Eyebrow>
            <h2 id="faq-heading" className="text-4xl leading-[1.05] sm:text-5xl">
              Frequently asked questions.
            </h2>
          </div>
          <div className="lg:col-span-8">
            <Faq items={faqs} idPrefix="process-faq" />
          </div>
        </div>
      </Section>
    </>
  );
}
