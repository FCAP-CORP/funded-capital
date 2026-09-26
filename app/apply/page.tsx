import type { Metadata } from "next";
import Link from "next/link";
import ApplyForm from "@/components/ApplyForm";
import { COMPANY, COMPLIANCE, STATS } from "@/lib/site/facts";
import { Eyebrow, Ledger } from "@/components/site/ui";

export const metadata: Metadata = {
  title: "Apply Now",
  description:
    "Apply for a private real estate loan with Funded Capital. Complete our 5-minute application and receive a preliminary term sheet in 2 hours on average.",
};

/*
 * Apply ("Ledger", 25 Sep 2026).
 *
 * PERFORMANCE: the page shell is a server component; the only client
 * JavaScript is the form. No hero image, so the form paints immediately.
 *
 * CONVERSION: this is the money page, so nothing competes with the form. The
 * hero is two lines on a phone and the form starts inside the first scroll.
 * On desktop the right column removes the last doubts (what happens next,
 * no obligation, no upfront fees) and gives the phone for anyone who would
 * rather talk it through.
 */

const nextSteps = [
  { title: "A loan officer reviews your deal", body: "The property, the numbers and your exit. No credit pull to start." },
  { title: "You get a written term sheet", body: `Rate, leverage, points and an estimated closing date, in ${STATS.termSheet} on average.` },
  { title: "You decide", body: "No obligation to proceed. If you accept, we send a short document list." },
  { title: "Close", body: `Appraisal, title and insurance run in parallel. Typical close: ${STATS.close}.` },
];

export default function ApplyPage() {
  return (
    <>
      {/* ── Hero (short, so the form stays near the fold on mobile) ─── */}
      <section aria-labelledby="apply-heading" className="bg-deep text-bone on-deep">
        <div className="section-container flex flex-col gap-5 py-10 lg:py-16">
          <nav aria-label="Breadcrumb" className="font-figure text-[13px] text-[#A9B3C2]">
            <ol className="flex flex-wrap gap-2">
              <li>
                <Link href="/" className="hover:text-bone">Home</Link>
              </li>
              <li aria-hidden="true">/</li>
              <li aria-current="page" className="text-brass-300">Apply</li>
            </ol>
          </nav>
          <Eyebrow onDeep>Apply now · about 5 minutes</Eyebrow>
          <h1 id="apply-heading" className="text-5xl leading-[0.98] sm:text-6xl lg:text-[80px]">
            Get your term sheet.
          </h1>
          <p className="max-w-2xl text-lg leading-relaxed text-[#C9D1DD]">
            Tell us about the deal. A loan officer reviews it and sends a preliminary term sheet in{" "}
            <span className="font-figure text-bone">{STATS.termSheet}</span> on average. No obligation.
          </p>
        </div>
      </section>

      {/* ── Form + what happens next ─────────────────────────────────── */}
      <section aria-label="Loan application" className="bg-bone text-deep">
        <div className="section-container grid gap-12 py-10 lg:grid-cols-12 lg:gap-6 lg:py-20">
          <div className="lg:col-span-7">
            <ApplyForm />
          </div>

          <aside aria-labelledby="apply-next-heading" className="flex flex-col gap-10 lg:col-span-4 lg:col-start-9">
            <div className="flex flex-col gap-5">
              <Eyebrow>What happens next</Eyebrow>
              <h2 id="apply-next-heading" className="text-3xl leading-tight">
                From this form to closing.
              </h2>
              <ol className="border-t-2 border-deep">
                {nextSteps.map((s, i) => (
                  <li key={s.title} className="grid grid-cols-[40px_1fr] gap-3 border-b border-rule py-5">
                    <span className="font-figure text-sm text-brass-700" aria-hidden="true">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="flex flex-col gap-1">
                      <span className="font-semibold">{s.title}</span>
                      <span className="text-[15px] leading-relaxed text-deep-muted">{s.body}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="flex flex-col gap-2">
              <p className="font-figure text-xs tracking-[0.12em] text-brass-700">AT A GLANCE</p>
              <Ledger
                rows={[
                  { label: "Loan size", value: STATS.loanSizes },
                  { label: "Credit", value: "660+ most programs" },
                  { label: "States", value: STATS.states },
                  { label: "Upfront fees", value: "none" },
                ]}
              />
              <p className="mt-2 text-xs leading-relaxed text-deep-muted">Ranges, not quotes. {COMPLIANCE}</p>
            </div>

            <div className="border border-rule bg-linen p-6">
              <p className="font-headline text-xl font-semibold">Rather talk it through?</p>
              <p className="mt-2 text-[15px] leading-relaxed text-deep-muted">
                Call{" "}
                <a href={COMPANY.phoneHref} className="font-figure text-deep underline decoration-brass-500 underline-offset-4 hover:text-brass-700">
                  {COMPANY.phone}
                </a>{" "}
                or email{" "}
                <a
                  href={`mailto:${COMPANY.email}`}
                  className="break-all text-deep underline decoration-brass-500 underline-offset-4 hover:text-brass-700"
                >
                  {COMPANY.email}
                </a>
                .
              </p>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
