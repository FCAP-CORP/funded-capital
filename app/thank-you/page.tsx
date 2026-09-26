import type { Metadata } from "next";
import Link from "next/link";
import { COMPANY } from "@/lib/site/facts";
import { ArrowLink, Eyebrow, Ledger } from "@/components/site/ui";

export const metadata: Metadata = {
  title: "Thank You | Funded Capital",
  description: "Your message has been received. A Funded Capital loan officer will be in touch shortly.",
  robots: { index: false, follow: false },
};

/*
 * Thank you ("Ledger", 25 Sep 2026).
 *
 * PERFORMANCE: server component, no client JavaScript, no images.
 *
 * CONVERSION: confirms the submission landed, says when to expect a reply,
 * and keeps the phone one tap away for anyone who wants to move faster.
 * Secondary paths (programs, calculator) keep the visitor on the site while
 * they wait.
 */

export default function ThankYouPage() {
  return (
    <section aria-labelledby="thanks-heading" className="bg-deep text-bone on-deep">
      <div className="section-container grid min-h-[70vh] gap-12 py-16 lg:grid-cols-12 lg:items-center lg:gap-6 lg:py-24">
        <div className="flex flex-col gap-6 lg:col-span-7">
          <nav aria-label="Breadcrumb" className="font-figure text-[13px] text-[#A9B3C2]">
            <ol className="flex flex-wrap gap-2">
              <li>
                <Link href="/" className="hover:text-bone">Home</Link>
              </li>
              <li aria-hidden="true">/</li>
              <li aria-current="page" className="text-brass-300">Received</li>
            </ol>
          </nav>
          <Eyebrow onDeep>Submission received</Eyebrow>
          <h1 id="thanks-heading" className="text-5xl leading-[0.98] sm:text-6xl lg:text-[80px]">
            We&apos;ve got it.
          </h1>
          <p className="font-headline text-2xl font-medium text-brass-300 sm:text-[28px]">A loan officer is on it.</p>
          <p className="max-w-xl text-lg leading-relaxed text-[#C9D1DD]">
            Thank you for reaching out to Funded Capital. A loan officer will review your information and be in touch
            within 2 business hours.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href="/loan-programs" className="btn-secondary text-base">
              View loan programs
            </Link>
            <Link href="/" className="btn-secondary text-base">
              Back to home
            </Link>
          </div>
        </div>

        <aside aria-label="Reach us directly" className="self-start border border-bone/20 lg:col-span-4 lg:col-start-9">
          <p className="border-b border-bone/20 px-6 py-4 font-figure text-xs tracking-[0.12em] text-brass-300">
            NEED US SOONER?
          </p>
          <Ledger
            onDeep
            className="px-6 py-1"
            rows={[
              {
                label: "Phone",
                value: (
                  <a href={COMPANY.phoneHref} className="text-bone underline decoration-brass-500 underline-offset-4 hover:text-brass-300">
                    {COMPANY.phone}
                  </a>
                ),
              },
              {
                label: "Email",
                value: (
                  <a
                    href={`mailto:${COMPANY.email}`}
                    className="break-all text-sm text-bone underline decoration-brass-500 underline-offset-4 hover:text-brass-300"
                  >
                    {COMPANY.email}
                  </a>
                ),
              },
              { label: "Mon–Fri", value: "8am–6pm ET" },
            ]}
          />
          <div className="border-t border-bone/20 px-6 py-5">
            <ArrowLink href="/calculator" onDeep>
              Price another deal
            </ArrowLink>
          </div>
        </aside>
      </div>
    </section>
  );
}
