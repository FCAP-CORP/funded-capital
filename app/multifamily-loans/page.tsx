import type { Metadata } from "next";
import Link from "next/link";
import { COMPLIANCE, STATS } from "@/lib/site/facts";
import { Eyebrow, Faq, Ledger, Section, SectionHead } from "@/components/site/ui";
import { ProgramHero, RateTable, RelatedPrograms, StepList } from "@/components/site/ProgramPage";

export const metadata: Metadata = {
  title: "Multifamily Loans — Bridge & Term Financing for 5+ Units | Funded Capital",
  description:
    "Multifamily bridge and term loans for 5+ unit assets. Up to 75% LTV. Rates from 8.0%. Value-add and stabilized properties. Apply in minutes.",
};

/*
 * Multifamily & bridge ("Ledger", 25 Sep 2026).
 *
 * PERFORMANCE: server component, no client JavaScript, no images. The FAQ
 * uses native <details>.
 *
 * CONVERSION: the page opens on the choice the sponsor actually has to make
 * (bridge or term) as two side-by-side term ledgers, so they self-select
 * before reaching the rate table.
 */

// ─── Data ─────────────────────────────────────────────────────────────────────

const loanTypes = [
  {
    title: "Bridge loans",
    subtitle: "Value-add and transitional assets",
    body: "Short-term financing for buildings that need renovation, lease-up or repositioning. For value-add investors executing a business plan with a defined exit.",
    rows: [
      { label: "Term", value: "12–24 months" },
      { label: "Payments", value: "interest-only" },
      { label: "Leverage", value: "up to 80% LTC (value-add)" },
    ],
  },
  {
    title: "Term loans",
    subtitle: "Stabilized, cash-flowing assets",
    body: "Long-term financing for stabilized buildings generating consistent rental income. For hold-and-collect investors who want permanent capital.",
    rows: [
      { label: "Term", value: "1–10 years, fixed" },
      { label: "Recourse", value: "recourse or non-recourse" },
      { label: "Payments", value: "interest-only available" },
      { label: "Leverage", value: "up to 75% LTV" },
    ],
  },
];

const rateTableHeaders = ["Asset type", "Max LTV", "Rate", "Points", "Term"];
const rateTableRows = [
  ["Stabilized (5–20 units)", "75% LTV", "from 8.0%", "1.0–1.5", "1–10 yrs"],
  ["Value-add (5–20 units)", "80% LTC", "from 8.75%", "1.5–2.0", "1–10 yrs"],
  ["20+ Units", "70% LTV", "Negotiated", "Negotiated", "Negotiated"],
];

const assetTypes = [
  { title: "Small apartment buildings", body: "5–20 unit residential buildings: garden-style, mid-rise or walk-up." },
  { title: "Mixed-use properties", body: "Ground-floor commercial with residential above, where most of the income is residential." },
  { title: "Student housing", body: "Purpose-built or converted housing near colleges, underwritten on rental demand." },
  { title: "Senior housing", body: "Independent living and market-rate senior apartments, evaluated on occupancy and cash flow stability." },
];

const steps = [
  { title: "Send the deal", body: "Rent roll, operating history or business plan, price and your exit." },
  { title: "Get real terms", body: `A written term sheet in about ${STATS.termSheet} on average, from a person who can explain every line.` },
  { title: "Close", body: "Appraisal, title and insurance run in parallel while we underwrite the building and the plan." },
];

const faqs = [
  {
    q: "What is the minimum number of units to qualify?",
    a: "Our multifamily loan program requires a minimum of 5 residential units. Properties with 2–4 units may qualify under our DSCR rental loan program instead.",
  },
  {
    q: "Do you offer non-recourse multifamily loans?",
    a: "Yes. Non-recourse options are available for stabilized assets and qualified borrowers. Non-recourse loans typically require a stronger LTV, higher net worth, and a demonstrated track record. Talk to a loan officer to discuss eligibility.",
  },
  {
    q: "Can I do interest-only payments on a multifamily loan?",
    a: "Yes. Interest-only periods are available on both bridge and term loan structures, subject to underwriting approval. This can significantly improve cash flow during the hold period.",
  },
  {
    q: "What is the maximum LTV for value-add multifamily?",
    a: "For value-add properties, we go up to 80% of the total project cost (LTC). For stabilized assets, the maximum LTV is 75%. Properties with 20+ units are evaluated on an individual basis with negotiated terms.",
  },
  {
    q: "Do you lend on mixed-use properties?",
    a: "Yes. We lend on mixed-use properties where the majority of the income and value is derived from the residential component. Properties with significant commercial tenants may require additional review and may have adjusted LTV requirements.",
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function MultifamilyLoansPage() {
  const schemaData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "FAQPage",
        "mainEntity": [
          {
            "@type": "Question",
            "name": "What is the minimum number of units to qualify for a multifamily loan?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Our multifamily loan program requires a minimum of 5 residential units. Properties with 2–4 units may qualify under our DSCR rental loan program instead.",
            },
          },
          {
            "@type": "Question",
            "name": "Do you offer non-recourse multifamily loans?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Yes. Non-recourse options are available for stabilized assets and qualified borrowers. Non-recourse loans typically require a stronger LTV, higher net worth, and a demonstrated track record. Talk to a loan officer to discuss eligibility.",
            },
          },
          {
            "@type": "Question",
            "name": "Can I do interest-only payments on a multifamily loan?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Yes. Interest-only periods are available on both bridge and term loan structures, subject to underwriting approval. This can significantly improve cash flow during the hold period.",
            },
          },
          {
            "@type": "Question",
            "name": "What is the maximum LTV for value-add multifamily?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "For value-add properties, we go up to 80% of the total project cost (LTC). For stabilized assets, the maximum LTV is 75%. Properties with 20+ units are evaluated on an individual basis with negotiated terms.",
            },
          },
          {
            "@type": "Question",
            "name": "Do you lend on mixed-use properties?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Yes. We lend on mixed-use properties where the majority of the income and value is derived from the residential component. Properties with significant commercial tenants may require additional review and may have adjusted LTV requirements.",
            },
          },
        ],
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.fundedcapital.com" },
          { "@type": "ListItem", "position": 2, "name": "Loan Programs", "item": "https://www.fundedcapital.com/loan-programs" },
          { "@type": "ListItem", "position": 3, "name": "Multifamily Loans", "item": "https://www.fundedcapital.com/multifamily-loans" },
        ],
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaData) }} />

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <ProgramHero
        crumb="Multifamily"
        eyebrow={`Multifamily & bridge loans · ${STATS.states} states`}
        title={<>Multifamily loans.</>}
        tagline="Buy, stabilize, refinance."
        lead={
          <>
            Bridge capital for value-add execution and term financing for stabilized buildings of 5+ units. We lend
            where conventional banks won&apos;t.
          </>
        }
        secondary={{ href: "#rates", label: "See the rates" }}
        terms={[
          { label: "Rate", value: "from 8.0%" },
          { label: "Stabilized", value: "up to 75% LTV" },
          { label: "Value-add", value: "up to 80% LTC" },
          { label: "Term", value: "1–10 years" },
          { label: "Units", value: "5+" },
          { label: "Recourse", value: "recourse or non-recourse" },
        ]}
      />

      {/* ── What decides the loan ────────────────────────────────────── */}
      <Section labelledBy="decides-heading">
        <SectionHead
          eyebrow="01 — What decides the loan"
          id="decides-heading"
          title="Where the building is in its business plan."
          intro="Two structures: short-term bridge capital for execution, and term loans for stabilized assets."
        />
        <div className="grid gap-6 md:grid-cols-2">
          {loanTypes.map((t, i) => (
            <article key={t.title} className="flex flex-col gap-4 border border-rule bg-paper p-7 lg:p-9">
              <span className="font-figure text-[13px] text-brass-700" aria-hidden="true">
                {String.fromCharCode(65 + i)}
              </span>
              <div className="flex flex-col gap-1">
                <h3 className="text-[30px] leading-tight">{t.title}</h3>
                <p className="font-figure text-xs uppercase tracking-[0.1em] text-brass-700">{t.subtitle}</p>
              </div>
              <p className="text-base leading-relaxed text-deep-muted">{t.body}</p>
              <Ledger rows={t.rows} className="mt-2 border-t-2 border-deep" />
            </article>
          ))}
        </div>
      </Section>

      {/* ── Pricing ──────────────────────────────────────────────────── */}
      <Section tone="linen" id="rates" labelledBy="rates-heading" className="scroll-mt-20">
        <SectionHead
          eyebrow="02 — Pricing"
          id="rates-heading"
          title="Multifamily loan rates"
          intro="Stabilized and value-add multifamily across market types."
        />
        <RateTable caption="Multifamily loan pricing by asset type" headers={rateTableHeaders} rows={rateTableRows} />
        <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-2xl text-sm leading-relaxed text-deep-muted">
            Rates are ranges, not quotes. Final terms depend on asset type, deal specifics and borrower profile.{" "}
            {COMPLIANCE}
          </p>
          <Link href="/apply" className="btn-dark shrink-0 self-start text-base">
            Get your rate
          </Link>
        </div>
      </Section>

      {/* ── Asset types + process ────────────────────────────────────── */}
      <Section labelledBy="assets-heading">
        <SectionHead eyebrow="03 — What we finance" id="assets-heading" title="Asset types we lend on." />
        <ul className="grid gap-8 border-t-2 border-deep pt-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          {assetTypes.map((a) => (
            <li key={a.title} className="flex flex-col gap-2">
              <h3 className="text-2xl leading-snug">{a.title}</h3>
              <p className="text-[15px] leading-relaxed text-deep-muted">{a.body}</p>
            </li>
          ))}
        </ul>

        <div className="mt-20 grid gap-12 lg:grid-cols-12 lg:gap-6">
          <div className="flex flex-col gap-4 lg:col-span-4">
            <Eyebrow>04 — The process</Eyebrow>
            <h2 id="process-heading" className="text-4xl leading-[1.05] sm:text-5xl">
              Three steps. No black box.
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
              Questions sponsors ask first.
            </h2>
          </div>
          <div className="lg:col-span-7 lg:col-start-6">
            <Faq items={faqs} idPrefix="mf-faq" />
          </div>
        </div>
      </Section>

      {/* ── Related programs ─────────────────────────────────────────── */}
      <Section labelledBy="related-heading">
        <SectionHead eyebrow="Other programs" id="related-heading" title="Fewer than five units?" />
        <RelatedPrograms current="multifamily" />
      </Section>
    </>
  );
}
