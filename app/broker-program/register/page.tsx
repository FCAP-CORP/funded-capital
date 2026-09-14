import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, Clock, HandCoins } from "lucide-react";
import BrokerForm from "@/components/BrokerForm";

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
 */
const assurances = [
  { icon: HandCoins, title: "Free to register", desc: "No setup fees and no minimum deal volume." },
  { icon: Clock, title: "Account manager in 24 hours", desc: "One contact for every deal you place." },
  { icon: BadgeCheck, title: "Paid at closing", desc: "Referral fees settle at the table, not on an invoice cycle." },
];

export default function BrokerRegisterPage() {
  return (
    <>
      <section className="bg-navy-900 py-12 lg:py-16">
        <div className="section-container max-w-3xl">
          <Link
            href="/broker-program"
            className="inline-flex items-center gap-2 text-sm text-slate-300 hover:text-white transition-colors"
          >
            <ArrowLeft size={14} />
            Back to the Broker Program
          </Link>
          <p className="section-label mt-6">Broker Program</p>
          <h1 className="text-3xl lg:text-4xl font-bold text-white mt-2">
            Register as a Broker Partner
          </h1>
          <p className="text-slate-300 text-lg mt-4 leading-relaxed">
            Tell us about your business — not a deal. This takes about a minute,
            and we&apos;ll come back to you with your account manager and rate
            sheets.
          </p>
        </div>
      </section>

      <section className="section-padding bg-slate-50">
        <div className="section-container max-w-3xl flex flex-col gap-8">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {assurances.map((a) => {
              const Icon = a.icon;
              return (
                <div key={a.title} className="flex flex-col gap-1.5">
                  <Icon size={18} className="text-gold-600" aria-hidden="true" />
                  <p className="font-semibold text-navy-900 text-sm">{a.title}</p>
                  <p className="text-sm text-slate-600 leading-relaxed">{a.desc}</p>
                </div>
              );
            })}
          </div>

          <BrokerForm />

          <p className="text-sm text-slate-600 text-center">
            Have a deal ready to place right now?{" "}
            <Link href="/apply" className="font-semibold text-navy-900 underline">
              Submit it here
            </Link>{" "}
            — or register first and your account manager will walk it through with you.
          </p>
        </div>
      </section>
    </>
  );
}
