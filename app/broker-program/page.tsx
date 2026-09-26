import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { STATS } from "@/lib/site/facts";
import { ArrowLink, Eyebrow, Ledger, Section, SectionHead } from "@/components/site/ui";

export const metadata: Metadata = {
  title: "Broker Partner Program — Earn Up to 3% Per Closed Loan | Funded Capital",
  description:
    "Join 200+ brokers who partner with Funded Capital. Earn 0.5%–3% referral fees on Fix & Flip, DSCR, Construction, and Multifamily loans. No minimums, paid at closing.",
};

/*
 * Broker program ("Ledger", 25 Sep 2026).
 *
 * PERFORMANCE: server component, no client JavaScript, no images. The fee
 * schedule is a real <table> that renders as text.
 *
 * CONVERSION: a broker's first question is "what do I earn and when?", so the
 * hero Ledger answers it before the scroll (0.5%–3%, paid at closing, no
 * minimum). Register is the one brass action; talking to the broker team is
 * the second path.
 */

const benefits = [
  {
    title: "Competitive referral fees",
    desc: "Earn 0.5%–3% on every closed loan you bring to us. No caps, no hidden deductions, paid at closing.",
  },
  {
    title: "Fast turn times",
    desc: `Your clients get a term sheet in ${STATS.termSheet} on average and close in ${STATS.close}. Fast closings mean happy clients and repeat referrals.`,
  },
  {
    title: "Dedicated broker support",
    desc: "Every registered broker gets a dedicated account manager. One number, one contact, every deal.",
  },
  {
    title: "Broad product range",
    desc: "Fix & Flip, DSCR, New Construction and Multifamily. More programs means more deals you can place with us.",
  },
  {
    title: "No minimum volume",
    desc: "Whether you send us 1 deal or 50 a month, you get the same service and the same competitive pricing.",
  },
];

const howItWorks = [
  {
    n: "1",
    title: "Register as a partner",
    desc: "Complete the broker registration form. We verify your license and set you up in our system within 24 hours.",
  },
  {
    n: "2",
    title: "Submit your deal",
    desc: `Use the broker portal or call your account manager directly. We issue a preliminary term sheet in ${STATS.termSheet} on average.`,
  },
  {
    n: "3",
    title: "We close, you earn",
    desc: "Your referral fee is paid at the closing table. No chasing invoices, no delays.",
  },
];

const feeSchedule = [
  { program: "Fix & Flip", fee: "0.5%–3%", notes: "Paid at closing" },
  { program: "DSCR / Rental", fee: "0.5%–3%", notes: "Paid at closing" },
  { program: "New Construction", fee: "0.5%–3%", notes: "Paid at closing" },
  { program: "Multifamily", fee: "0.5%–3%", notes: "Negotiable on large deals" },
];

const requirements = [
  "Active mortgage broker, NMLS license (preferred for mortgage referrals)",
  "Real estate license (for agent referrals)",
  "No minimum deal volume required",
  "Free to register, no setup fees",
  "Co-brokering arrangements available",
];

const registerPerks = [
  "Dedicated account manager assigned within 24 hours",
  "Access to our full product range and rate sheets",
  "Priority deal review for registered partners",
  "Co-marketing materials available on request",
];

export default function BrokerProgramPage() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section aria-labelledby="broker-heading" className="bg-deep text-bone on-deep">
        <div className="section-container grid gap-12 py-16 lg:grid-cols-12 lg:gap-6 lg:py-24">
          <div className="flex flex-col gap-6 lg:col-span-7">
            <nav aria-label="Breadcrumb" className="font-figure text-[13px] text-[#A9B3C2]">
              <ol className="flex flex-wrap gap-2">
                <li>
                  <Link href="/" className="hover:text-bone">Home</Link>
                </li>
                <li aria-hidden="true">/</li>
                <li aria-current="page" className="text-brass-300">Broker program</li>
              </ol>
            </nav>
            <Eyebrow onDeep>Broker program · {STATS.brokers} partners</Eyebrow>
            <h1 id="broker-heading" className="text-5xl leading-[0.98] sm:text-6xl lg:text-[80px]">
              Earn more on every deal you close.
            </h1>
            <p className="font-headline text-2xl font-medium text-brass-300 sm:text-[28px]">Bring us the deal. Keep the client.</p>
            <p className="max-w-xl text-lg leading-relaxed text-[#C9D1DD]">
              Join {STATS.brokers} mortgage brokers and real estate professionals who trust Funded Capital to deliver
              for their clients, and pay them well for doing it.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/broker-program/register" className="btn-primary text-base">
                Register as a broker <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <Link href="/contact" className="btn-secondary text-base">
                Talk to our broker team
              </Link>
            </div>
          </div>
          <aside aria-label="Partner terms" className="self-start border border-bone/20 lg:col-span-4 lg:col-start-9 lg:mt-10">
            <p className="border-b border-bone/20 px-6 py-4 font-figure text-xs tracking-[0.12em] text-brass-300">PARTNER TERMS</p>
            <Ledger
              onDeep
              className="px-6 py-1"
              rows={[
                { label: "Referral fee", value: "0.5%–3% per closed loan" },
                { label: "Paid", value: "at closing" },
                { label: "Minimum volume", value: "none" },
                { label: "Setup fee", value: "none" },
                { label: "Term sheet", value: `${STATS.termSheet} on average` },
              ]}
            />
          </aside>
        </div>
      </section>

      {/* ── Benefits ─────────────────────────────────────────────────── */}
      <Section labelledBy="benefits-heading">
        <SectionHead eyebrow="01 — Partner benefits" id="benefits-heading" title="Why brokers choose Funded Capital." />
        <ul className="grid gap-x-6 gap-y-10 md:grid-cols-2 lg:grid-cols-3">
          {benefits.map((b) => (
            <li key={b.title} className="flex flex-col gap-3 border-t-2 border-deep pt-6">
              <h3 className="text-2xl leading-tight">{b.title}</h3>
              <p className="text-[17px] leading-relaxed text-deep-muted">{b.desc}</p>
            </li>
          ))}
        </ul>
      </Section>

      {/* ── How it works ─────────────────────────────────────────────── */}
      <Section tone="linen" labelledBy="broker-process-heading">
        <SectionHead eyebrow="02 — How it works" id="broker-process-heading" title="Three steps to your first fee." />
        <ol className="grid gap-10 md:grid-cols-3 md:gap-6">
          {howItWorks.map((s) => (
            <li key={s.n} className="flex flex-col gap-4 border-t-2 border-deep pt-7">
              <span className="font-headline text-6xl font-medium leading-none text-brass-500" aria-hidden="true">
                {s.n}
              </span>
              <h3 className="text-[28px] leading-tight">{s.title}</h3>
              <p className="text-[17px] leading-relaxed text-deep-muted">{s.desc}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* ── Fee schedule ─────────────────────────────────────────────── */}
      <Section labelledBy="fees-heading">
        <SectionHead
          eyebrow="03 — Compensation"
          id="fees-heading"
          title="Broker fee schedule."
          intro="Transparent referral fees across every loan program. Actual fees are set by deal size and relationship."
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left text-base">
            <caption className="sr-only">Broker referral fees by loan program</caption>
            <thead>
              <tr className="border-b-2 border-deep font-figure text-xs uppercase tracking-[0.1em]">
                <th scope="col" className="py-4 pr-4 font-semibold">Program</th>
                <th scope="col" className="py-4 pr-4 font-semibold">Referral fee</th>
                <th scope="col" className="py-4 font-semibold">Notes</th>
              </tr>
            </thead>
            <tbody>
              {feeSchedule.map((row) => (
                <tr key={row.program} className="border-b border-rule">
                  <th scope="row" className="py-5 pr-4 font-headline text-xl font-semibold sm:text-2xl">
                    {row.program}
                  </th>
                  <td className="py-5 pr-4 font-figure text-lg">{row.fee}</td>
                  <td className="py-5 font-figure text-sm text-deep-muted">{row.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ── Requirements + register ──────────────────────────────────── */}
      <Section tone="linen" labelledBy="requirements-heading">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-6">
          <div className="flex flex-col gap-5 lg:col-span-6">
            <Eyebrow>04 — Requirements</Eyebrow>
            <h2 id="requirements-heading" className="text-4xl leading-[1.05] sm:text-5xl lg:text-[56px]">
              Who can become a partner?
            </h2>
            <p className="text-lg leading-relaxed text-deep-muted">
              We work with licensed mortgage brokers, real estate agents, financial advisors and other professionals who
              regularly work with investors. Registering is quick and free.
            </p>
            <ul className="border-t-2 border-deep">
              {requirements.map((item) => (
                <li key={item} className="border-b border-rule py-4 text-[17px]">
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="self-start bg-deep p-8 text-bone on-deep lg:col-span-5 lg:col-start-8">
            <h3 className="text-3xl leading-tight">Register today.</h3>
            <p className="mt-3 text-[#C9D1DD]">
              Join our broker network and start earning on every deal you close. Setup takes less than 5 minutes.
            </p>
            <ul className="mt-6">
              {registerPerks.map((item) => (
                <li key={item} className="border-t border-bone/20 py-4 text-[15px] text-[#C9D1DD] last:border-b">
                  {item}
                </li>
              ))}
            </ul>
            <Link href="/broker-program/register" className="btn-primary mt-8 w-full text-base">
              Register as a broker partner <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <div className="mt-6">
              <ArrowLink href="/contact" onDeep>
                Questions first? Talk to us
              </ArrowLink>
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}
