import type { Metadata } from "next";
import Link from "next/link";
import {
  DollarSign,
  Headphones,
  Zap,
  BarChart3,
  Users,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Broker Partner Program — Earn Up to 3% Per Closed Loan | Funded Capital",
  description:
    "Join 200+ brokers who partner with Funded Capital. Earn 0.5%–3% referral fees on Fix & Flip, DSCR, Construction, and Multifamily loans. No minimums, paid at closing.",
};

const benefits = [
  {
    icon: DollarSign,
    title: "Competitive Referral Fees",
    desc: "Earn 0.5%–3% on every closed loan you bring to us. No caps, no hidden deductions — paid at closing.",
  },
  {
    icon: Zap,
    title: "Fast Turn Times",
    desc: "Your clients get 24–48 hour approvals and closings in as little as 5 days. Fast closings mean happy clients — and repeat referrals.",
  },
  {
    icon: Headphones,
    title: "Dedicated Broker Support",
    desc: "Every registered broker gets a dedicated account manager. One number, one contact, every deal.",
  },
  {
    icon: BarChart3,
    title: "Broad Product Suite",
    desc: "Fix & Flip, DSCR, New Construction, and Multifamily. More programs means more deals you can place with us.",
  },
  {
    icon: Users,
    title: "No Minimum Volume",
    desc: "Whether you send us 1 deal or 50 per month, you get the same service and the same competitive pricing.",
  },
];

const howItWorks = [
  {
    step: "01",
    title: "Register as a Partner",
    desc: "Complete our simple broker registration form. We'll verify your license and set you up in our system within 24 hours.",
  },
  {
    step: "02",
    title: "Submit Your Deal",
    desc: "Use our broker portal or call your dedicated account manager directly. We'll issue a preliminary term sheet within 24–48 hours.",
  },
  {
    step: "03",
    title: "We Close, You Earn",
    desc: "Your referral fee is paid at the closing table — no chasing invoices, no delays. Transparent, on time, every time.",
  },
];

const feeSchedule = [
  { program: "Fix & Flip", fee: "0.5%–3%", notes: "Paid at closing" },
  { program: "DSCR / Rental", fee: "0.5%–3%", notes: "Paid at closing" },
  { program: "New Construction", fee: "0.5%–3%", notes: "Paid at closing" },
  { program: "Multifamily", fee: "0.5%–3%", notes: "Negotiable on large deals" },
];

export default function BrokerProgramPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-navy-900 py-16 lg:py-20">
        <div className="section-container max-w-3xl">
          <p className="section-label">Broker Program</p>
          <h1 className="text-4xl lg:text-5xl font-bold text-white mt-2">
            Earn More on Every Deal You Close
          </h1>
          <p className="text-slate-300 text-lg mt-5 leading-relaxed">
            Join 200+ mortgage brokers and real estate professionals who trust
            Funded Capital to deliver for their clients — and pay them well for
            doing it.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 mt-8">
            <Link href="/apply?type=broker" className="btn-primary">
              Register as a Broker
              <ArrowRight size={16} />
            </Link>
            <Link href="/contact" className="btn-secondary">
              Talk to Our Broker Team
            </Link>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="section-padding bg-white">
        <div className="section-container">
          <div className="text-center mb-12">
            <p className="section-label">Partner Benefits</p>
            <h2 className="section-heading">Why Brokers Choose Funded Capital</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {benefits.map((b) => {
              const Icon = b.icon;
              return (
                <article key={b.title} className="card flex flex-col gap-3">
                  <div className="p-2.5 bg-gold-500/10 rounded-xl self-start">
                    <Icon size={20} className="text-gold-600" />
                  </div>
                  <h3 className="font-bold text-navy-900">{b.title}</h3>
                  <p className="text-slate-500 text-sm leading-relaxed">{b.desc}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section className="section-padding bg-slate-50">
        <div className="section-container">
          <div className="text-center mb-12">
            <p className="section-label">Simple Process</p>
            <h2 className="section-heading">How the Broker Program Works</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {howItWorks.map((step) => (
              <article key={step.step} className="card text-center">
                <span className="text-gold-500 font-bold text-5xl opacity-25 block leading-none mb-4">
                  {step.step}
                </span>
                <h3 className="font-bold text-navy-900">{step.title}</h3>
                <p className="text-slate-500 text-sm mt-2 leading-relaxed">{step.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Fee Schedule */}
      <section className="section-padding bg-white">
        <div className="section-container">
          <div className="text-center mb-10">
            <p className="section-label">Compensation</p>
            <h2 className="section-heading">Broker Fee Schedule</h2>
            <p className="section-sub max-w-xl mx-auto">
              Transparent, competitive referral fees across all loan programs.
              Actual fees negotiated based on deal size and relationship.
            </p>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-card max-w-3xl mx-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-navy-900">
                  <th className="px-5 py-4 text-left text-slate-300 font-semibold text-xs uppercase tracking-wider">
                    Program
                  </th>
                  <th className="px-5 py-4 text-left text-gold-400 font-semibold text-xs uppercase tracking-wider">
                    Referral Fee
                  </th>
                  <th className="px-5 py-4 text-left text-slate-300 font-semibold text-xs uppercase tracking-wider">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody>
                {feeSchedule.map((row, i) => (
                  <tr key={row.program} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                    <td className="px-5 py-4 font-semibold text-navy-900">{row.program}</td>
                    <td className="px-5 py-4 text-gold-600 font-semibold">{row.fee}</td>
                    <td className="px-5 py-4 text-slate-500">{row.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* What You Need */}
      <section className="section-padding bg-slate-50">
        <div className="section-container">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            <div>
              <p className="section-label">Requirements</p>
              <h2 className="section-heading">Who Can Become a Partner?</h2>
              <p className="text-slate-500 mt-4 leading-relaxed">
                We work with licensed mortgage brokers, real estate agents, financial
                advisors, and other professionals who regularly work with investors.
                Getting registered is quick and free.
              </p>
              <ul className="mt-6 flex flex-col gap-3">
                {[
                  "Active mortgage broker, NMLS license (preferred for mortgage referrals)",
                  "Real estate license (for agent referrals)",
                  "No minimum deal volume required",
                  "Free to register — no setup fees",
                  "Co-brokering arrangements available",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-slate-700">
                    <CheckCircle2 size={15} className="text-gold-500 shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="card bg-navy-900 border-navy-800 text-white">
              <h3 className="font-bold text-xl">Register Today</h3>
              <p className="text-slate-400 text-sm mt-2">
                Join our broker network and start earning on every deal you close.
                Setup takes less than 5 minutes.
              </p>
              <ul className="mt-6 flex flex-col gap-3">
                {[
                  "Dedicated account manager assigned within 24 hours",
                  "Access to our full product suite and rate sheets",
                  "Priority deal review for registered partners",
                  "Co-marketing materials available on request",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-slate-300">
                    <CheckCircle2 size={14} className="text-gold-500 shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
              <Link
                href="/apply?type=broker"
                className="btn-primary mt-8 w-full justify-center"
              >
                Register as a Broker Partner
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
