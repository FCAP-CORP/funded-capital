import type { Metadata } from "next";
import Link from "next/link";
import { COMPLIANCE, STATS } from "@/lib/site/facts";
import { Eyebrow, Ledger } from "@/components/site/ui";
import CalculatorClient from "./CalculatorClient";

export const metadata: Metadata = {
  title: "Loan Calculator | Funded Capital",
  description:
    "Free real estate loan calculator — estimate Fix & Flip ROI, DSCR ratios, and monthly payments instantly.",
};

/*
 * Calculator ("Ledger", 25 Sep 2026).
 *
 * PERFORMANCE: the hero and the notes are server-rendered HTML; only the
 * calculator itself is a client component, so the page's first paint does not
 * wait on JavaScript.
 *
 * CONVERSION: an investor who has just seen their number is the warmest lead
 * on the site, so every result panel ends in one brass Apply action. The
 * hero ledger answers "can you actually do this deal" before they start.
 */

export default function CalculatorPage() {
  return (
    <>
      <section aria-labelledby="calc-heading" className="bg-deep text-bone on-deep">
        <div className="section-container grid gap-12 py-16 lg:grid-cols-12 lg:gap-6 lg:py-24">
          <div className="flex flex-col gap-6 lg:col-span-7">
            <nav aria-label="Breadcrumb" className="font-figure text-[13px] text-[#A9B3C2]">
              <Link href="/" className="hover:text-bone">
                Home
              </Link>
              <span aria-hidden="true" className="mx-2">
                /
              </span>
              <span className="text-bone" aria-current="page">
                Calculator
              </span>
            </nav>
            <Eyebrow onDeep>Free tools · Price a deal</Eyebrow>
            <h1 id="calc-heading" className="text-5xl leading-[0.98] sm:text-6xl lg:text-[80px]">
              Real Estate Loan Calculator
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-[#C9D1DD] sm:text-xl">
              Estimate Fix &amp; Flip ROI, check DSCR qualification, or calculate monthly payments, instantly and
              for free.
            </p>
          </div>
          <div className="self-end border border-bone/20 px-6 py-2 lg:col-span-4 lg:col-start-9">
            <Ledger
              onDeep
              rows={[
                { label: "Loan size", value: STATS.loanSizes },
                { label: "Term sheet", value: `${STATS.termSheet} on average` },
                { label: "Close", value: STATS.close },
              ]}
            />
          </div>
        </div>
      </section>

      <CalculatorClient />

      <section aria-label="Next step" className="bg-bone text-deep">
        <div className="section-container flex flex-col gap-4 border-t border-rule pb-16 pt-10 sm:flex-row sm:items-center sm:justify-between lg:pb-24">
          <p className="max-w-2xl text-sm leading-relaxed text-deep-soft">{COMPLIANCE}</p>
          <Link href="/loan-programs" className="text-link shrink-0 self-start text-[15px] sm:self-auto">
            View all loan programs
          </Link>
        </div>
      </section>
    </>
  );
}
