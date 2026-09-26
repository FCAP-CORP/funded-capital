import type { Metadata } from "next";
import Link from "next/link";
import { COMPLIANCE, STATS } from "@/lib/site/facts";
import { Eyebrow, Faq, Section, SectionHead } from "@/components/site/ui";
import { ProgramHero, RateTable, RelatedPrograms, StepList } from "@/components/site/ProgramPage";

export const metadata: Metadata = {
  title: "DSCR Loans — Qualify on Rental Income, Not Your W-2 | Funded Capital",
  description:
    "DSCR rental loans up to 80% LTV. No income docs. Rates from 6.0%. 30-year fixed. Scale your rental portfolio without W-2 restrictions. Apply in minutes.",
};

/*
 * DSCR rental loans ("Ledger", 25 Sep 2026).
 *
 * PERFORMANCE: server component, no client JavaScript, no images. The FAQ
 * uses native <details>.
 *
 * CONVERSION: the formula is shown as a worked ledger so an investor can test
 * their own property in their head before applying; the calculator is the
 * second path for anyone not ready for a term sheet.
 */

// ─── Data ─────────────────────────────────────────────────────────────────────

const thresholds = [
  { ratio: "below 1.0x", title: "Rent does not cover the payment", body: "The property typically does not qualify." },
  { ratio: "1.0x", title: "Rent exactly covers the payment", body: "The minimum qualifying threshold for SFR and condos." },
  { ratio: "above 1.25x", title: "Strong cash flow", body: "May qualify for better rates and terms." },
];

const personas = [
  {
    title: "Buy & hold investors",
    body: "Add rentals without the headache of income verification. Qualify on the property's cash flow alone.",
  },
  {
    title: "Portfolio scalers",
    body: "No limit on the number of properties. Stack loans across your portfolio and let rental income drive every qualification.",
  },
  {
    title: "Self-employed investors",
    body: "Business owners often can't show traditional income. DSCR loans need no W-2s and no tax returns.",
  },
];

const rateTableHeaders = ["Property type", "Max LTV", "Rate", "DSCR min", "Term"];
const rateTableRows = [
  ["SFR / Condo", "80% LTV", "from 6.0%", "1.0x", "30-yr fixed"],
  ["SFR / Condo", "80% LTV", "from 6.5%", "1.0x", "30-yr partial I/O"],
  ["2–4 Units", "80% LTV", "from 6.25%", "1.05x", "30-yr fixed"],
  ["2–4 Units", "80% LTV", "from 6.75%", "1.05x", "30-yr partial I/O"],
];

const steps = [
  { title: "Send the property", body: "Address, price or value, and the rent: current lease or market rent. No tax returns." },
  { title: "Get real terms", body: `A written term sheet in about ${STATS.termSheet} on average, sized on the property's cash flow.` },
  { title: "Close", body: `Appraisal, rent schedule, title and insurance run in parallel. Typical close: ${STATS.close}.` },
];

const faqs = [
  {
    q: "What is a DSCR loan?",
    a: "DSCR stands for Debt Service Coverage Ratio. It measures whether a property's rental income is sufficient to cover its debt payments. DSCR loans qualify you based on the property's income, not your personal W-2 or tax returns — making them ideal for investors.",
  },
  {
    q: "What is the minimum DSCR to qualify?",
    a: "Our minimum DSCR is 1.0x for SFR and condo properties, and 1.05x for 2–4 unit properties. A DSCR of 1.0x means the property's rent exactly covers the debt payment. Higher ratios may unlock better rates.",
  },
  {
    q: "Can I use projected rent to qualify?",
    a: "In some cases, yes. For new acquisitions, we may use a market rent analysis or appraiser's rental assessment when there is no current lease in place. Talk to a loan officer to confirm eligibility for your specific property.",
  },
  {
    q: "Is there a limit on the number of properties I can finance?",
    a: "No. Funded Capital places no limit on the number of DSCR loans you can have with us. This makes our program ideal for investors actively growing a rental portfolio.",
  },
  {
    q: "Do you offer cash-out refinance on DSCR loans?",
    a: "Yes. We offer cash-out refinance on stabilized rental properties up to 75% LTV. Use the proceeds to fund your next acquisition, complete renovations, or consolidate other debt.",
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function DSCRLoansPage() {
  const schemaData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "FAQPage",
        "mainEntity": [
          {
            "@type": "Question",
            "name": "What is a DSCR loan?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "DSCR stands for Debt Service Coverage Ratio. It measures whether a property's rental income is sufficient to cover its debt payments. DSCR loans qualify you based on the property's income, not your personal W-2 or tax returns — making them ideal for investors.",
            },
          },
          {
            "@type": "Question",
            "name": "What is the minimum DSCR to qualify?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Our minimum DSCR is 1.0x for SFR and condo properties, and 1.05x for 2–4 unit properties. A DSCR of 1.0x means the property's rent exactly covers the debt payment. Higher ratios may unlock better rates.",
            },
          },
          {
            "@type": "Question",
            "name": "Can I use projected rent to qualify for a DSCR loan?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "In some cases, yes. For new acquisitions, we may use a market rent analysis or appraiser's rental assessment when there is no current lease in place. Talk to a loan officer to confirm eligibility for your specific property.",
            },
          },
          {
            "@type": "Question",
            "name": "Is there a limit on the number of properties I can finance with DSCR loans?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "No. Funded Capital places no limit on the number of DSCR loans you can have with us. This makes our program ideal for investors actively growing a rental portfolio.",
            },
          },
          {
            "@type": "Question",
            "name": "Do you offer cash-out refinance on DSCR loans?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Yes. We offer cash-out refinance on stabilized rental properties up to 75% LTV. Use the proceeds to fund your next acquisition, complete renovations, or consolidate other debt.",
            },
          },
        ],
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.fundedcapital.com" },
          { "@type": "ListItem", "position": 2, "name": "Loan Programs", "item": "https://www.fundedcapital.com/loan-programs" },
          { "@type": "ListItem", "position": 3, "name": "DSCR / Rental Loans", "item": "https://www.fundedcapital.com/dscr-loans" },
        ],
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaData) }} />

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <ProgramHero
        crumb="DSCR Rental"
        eyebrow={`DSCR rental loans · ${STATS.states} states`}
        title={<>DSCR rental loans.</>}
        tagline="The rent qualifies the loan, not your W-2."
        lead={
          <>
            Scale a rental portfolio without income documentation. We qualify on the property&apos;s cash flow, not
            your tax returns or employment history. No limit on the number of properties.
          </>
        }
        secondary={{ href: "/calculator", label: "Calculate my DSCR" }}
        terms={[
          { label: "Rate", value: "from 6.0%" },
          { label: "Leverage", value: "up to 80% LTV" },
          { label: "Term", value: "30-yr fixed or partial I/O" },
          { label: "Income docs", value: "none required" },
          { label: "Property", value: "SFR, condo, 2–4 units" },
          { label: "Cash-out", value: "available" },
        ]}
      />

      {/* ── What decides the loan ────────────────────────────────────── */}
      <Section labelledBy="decides-heading">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-6">
          <div className="flex flex-col gap-5 lg:col-span-5">
            <Eyebrow>01 — What decides the loan</Eyebrow>
            <h2 id="decides-heading" className="text-4xl leading-[1.05] sm:text-5xl lg:text-[56px]">
              One ratio: does the rent cover the debt?
            </h2>
            <p className="text-lg leading-relaxed text-deep-muted">
              DSCR, the Debt Service Coverage Ratio, measures whether a property&apos;s income covers its debt
              payments. A ratio above 1.0x means positive cash flow.
            </p>
            <Link href="/calculator" className="btn-dark self-start text-base">
              Use the DSCR calculator
            </Link>
          </div>
          <div className="flex flex-col gap-6 lg:col-span-6 lg:col-start-7">
            <div className="bg-deep px-7 py-6 text-bone">
              <p className="font-figure text-xs tracking-[0.14em] text-brass-300">THE FORMULA</p>
              <p className="mt-3 font-figure text-lg leading-relaxed sm:text-xl">
                DSCR = Net Operating Income ÷ Annual Debt Service
              </p>
            </div>
            <ul className="border-t-2 border-deep">
              {thresholds.map((t) => (
                <li key={t.ratio} className="grid grid-cols-[120px_1fr] gap-4 border-b border-rule py-5 sm:grid-cols-[150px_1fr]">
                  <span className="font-figure text-base text-brass-700">DSCR {t.ratio}</span>
                  <span className="flex flex-col gap-1">
                    <span className="font-semibold">{t.title}</span>
                    <span className="text-[15px] text-deep-muted">{t.body}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      {/* ── Who it's for ─────────────────────────────────────────────── */}
      <Section tone="paper" labelledBy="who-heading">
        <SectionHead eyebrow="02 — Who it’s for" id="who-heading" title="Built for rental investors who want to scale." />
        <ol className="grid gap-6 md:grid-cols-3">
          {personas.map((p, i) => (
            <li key={p.title} className="flex flex-col gap-3.5 border border-rule bg-bone p-7 lg:p-8">
              <span className="font-figure text-[13px] text-brass-700" aria-hidden="true">
                {String.fromCharCode(65 + i)}
              </span>
              <h3 className="text-[26px] leading-tight">{p.title}</h3>
              <p className="text-base leading-relaxed text-deep-muted">{p.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* ── Pricing ──────────────────────────────────────────────────── */}
      <Section tone="linen" id="rates" labelledBy="rates-heading" className="scroll-mt-20">
        <SectionHead
          eyebrow="03 — Pricing"
          id="rates-heading"
          title="DSCR loan rates"
          intro="Long-term rates for SFR, condos and 2–4 unit properties."
        />
        <RateTable caption="DSCR loan pricing by property type and term" headers={rateTableHeaders} rows={rateTableRows} />
        <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-2xl text-sm leading-relaxed text-deep-muted">
            Rates are ranges, not quotes. Final terms depend on deal specifics and borrower profile. {COMPLIANCE}
          </p>
          <Link href="/apply" className="btn-dark shrink-0 self-start text-base">
            Get your rate
          </Link>
        </div>
      </Section>

      {/* ── Process ──────────────────────────────────────────────────── */}
      <Section labelledBy="process-heading">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-6">
          <div className="flex flex-col gap-4 lg:col-span-4">
            <Eyebrow>04 — The process</Eyebrow>
            <h2 id="process-heading" className="text-4xl leading-[1.05] sm:text-5xl">
              Three steps. No tax returns.
            </h2>
          </div>
          <div className="lg:col-span-7 lg:col-start-6">
            <StepList steps={steps} />
          </div>
        </div>
      </Section>

      {/* ── FAQ ──────────────────────────────────────────────────────── */}
      <Section tone="paper" labelledBy="faq-heading">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-6">
          <div className="flex flex-col gap-4 lg:col-span-4">
            <Eyebrow>05 — FAQ</Eyebrow>
            <h2 id="faq-heading" className="text-4xl leading-[1.05] sm:text-5xl">
              DSCR questions, answered.
            </h2>
          </div>
          <div className="lg:col-span-7 lg:col-start-6">
            <Faq items={faqs} idPrefix="dscr-faq" />
          </div>
        </div>
      </Section>

      {/* ── Related programs ─────────────────────────────────────────── */}
      <Section labelledBy="related-heading">
        <SectionHead eyebrow="Other programs" id="related-heading" title="Buying to rehab or build first?" />
        <RelatedPrograms current="dscr" />
      </Section>
    </>
  );
}
