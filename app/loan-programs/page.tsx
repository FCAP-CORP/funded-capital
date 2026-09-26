import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { COMPLIANCE, PROGRAMS, STATS } from "@/lib/site/facts";
import { ArrowLink, Eyebrow, Ledger, Section, SectionHead } from "@/components/site/ui";
import { Breadcrumb, RateTable } from "@/components/site/ProgramPage";

export const metadata: Metadata = {
  title: "Loan Programs",
  description:
    "Explore Funded Capital's private real estate loan programs — Fix & Flip, DSCR, New Construction, and Multifamily. Competitive rates, term sheets in 2 hours on average.",
};

/*
 * Loan programs, compare-all ("Ledger", 25 Sep 2026).
 *
 * The anchors #fix-flip, #dscr, #construction and #multifamily are linked
 * from the old footer and from other sites. Keep them.
 *
 * PERFORMANCE: server component, no client JavaScript, no images.
 *
 * CONVERSION: the overview lets an investor find their program in one glance
 * (name, one line, four terms) and jump to its detail; each detail block ends
 * with an apply action and a link to the full program page.
 */

type Detail = {
  anchor: string;
  slug: string;
  title: string;
  tagline: string;
  description: string;
  highlights: string[];
  table: { headers: string[]; rows: string[][] };
  cta: string;
};

const details: Detail[] = [
  {
    anchor: "fix-flip",
    slug: "fix-and-flip",
    title: "Fix & Flip",
    tagline: "Fast capital for value-add acquisitions",
    description:
      "For investors who buy, renovate and sell. We fund the purchase and the rehab, so you can move fast and keep more of the spread.",
    highlights: [
      "Up to 90% of cost (LTC)",
      "Up to 100% of rehab costs",
      "Rates from 8.75% interest-only",
      "Terms: 12 or 24 months",
      "No income verification required",
      "Credit score: 660+ (best tiers 680+)",
      "Close in 5–10 business days",
      "Rehab draws typically funded within 1 business day",
    ],
    table: {
      headers: ["Loan size", "Max LTC", "Rate", "Points", "Term"],
      rows: [
        ["$75K–$500K", "90% LTC", "from 8.75%", "1.5–2.5", "12–24 mo"],
        ["$500K–$2M", "90% LTC", "from 9.25%", "1.0–2.0", "12–24 mo"],
        ["$2M+", "90% LTC", "Negotiated", "Negotiated", "12–24 mo"],
      ],
    },
    cta: "Apply for Fix & Flip",
  },
  {
    anchor: "dscr",
    slug: "dscr",
    title: "DSCR / Rental Loans",
    tagline: "Long-term financing based on the property's cash flow",
    description:
      "DSCR (Debt Service Coverage Ratio) loans qualify on the property's rental income, not your personal income. Built for scaling a rental portfolio without W-2 restrictions.",
    highlights: [
      "Up to 80% LTV (purchase and refi)",
      "Rates from 6.0%",
      "30-year fixed or 30-year partial interest only",
      "DSCR minimum: 1.0x",
      "No personal income verification",
      "SFR, 2–4 units, condos",
      "Unlimited property count",
      "Cash-out available",
    ],
    table: {
      headers: ["Property type", "Max LTV", "Rate", "DSCR min", "Term"],
      rows: [
        ["SFR / Condo", "80% LTV", "from 6.0%", "1.0x", "30-yr fixed"],
        ["SFR / Condo", "80% LTV", "from 6.5%", "1.0x", "30-yr partial I/O"],
        ["2–4 Units", "80% LTV", "from 6.25%", "1.05x", "30-yr fixed"],
        ["2–4 Units", "80% LTV", "from 6.75%", "1.05x", "30-yr partial I/O"],
      ],
    },
    cta: "Apply for DSCR Loan",
  },
  {
    anchor: "construction",
    slug: "ground-up",
    title: "New Construction",
    tagline: "Ground-up construction financing with draw schedules",
    description:
      "A construction loan structured around your build schedule. We release draws as milestones are hit, which keeps carrying costs down.",
    highlights: [
      "85% of full cost; 90% with 5+ completed builds",
      "+5% of cost to finance the interest reserve",
      "After-repair value is a second cap; the lower governs",
      "Rates from 8.75% to 10.25% interest-only",
      "Terms: 12 or 24 months",
      "Draw schedule aligned to milestones",
      "SFR, townhomes, small multifamily",
      "Credit score: 660+ (best tiers 680+)",
      "Experienced builders preferred",
    ],
    table: {
      headers: ["Project size", "Max LTC", "Rate", "Draws", "Term"],
      rows: [
        ["Up to $1M", "85–90% of cost", "from 8.75%", "Monthly", "12 mo"],
        ["$1M–$5M", "85–90% of cost", "from 9.50%", "Milestone", "12–24 mo"],
        ["$5M+", "85–90% of cost", "from 10.25%", "Negotiated", "Up to 24 mo"],
      ],
    },
    cta: "Apply for Construction Loan",
  },
  {
    anchor: "multifamily",
    slug: "multifamily",
    title: "Multifamily",
    tagline: "Bridge and term loans for 5+ unit residential assets",
    description:
      "Bridge or term loans for stabilized and value-add multifamily, from small apartment buildings to larger complexes.",
    highlights: [
      "Up to 75% LTV (stabilized)",
      "Up to 80% LTC (value-add)",
      "Rates from 8.0%",
      "Terms: 1–10 years",
      "5+ residential units",
      "Recourse and non-recourse options",
      "Interest-only available",
      "Credit score: 660+ (best tiers 680+)",
    ],
    table: {
      headers: ["Asset type", "Max LTV", "Rate", "Points", "Term"],
      rows: [
        ["Stabilized (5–20 units)", "75% LTV", "from 8.0%", "1.0–1.5", "1–10 yrs"],
        ["Value-add (5–20 units)", "80% LTC", "from 8.75%", "1.5–2.0", "1–10 yrs"],
        ["20+ Units", "70% LTV", "Negotiated", "Negotiated", "Negotiated"],
      ],
    },
    cta: "Apply for Multifamily Loan",
  },
];

const anchorFor: Record<string, string> = Object.fromEntries(details.map((d) => [d.slug, d.anchor]));

export default function LoanProgramsPage() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section aria-labelledby="hero-heading" className="bg-deep text-bone on-deep">
        <div className="section-container grid gap-12 py-14 lg:grid-cols-12 lg:gap-6 lg:py-24">
          <div className="flex flex-col gap-6 lg:col-span-7">
            <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Loan programs" }]} />
            <Eyebrow onDeep>Loan programs · {STATS.states} states</Eyebrow>
            <h1 id="hero-heading" className="text-5xl leading-[0.98] sm:text-6xl lg:text-[80px] lg:tracking-[-0.03em]">
              Four programs, compared.
            </h1>
            <p className="font-headline text-2xl font-medium leading-snug text-brass-300 sm:text-[28px]">
              The right loan for the strategy, not the other way round.
            </p>
            <p className="max-w-xl text-lg leading-relaxed text-[#C9D1DD]">
              Whether you are flipping your first property or scaling a 50-unit portfolio, compare rates, leverage and
              terms side by side, then open the program that fits.
            </p>
            <div className="mt-1 flex flex-col gap-3 sm:flex-row">
              <Link href="/apply" className="btn-primary text-base sm:text-[17px]">
                Get a term sheet <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <Link href="/calculator" className="btn-secondary text-base sm:text-[17px]">
                Price a deal first
              </Link>
            </div>
          </div>
          <aside aria-label="Across every program" className="self-start border border-bone/20 lg:col-span-5 lg:col-start-8 lg:mt-14">
            <p className="border-b border-bone/20 px-6 py-4 font-figure text-xs tracking-[0.14em] text-brass-300">
              ACROSS EVERY PROGRAM
            </p>
            <Ledger
              onDeep
              className="px-6 py-1"
              rows={[
                { label: "Loan size", value: STATS.loanSizes },
                { label: "States", value: `${STATS.states} · not ${STATS.excludedStates}` },
                { label: "Term sheet", value: `${STATS.termSheet} on average` },
                { label: "Close", value: STATS.close },
                { label: "Credit", value: "660+ · best tiers 680+" },
              ]}
            />
          </aside>
        </div>
      </section>

      {/* ── Overview ─────────────────────────────────────────────────── */}
      <Section labelledBy="overview-heading">
        <SectionHead
          eyebrow="At a glance"
          id="overview-heading"
          title="Find your program in one line."
          intro={<>Ranges, not quotes. {COMPLIANCE}</>}
        />
        <ul className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {PROGRAMS.map((p, i) => (
            <li key={p.slug} className="flex flex-col border border-rule bg-paper">
              <div className="flex flex-col gap-3 p-6">
                <span className="font-figure text-[13px] text-brass-700" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="text-[28px] leading-tight">{p.name}</h3>
                <p className="text-[15px] leading-relaxed text-deep-muted">{p.short}</p>
              </div>
              <Ledger className="border-t border-rule px-6" rows={p.rows} />
              <div className="mt-auto border-t border-rule px-6 py-5">
                <a
                  href={`#${anchorFor[p.slug]}`}
                  className="inline-flex min-h-[44px] items-center gap-2 font-semibold text-deep hover:text-brass-700"
                >
                  Rates and details <ArrowRight size={16} aria-hidden="true" />
                </a>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      {/* ── Program details ──────────────────────────────────────────── */}
      {details.map((d, i) => {
        const program = PROGRAMS.find((p) => p.slug === d.slug);
        return (
          <Section
            key={d.anchor}
            id={d.anchor}
            tone={i % 2 === 0 ? "linen" : "bone"}
            labelledBy={`${d.anchor}-heading`}
            className="scroll-mt-20"
          >
            <div className="grid gap-12 lg:grid-cols-12 lg:gap-6">
              <div className="flex flex-col gap-5 lg:col-span-4">
                <Eyebrow>{String(i + 1).padStart(2, "0")} — {d.tagline}</Eyebrow>
                <h2 id={`${d.anchor}-heading`} className="text-4xl leading-[1.05] sm:text-5xl">
                  {d.title}
                </h2>
                <p className="text-lg leading-relaxed text-deep-muted">{d.description}</p>
                <ul className="border-t-2 border-deep">
                  {d.highlights.map((h) => (
                    <li key={h} className="border-b border-dashed border-rule py-3 text-[15px]">
                      {h}
                    </li>
                  ))}
                </ul>
                <div className="flex flex-col gap-5 pt-2 sm:flex-row sm:items-center">
                  <Link href="/apply" className="btn-dark self-start text-base">
                    {d.cta}
                  </Link>
                  {program && <ArrowLink href={program.href}>Full program details</ArrowLink>}
                </div>
              </div>
              <div className="lg:col-span-7 lg:col-start-6">
                <RateTable caption={`${d.title} pricing`} headers={d.table.headers} rows={d.table.rows} />
                <p className="mt-4 text-sm leading-relaxed text-deep-muted">
                  Rates and terms are indicative and subject to change. Final terms depend on deal specifics and
                  borrower profile.
                </p>
              </div>
            </div>
          </Section>
        );
      })}
    </>
  );
}
