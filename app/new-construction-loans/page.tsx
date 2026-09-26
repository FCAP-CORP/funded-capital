import type { Metadata } from "next";
import Link from "next/link";
import { COMPLIANCE, STATS } from "@/lib/site/facts";
import { Eyebrow, Faq, Section, SectionHead } from "@/components/site/ui";
import { FactorCards, ProgramHero, RateTable, RelatedPrograms, StepList } from "@/components/site/ProgramPage";

export const metadata: Metadata = {
  title: "New Construction Loans — Up to 90% of Cost, Ground-Up Financing | Funded Capital",
  description:
    "Ground-up construction loans up to 90% of cost for experienced builders, 85% standard, plus a financed interest reserve. Draw schedules, milestone funding. Rates from 8.75%. SFR, townhomes, small multifamily, ADUs.",
};

/*
 * Ground-up construction ("Ledger", 25 Sep 2026).
 *
 * PERFORMANCE: server component, no client JavaScript, no images. The FAQ
 * uses native <details>.
 *
 * CONVERSION: leverage is the builder's first question and the one most
 * lenders blur, so the four things that set it (full cost, track record,
 * the financed reserve, after-repair value) are laid out as cards before the
 * rate table. Leverage figures follow lib/pricing.ts (guLtfcCap): never a
 * flat "85% LTC".
 */

// ─── Data ─────────────────────────────────────────────────────────────────────

const factors = [
  {
    title: "Full cost",
    body: "Purchase price, any sunk costs and the remaining construction budget. Most builders finance up to 85% of it.",
  },
  {
    title: "Track record",
    body: "Builders with five or more completed ground-up projects reach 90% of full cost.",
  },
  {
    title: "Interest reserve",
    body: "A further 5% of cost is available to finance the interest reserve, on top of either figure.",
  },
  {
    title: "After-repair value",
    body: "A second cap. Leverage is also limited by after-repair loan-to-value, and the lower cap governs.",
  },
];

const assetTypes = [
  { title: "Single-family residences", body: "Ground-up SFR builds from entry-level to luxury, spec and custom." },
  { title: "Townhomes", body: "Attached or semi-attached developments, single-phase or multi-phase." },
  { title: "Small multifamily", body: "2–4 unit residential construction: duplexes, triplexes and quads." },
  { title: "Accessory dwelling units", body: "Detached or attached ADU construction on existing lots." },
];

const rateTableHeaders = ["Project size", "Max loan-to-cost", "Rate", "Draws", "Term"];
const rateTableRows = [
  ["Up to $1M", "85–90% of cost", "from 8.75%", "Monthly", "12 mo"],
  ["$1M–$5M", "85–90% of cost", "from 9.50%", "Milestone", "12–24 mo"],
  ["$5M+", "85–90% of cost", "from 10.25%", "Negotiated", "Up to 24 mo"],
];

const drawSteps = [
  {
    title: "Land and plans",
    body: "Secure your lot and finalize plans. We underwrite the full project cost up front.",
  },
  {
    title: "Construction draws",
    body: "Funds are released in draws tied to milestones (foundation, framing, mechanical, completion), each verified by inspection. You pay interest only on what you have drawn.",
  },
  {
    title: "Certificate of occupancy",
    body: "The project is complete and the CO is issued. Sell, or refinance into a long-term DSCR loan and pay this loan off.",
  },
];

const faqs = [
  {
    q: "How do construction draws work?",
    a: "Draws are disbursements released as construction milestones are completed and verified. Our team schedules inspections at key stages — foundation, framing, rough-in, drywall, and final completion. Once a milestone is confirmed, funds are released to your account.",
  },
  {
    q: "Do I need prior construction experience?",
    a: "Experienced builders are preferred, but first-time builders with a qualified general contractor may still qualify. We evaluate the strength of your build team, project plans, and overall deal economics.",
  },
  {
    q: "What is the maximum loan size for a ground-up project?",
    a: "We do not have a hard cap. Projects over $5M are evaluated on a case-by-case basis with negotiated rates and terms. Contact us directly to discuss your large-scale project.",
  },
  {
    q: "Can I refinance into a DSCR loan after construction is complete?",
    a: "Yes. Many of our borrowers build with us and then refinance into our 30-year DSCR rental loan once the property is stabilized. We make this transition as simple as possible for repeat clients.",
  },
  {
    q: "What states do you lend in for new construction?",
    a: "We lend in 45 states nationwide. A few states are excluded due to licensing requirements. Contact a loan officer to confirm eligibility in your specific state before submitting an application.",
  },
  {
    q: "How much of my project cost can you finance?",
    a: "Most ground-up borrowers finance up to 85% of full cost — purchase price, any sunk costs, and the remaining construction budget. Builders with five or more completed ground-up projects reach 90%. On top of either figure, a further 5% of cost is available to finance the interest reserve, so an experienced builder can reach 95% of cost all-in with the reserve financed. Leverage is also limited by after-repair loan-to-value, and whichever cap is lower governs the deal. Final terms come from a term sheet, not from this page.",
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function NewConstructionLoansPage() {
  const schemaData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "FAQPage",
        "mainEntity": [
          {
            "@type": "Question",
            "name": "How do construction draws work?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Draws are disbursements released as construction milestones are completed and verified. Our team schedules inspections at key stages — foundation, framing, rough-in, drywall, and final completion. Once a milestone is confirmed, funds are released to your account.",
            },
          },
          {
            "@type": "Question",
            "name": "Do I need prior construction experience for a new construction loan?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Experienced builders are preferred, but first-time builders with a qualified general contractor may still qualify. We evaluate the strength of your build team, project plans, and overall deal economics.",
            },
          },
          {
            "@type": "Question",
            "name": "What is the maximum loan size for a ground-up construction project?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "We do not have a hard cap. Projects over $5M are evaluated on a case-by-case basis with negotiated rates and terms. Contact us directly to discuss your large-scale project.",
            },
          },
          {
            "@type": "Question",
            "name": "Can I refinance into a DSCR loan after construction is complete?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Yes. Many of our borrowers build with us and then refinance into our 30-year DSCR rental loan once the property is stabilized. We make this transition as simple as possible for repeat clients.",
            },
          },
          {
            "@type": "Question",
            "name": "What states do you lend in for new construction?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "We lend in 45 states nationwide. A few states are excluded due to licensing requirements. Contact a loan officer to confirm eligibility in your specific state before submitting an application.",
            },
          },
          {
            "@type": "Question",
            "name": "How much of my project cost can you finance?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Most ground-up borrowers finance up to 85% of full cost — purchase price, any sunk costs, and the remaining construction budget. Builders with five or more completed ground-up projects reach 90%. On top of either figure, a further 5% of cost is available to finance the interest reserve, so an experienced builder can reach 95% of cost all-in with the reserve financed. Leverage is also limited by after-repair loan-to-value, and whichever cap is lower governs the deal. Final terms come from a term sheet, not from this page.",
            },
          },
        ],
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.fundedcapital.com" },
          { "@type": "ListItem", "position": 2, "name": "Loan Programs", "item": "https://www.fundedcapital.com/loan-programs" },
          { "@type": "ListItem", "position": 3, "name": "New Construction Loans", "item": "https://www.fundedcapital.com/new-construction-loans" },
        ],
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaData) }} />

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <ProgramHero
        crumb="Ground-Up"
        eyebrow={`New construction loans · ${STATS.states} states`}
        title={<>Ground-up construction loans.</>}
        tagline="Experience earns more of the cost."
        lead={
          <>
            Build from the lot up with a loan structured around your schedule. We underwrite the full project cost and
            release draws as milestones are hit, so you carry interest only on what you have drawn.
          </>
        }
        secondary={{ href: "#rates", label: "See the rates" }}
        terms={[
          { label: "Rate", value: "from 8.75%" },
          { label: "Leverage", value: "85% of full cost" },
          { label: "Experienced", value: "90% with 5+ builds" },
          { label: "Interest reserve", value: "+5% of cost, financed" },
          { label: "Second cap", value: "after-repair value" },
          { label: "Term", value: "12–24 months" },
        ]}
      />

      {/* ── What decides the loan ────────────────────────────────────── */}
      <Section labelledBy="decides-heading">
        <SectionHead
          eyebrow="01 — What decides the loan"
          id="decides-heading"
          title="Four numbers set your leverage."
          intro="An experienced builder can reach 95% of cost all-in with the reserve financed. Final terms come from a term sheet, not from this page."
        />
        <FactorCards items={factors} />
      </Section>

      {/* ── Pricing ──────────────────────────────────────────────────── */}
      <Section tone="linen" id="rates" labelledBy="rates-heading" className="scroll-mt-20">
        <SectionHead
          eyebrow="02 — Pricing"
          id="rates-heading"
          title="New construction loan rates"
          intro="From starter builds to larger developments. 85% of full cost as standard, 90% with five or more completed builds."
        />
        <RateTable caption="New construction loan pricing by project size" headers={rateTableHeaders} rows={rateTableRows} />
        <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-2xl text-sm leading-relaxed text-deep-muted">
            Rates are ranges, not quotes. Leverage is also capped by after-repair value. Final terms depend on project
            specifics and borrower profile. {COMPLIANCE}
          </p>
          <Link href="/apply" className="btn-dark shrink-0 self-start text-base">
            Get your rate
          </Link>
        </div>
      </Section>

      {/* ── Draws ────────────────────────────────────────────────────── */}
      <Section labelledBy="draws-heading">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-6">
          <div className="flex flex-col gap-4 lg:col-span-4">
            <Eyebrow>03 — The build process</Eyebrow>
            <h2 id="draws-heading" className="text-4xl leading-[1.05] sm:text-5xl">
              Funds follow the milestones.
            </h2>
            <p className="text-lg leading-relaxed text-deep-muted">
              Draws are released in stages as your project is inspected, which keeps carrying costs down.
            </p>
          </div>
          <div className="lg:col-span-7 lg:col-start-6">
            <StepList steps={drawSteps} />
          </div>
        </div>
      </Section>

      {/* ── What we finance ──────────────────────────────────────────── */}
      <Section tone="paper" labelledBy="assets-heading">
        <SectionHead eyebrow="04 — What we finance" id="assets-heading" title="Residential builds, lot to CO." />
        <ul className="grid gap-8 border-t-2 border-deep pt-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          {assetTypes.map((a) => (
            <li key={a.title} className="flex flex-col gap-2">
              <h3 className="text-2xl leading-snug">{a.title}</h3>
              <p className="text-[15px] leading-relaxed text-deep-muted">{a.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      {/* ── FAQ ──────────────────────────────────────────────────────── */}
      <Section labelledBy="faq-heading">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-6">
          <div className="flex flex-col gap-4 lg:col-span-4">
            <Eyebrow>05 — FAQ</Eyebrow>
            <h2 id="faq-heading" className="text-4xl leading-[1.05] sm:text-5xl">
              Questions builders ask first.
            </h2>
          </div>
          <div className="lg:col-span-7 lg:col-start-6">
            <Faq items={faqs} idPrefix="gu-faq" />
          </div>
        </div>
      </Section>

      {/* ── Related programs ─────────────────────────────────────────── */}
      <Section tone="linen" labelledBy="related-heading">
        <SectionHead eyebrow="Other programs" id="related-heading" title="Renovating or holding instead?" />
        <RelatedPrograms current="ground-up" />
      </Section>
    </>
  );
}
