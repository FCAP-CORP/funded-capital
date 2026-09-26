import type { Metadata } from "next";
import Link from "next/link";
import BrokerForm from "@/components/BrokerForm";
import { COMPANY, STATS } from "@/lib/site/facts";
import { ArrowLink, Eyebrow, Ledger } from "@/components/site/ui";

export const metadata: Metadata = {
  title: "Register as a Broker Partner | Funded Capital",
  description:
    "Register as a Funded Capital broker partner. Free to register, no minimum deal volume, referral fees paid at closing, and a dedicated account manager within 24 hours.",
  alternates: { canonical: "/broker-program/register" },
};

/**
 * Broker partner registration.
 *
 * This page exists because "Register as a Broker" used to point at
 * /apply?type=broker — the full borrower application. Brokers were asked for
 * their credit score, property address, ARV and exit strategy, none of which
 * apply to a partner registering themselves, and the `type=broker` query
 * parameter was never read by the form anyway.
 *
 * "Ledger" redesign (25 Sep 2026). PERFORMANCE: server shell, the form is the
 * only client JavaScript. CONVERSION: a short hero keeps the form inside the
 * first scroll on a phone; on desktop the right column shows what a partner
 * gets and what happens after they register.
 */
const nextSteps = [
  { title: "Free to register", body: "No setup fees and no minimum deal volume." },
  { title: "Account manager in 24 hours", body: "One contact for every deal you place, plus rate sheets." },
  { title: "Paid at closing", body: "Referral fees settle at the table, not on an invoice cycle." },
];

export default function BrokerRegisterPage() {
  return (
    <>
      {/* ── Hero (short, so the form stays near the fold on mobile) ─── */}
      <section aria-labelledby="register-heading" className="bg-deep text-bone on-deep">
        <div className="section-container flex flex-col gap-5 py-10 lg:py-16">
          <nav aria-label="Breadcrumb" className="font-figure text-[13px] text-[#A9B3C2]">
            <ol className="flex flex-wrap gap-2">
              <li>
                <Link href="/" className="hover:text-bone">Home</Link>
              </li>
              <li aria-hidden="true">/</li>
              <li>
                <Link href="/broker-program" className="hover:text-bone">Broker program</Link>
              </li>
              <li aria-hidden="true">/</li>
              <li aria-current="page" className="text-brass-300">Register</li>
            </ol>
          </nav>
          <Eyebrow onDeep>Broker program · about a minute</Eyebrow>
          <h1 id="register-heading" className="text-5xl leading-[0.98] sm:text-6xl lg:text-[80px]">
            Register as a broker partner.
          </h1>
          <p className="max-w-2xl text-lg leading-relaxed text-[#C9D1DD]">
            Tell us about your business, not a deal. We&apos;ll come back to you with your account manager and rate
            sheets.
          </p>
        </div>
      </section>

      {/* ── Form + what happens next ─────────────────────────────────── */}
      <section aria-label="Broker registration" className="bg-bone text-deep">
        <div className="section-container grid gap-12 py-10 lg:grid-cols-12 lg:gap-6 lg:py-20">
          <div className="lg:col-span-7">
            <BrokerForm />
          </div>

          <aside aria-labelledby="register-next-heading" className="flex flex-col gap-10 lg:col-span-4 lg:col-start-9">
            <div className="flex flex-col gap-5">
              <Eyebrow>What happens next</Eyebrow>
              <h2 id="register-next-heading" className="text-3xl leading-tight">
                What you get.
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
              <p className="font-figure text-xs tracking-[0.12em] text-brass-700">PARTNER TERMS</p>
              <Ledger
                rows={[
                  { label: "Referral fee", value: "0.5%–3%" },
                  { label: "Paid", value: "at closing" },
                  { label: "Partners", value: STATS.brokers },
                  {
                    label: "Phone",
                    value: (
                      <a href={COMPANY.phoneHref} className="text-deep underline decoration-brass-500 underline-offset-4 hover:text-brass-700">
                        {COMPANY.phone}
                      </a>
                    ),
                  },
                ]}
              />
            </div>

            <div className="border border-rule bg-linen p-6">
              <p className="font-headline text-xl font-semibold">Have a deal ready now?</p>
              <p className="mt-2 text-[15px] leading-relaxed text-deep-muted">
                Submit it directly, or register first and your account manager will walk it through with you.
              </p>
              <div className="mt-4">
                <ArrowLink href="/apply">Submit a deal</ArrowLink>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
