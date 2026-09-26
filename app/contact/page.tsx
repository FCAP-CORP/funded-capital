import type { Metadata } from "next";
import Link from "next/link";
import ContactForm from "@/components/ContactForm";
import { COMPANY, STATS } from "@/lib/site/facts";
import { ArrowLink, Eyebrow, Ledger } from "@/components/site/ui";

export const metadata: Metadata = {
  title: "Contact a Private Real Estate Lender — Funded Capital",
  description:
    "Reach the Funded Capital team by phone, email, or form. Loan officers available Mon–Fri 8am–6pm ET. Miami, FL. Lending in 45 states.",
};

/*
 * Contact ("Ledger", 25 Sep 2026).
 *
 * PERFORMANCE: the page shell is a server component; the only client
 * JavaScript is the form itself. The hero is short text with no image.
 *
 * CONVERSION: on a phone the form starts right after a two-line hero, so a
 * visitor who came here to write to us is typing within one scroll. On
 * desktop the right column answers "what happens after I hit send?" and
 * offers the phone for anyone who would rather talk now.
 */

const nextSteps = [
  { title: "A loan officer reads it", body: "Not a bot and not a call center. The person who answers can price your deal." },
  { title: "We reply within 2 business hours", body: "By email, or by phone if you left a number and asked for a call." },
  { title: "Have a deal? Get terms", body: `Send it through the application and get a written term sheet in ${STATS.termSheet} on average.` },
];

export default function ContactPage() {
  return (
    <>
      {/* ── Hero (short, so the form stays near the fold on mobile) ─── */}
      <section aria-labelledby="contact-heading" className="bg-deep text-bone on-deep">
        <div className="section-container flex flex-col gap-5 py-10 lg:py-16">
          <nav aria-label="Breadcrumb" className="font-figure text-[13px] text-[#A9B3C2]">
            <ol className="flex flex-wrap gap-2">
              <li>
                <Link href="/" className="hover:text-bone">Home</Link>
              </li>
              <li aria-hidden="true">/</li>
              <li aria-current="page" className="text-brass-300">Contact</li>
            </ol>
          </nav>
          <Eyebrow onDeep>Contact us</Eyebrow>
          <h1 id="contact-heading" className="text-5xl leading-[0.98] sm:text-6xl lg:text-[80px]">
            Talk to a real person.
          </h1>
          <p className="max-w-2xl text-lg leading-relaxed text-[#C9D1DD]">
            A question about a loan, an active deal, or your options? Write to us below or call{" "}
            <a href={COMPANY.phoneHref} className="font-figure text-bone underline decoration-brass-500 underline-offset-4 hover:text-brass-300">
              {COMPANY.phone}
            </a>
            .
          </p>
        </div>
      </section>

      {/* ── Form + what happens next ─────────────────────────────────── */}
      <section aria-label="Send us a message" className="bg-bone text-deep">
        <div className="section-container grid gap-12 py-10 lg:grid-cols-12 lg:gap-6 lg:py-20">
          <div className="lg:col-span-7">
            <ContactForm />
          </div>

          <aside aria-labelledby="contact-next-heading" className="flex flex-col gap-10 lg:col-span-4 lg:col-start-9">
            <div className="flex flex-col gap-5">
              <Eyebrow>What happens next</Eyebrow>
              <h2 id="contact-next-heading" className="text-3xl leading-tight">
                After you hit send.
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
              <p className="font-figure text-xs tracking-[0.12em] text-brass-700">REACH US DIRECTLY</p>
              <Ledger
                rows={[
                  {
                    label: "Phone",
                    value: (
                      <a href={COMPANY.phoneHref} className="text-deep underline decoration-brass-500 underline-offset-4 hover:text-brass-700">
                        {COMPANY.phone}
                      </a>
                    ),
                  },
                  {
                    label: "Email",
                    value: (
                      <a
                        href={`mailto:${COMPANY.email}`}
                        className="break-all text-sm text-deep underline decoration-brass-500 underline-offset-4 hover:text-brass-700"
                      >
                        {COMPANY.email}
                      </a>
                    ),
                  },
                  { label: "Mon–Fri", value: "8am–6pm ET" },
                  { label: "Saturday", value: "10am–2pm ET" },
                ]}
              />
              <address className="mt-2 text-[15px] not-italic leading-relaxed text-deep-muted">
                100 N Biscayne Blvd, Suite 1210
                <br />
                Miami, FL 33132 · Lending in {STATS.states} states
              </address>
            </div>

            <div className="border border-rule bg-linen p-6">
              <p className="font-headline text-xl font-semibold">Ready to apply?</p>
              <p className="mt-2 text-[15px] leading-relaxed text-deep-muted">
                Skip the back-and-forth: apply online and get a term sheet in {STATS.termSheet} on average.
              </p>
              <div className="mt-4">
                <ArrowLink href="/apply">Start your application</ArrowLink>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
