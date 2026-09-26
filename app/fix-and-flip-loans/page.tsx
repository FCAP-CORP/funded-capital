import type { Metadata } from "next";
import Link from "next/link";
import { COMPLIANCE, STATS } from "@/lib/site/facts";
import { Eyebrow, Faq, Section, SectionHead } from "@/components/site/ui";
import { FactorCards, ProgramHero, RateTable, RelatedPrograms, StepList } from "@/components/site/ProgramPage";

export const metadata: Metadata = {
  title: "Fix & Flip Loans — Up to 90% LTC, 5–10 Day Closings | Funded Capital",
  description:
    "Fix & Flip loans up to 90% LTC. No income verification. Rates from 8.75%. Close in 5–10 business days. Apply for your term sheet in 2 hours on average.",
};

/*
 * Fix & Flip ("Ledger", 25 Sep 2026).
 *
 * PERFORMANCE: server component, no client JavaScript, no images. The FAQ
 * uses native <details>, so it opens and closes without any script.
 *
 * CONVERSION: the hero answers "how much, how fast, what rate" in a program
 * terms ledger before any scroll; the pricing table sits one screen below; the
 * draws section removes the main worry of a rehab borrower (how fast do I get
 * my money back). One brass action per screen: Get a term sheet.
 */

// ─── Data ─────────────────────────────────────────────────────────────────────

const factors = [
  { title: "Purchase price", body: "What you pay for the house. We lend a share of it at closing." },
  {
    title: "Rehab budget",
    body: "Your scope of work, line by line. We fund up to 100% of the approved budget, released in draws as the work is inspected.",
  },
  { title: "After-repair value", body: "What the finished house is worth: the number your exit, and our underwriting, rest on." },
];

const benefits = [
  { title: "Speed that wins deals", body: `Term sheet in about ${STATS.termSheet} on average. Close in ${STATS.close}.` },
  { title: "Flexible terms", body: "12 or 24 month terms with interest-only payments, matched to your flip timeline." },
  { title: "No income verification", body: "We qualify on the deal, not your W-2. Self-employed investors and LLCs are welcome." },
  { title: "Rehab costs included", body: "We fund the purchase and up to 100% of your rehab budget, so more of the spread stays yours." },
];

const rateTableHeaders = ["Loan size", "Max LTC", "Rate", "Points", "Term"];
const rateTableRows = [
  ["$75K–$500K", "90% LTC", "from 8.75%", "1.5–2.5", "12–24 mo"],
  ["$500K–$2M", "90% LTC", "from 9.25%", "1.0–2.0", "12–24 mo"],
  ["$2M+", "90% LTC", "Negotiated", "Negotiated", "12–24 mo"],
];

const steps = [
  {
    title: "Submit your loan request",
    body: "Complete the online application in a few minutes. Tell us about the property and the deal.",
  },
  {
    title: "Receive a term sheet",
    body: `A preliminary term sheet in about ${STATS.termSheet} on average. Real numbers you can plan around.`,
  },
  {
    title: "Underwriting and approval",
    body: "Appraisal, title and insurance run in parallel while we underwrite the deal and the exit.",
  },
  {
    title: "Fund and close",
    body: `The loan is disbursed to the title company on closing day. Typical close: ${STATS.close}.`,
  },
];

const draws = [
  { title: "Finish a stage of the work", body: "Complete a line of the scope of work, paid from your own funds." },
  { title: "Request a draw", body: "Send photos of the completed stage. An inspector confirms the work." },
  {
    title: "Get reimbursed",
    body: `Funds for that stage are released, typically within ${STATS.drawFunding}.`,
  },
];

const faqs = [
  {
    q: "What is the maximum LTC for Fix & Flip loans?",
    a: "We lend up to 90% of the combined purchase price and rehab budget (Loan-to-Cost). On the purchase component alone, we go up to 90% of the as-is value. We also fund 100% of rehab costs within that LTC.",
  },
  {
    q: "Do I need income verification or W-2s?",
    a: "No. Funded Capital's Fix & Flip loans are asset-based. We qualify on the deal — the property value, your ARV, and your exit strategy — not your personal income or employment history.",
  },
  {
    q: "How fast can I close?",
    a: "We issue term sheets in about 2 hours on average and close most loans in 5–10 business days, depending on title, appraisal and how quickly documents come back.",
  },
  {
    q: "What credit score do I need?",
    a: "Most programs start at a 660+ credit score, and the best pricing tiers need 680+. Scores from 640 to 659 are reviewed case by case. Talk to a loan officer to discuss your specific situation.",
  },
  {
    q: "Can you fund the rehab costs as well as the purchase?",
    a: "Yes. We fund both the acquisition and up to 100% of your approved rehab budget within the overall 90% LTC cap. Rehab funds are disbursed via a draw schedule as work is completed and inspected.",
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function FixAndFlipLoansPage() {
  const schemaData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "FAQPage",
        "mainEntity": [
          {
            "@type": "Question",
            "name": "What is the maximum LTC for Fix & Flip loans?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "We lend up to 90% of the combined purchase price and rehab budget (Loan-to-Cost). On the purchase component alone, we go up to 90% of the as-is value. We also fund 100% of rehab costs within that LTC.",
            },
          },
          {
            "@type": "Question",
            "name": "Do I need income verification or W-2s for a Fix & Flip loan?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "No. Funded Capital's Fix & Flip loans are asset-based. We qualify on the deal — the property value, your ARV, and your exit strategy — not your personal income or employment history.",
            },
          },
          {
            "@type": "Question",
            "name": "How fast can I close a Fix & Flip loan?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "We issue term sheets in about 2 hours on average and close most loans in 5–10 business days, depending on title, appraisal and how quickly documents come back.",
            },
          },
          {
            "@type": "Question",
            "name": "What credit score do I need for a Fix & Flip loan?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Most programs start at a 660+ credit score, and the best pricing tiers need 680+. Scores from 640 to 659 are reviewed case by case. Talk to a loan officer to discuss your specific situation.",
            },
          },
          {
            "@type": "Question",
            "name": "Can you fund the rehab costs as well as the purchase?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Yes. We fund both the acquisition and up to 100% of your approved rehab budget within the overall 90% LTC cap. Rehab funds are disbursed via a draw schedule as work is completed and inspected.",
            },
          },
        ],
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.fundedcapital.com" },
          { "@type": "ListItem", "position": 2, "name": "Loan Programs", "item": "https://www.fundedcapital.com/loan-programs" },
          { "@type": "ListItem", "position": 3, "name": "Fix & Flip Loans", "item": "https://www.fundedcapital.com/fix-and-flip-loans" },
        ],
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaData) }} />

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <ProgramHero
        crumb="Fix & Flip"
        eyebrow={`Fix & flip loans · ${STATS.states} states`}
        title={<>Fix &amp; Flip loans.</>}
        tagline="Purchase and rehab, one loan, one close."
        lead={
          <>
            We size the loan on the deal: the price, the rehab budget and what the house is worth when you are done. No
            income verification. Rehab money is released in draws as the work gets done.
          </>
        }
        secondary={{ href: "#rates", label: "See the rates" }}
        terms={[
          { label: "Rate", value: "from 8.75%" },
          { label: "Loan size", value: STATS.loanSizes },
          { label: "Term", value: "12–24 months" },
          { label: "Max leverage", value: "up to 90% of cost" },
          { label: "Credit", value: "660+ · best tiers 680+" },
          { label: "Close", value: STATS.close },
        ]}
      />

      {/* ── What decides the loan ────────────────────────────────────── */}
      <Section labelledBy="decides-heading">
        <SectionHead
          eyebrow="01 — What decides the loan"
          id="decides-heading"
          title="Three numbers decide the loan."
          intro="We qualify on the property and your exit, not your personal income."
        />
        <FactorCards items={factors} />
        <ul className="mt-14 grid gap-8 border-t-2 border-deep pt-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          {benefits.map((b) => (
            <li key={b.title} className="flex flex-col gap-2">
              <h3 className="text-xl leading-snug">{b.title}</h3>
              <p className="text-[15px] leading-relaxed text-deep-muted">{b.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      {/* ── Pricing ──────────────────────────────────────────────────── */}
      <Section tone="linen" id="rates" labelledBy="rates-heading" className="scroll-mt-20">
        <SectionHead
          eyebrow="02 — Pricing"
          id="rates-heading"
          title="Fix & Flip loan rates"
          intro="Straightforward pricing with no hidden fees. Up to 90% of cost at every loan size."
        />
        <RateTable caption="Fix and flip loan pricing by loan size" headers={rateTableHeaders} rows={rateTableRows} />
        <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-2xl text-sm leading-relaxed text-deep-muted">
            Rates are ranges, not quotes. Final terms depend on deal specifics and borrower profile. {COMPLIANCE}
          </p>
          <Link href="/apply" className="btn-dark shrink-0 self-start text-base">
            Get your rate
          </Link>
        </div>
      </Section>

      {/* ── Process + draws ──────────────────────────────────────────── */}
      <Section labelledBy="process-heading">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-6">
          <div className="flex flex-col gap-4 lg:col-span-4">
            <Eyebrow>03 — The process</Eyebrow>
            <h2 id="process-heading" className="text-4xl leading-[1.05] sm:text-5xl">
              From application to funded in four steps.
            </h2>
          </div>
          <div className="lg:col-span-7 lg:col-start-6">
            <StepList steps={steps} />
          </div>
        </div>

        <div className="mt-20 grid gap-12 lg:grid-cols-12 lg:gap-6">
          <div className="flex flex-col gap-4 lg:col-span-4">
            <Eyebrow>Rehab draws</Eyebrow>
            <h2 id="draws-heading" className="text-4xl leading-[1.05] sm:text-5xl">
              You build, we reimburse.
            </h2>
            <p className="text-lg leading-relaxed text-deep-muted">
              Draw requests are typically funded within{" "}
              <span className="font-figure text-deep">{STATS.drawFunding}</span>, so your crew keeps moving.
            </p>
          </div>
          <div className="lg:col-span-7 lg:col-start-6" aria-labelledby="draws-heading" role="group">
            <StepList steps={draws} />
          </div>
        </div>
      </Section>

      {/* ── FAQ ──────────────────────────────────────────────────────── */}
      <Section tone="paper" labelledBy="faq-heading">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-6">
          <div className="flex flex-col gap-4 lg:col-span-4">
            <Eyebrow>04 — FAQ</Eyebrow>
            <h2 id="faq-heading" className="text-4xl leading-[1.05] sm:text-5xl">
              Questions investors ask first.
            </h2>
          </div>
          <div className="lg:col-span-7 lg:col-start-6">
            <Faq items={faqs} idPrefix="ff-faq" />
          </div>
        </div>
      </Section>

      {/* ── Related programs ─────────────────────────────────────────── */}
      <Section labelledBy="related-heading">
        <SectionHead eyebrow="Other programs" id="related-heading" title="Not a flip? Compare the others." />
        <RelatedPrograms current="fix-and-flip" />
      </Section>
    </>
  );
}
