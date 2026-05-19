import type { Metadata } from "next";
import Link from "next/link";
import {
  ClipboardList,
  FileText,
  SearchCheck,
  BadgeCheck,
  Banknote,
  ArrowRight,
  Clock,
  Phone,
} from "lucide-react";

export const metadata: Metadata = {
  title: "How It Works",
  description:
    "Learn how Funded Capital's loan process works — from application to funding in as little as 5 business days. Simple, transparent, fast.",
};

const steps = [
  {
    icon: ClipboardList,
    step: "01",
    title: "Submit Your Application",
    desc: "Complete our streamlined online form in under 5 minutes. Tell us about the property, the deal structure, and your experience. No tax returns or pay stubs required for most programs.",
    details: [
      "Property address and type",
      "Purchase price or current value",
      "Loan amount requested",
      "Your real estate experience",
      "Exit strategy",
    ],
  },
  {
    icon: FileText,
    step: "02",
    title: "Receive a Preliminary Term Sheet",
    desc: "Within 2 hours, a dedicated loan officer will review your file and issue a preliminary term sheet outlining your rate, LTV, points, and estimated closing date.",
    details: [
      "No commitment required to receive a term sheet",
      "Clear, itemized fee disclosure",
      "Estimated closing timeline",
      "List of required documents",
    ],
  },
  {
    icon: SearchCheck,
    step: "03",
    title: "Submit Your Documents",
    desc: "Once you accept the terms, we'll collect a focused set of documents. Our underwriting team moves quickly — we don't drag our feet waiting on items that don't move the needle.",
    details: [
      "Purchase contract (or draft)",
      "Entity documents (if applicable)",
      "Scope of work and budget (Fix & Flip)",
      "Property photos or inspection",
      "Bank statements (2 months)",
    ],
  },
  {
    icon: BadgeCheck,
    step: "04",
    title: "Underwriting & Approval",
    desc: "Our in-house underwriting team reviews your file and a third-party appraisal or BPO is ordered. Most loans receive a final commitment letter within 5–7 business days.",
    details: [
      "In-house appraisal management",
      "Title report review",
      "Borrower and entity verification",
      "Final loan commitment issued",
    ],
  },
  {
    icon: Banknote,
    step: "05",
    title: "Close & Fund",
    desc: "Loan is disbursed to the title company on the day of closing. You close the deal. We celebrate with you.",
    details: [
      "Wire same day as closing",
      "Flexible closing scheduling",
      "Post-close support team available",
      "Rehab draws processed within 48 hours",
    ],
  },
];

const faqs = [
  {
    q: "Do I need to be an experienced investor?",
    a: "No. We work with both experienced investors and first-time borrowers. Your exit strategy, the property, and the deal economics matter most.",
  },
  {
    q: "How fast can you really close?",
    a: "Our record is 3 business days. Most deals close in 5–10 business days depending on title, appraisal, and document turnaround.",
  },
  {
    q: "Is there a minimum credit score?",
    a: "We prefer 680+, but we evaluate each deal holistically. Strong deal economics can offset a lower score.",
  },
  {
    q: "Do you charge application fees?",
    a: "No application fees. You'll only incur costs if you move forward — typically an appraisal fee and points at closing.",
  },
  {
    q: "Can I borrow through an LLC or entity?",
    a: "Yes. Most of our borrowers close in an LLC, LP, or other business entity. We encourage it.",
  },
  {
    q: "Do you lend outside your listed states?",
    a: "We lend in 44 states. Contact us to confirm availability in your market.",
  },
];

export default function HowItWorksPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-navy-900 py-16 lg:py-20">
        <div className="section-container">
          <p className="section-label">Our Process</p>
          <h1 className="text-4xl lg:text-5xl font-bold text-white mt-2 max-w-2xl">
            From Application to Funded — in Days
          </h1>
          <p className="text-slate-300 text-lg mt-4 max-w-2xl leading-relaxed">
            We built our process around one principle: serious investors don&apos;t
            have time to waste. Every step is designed to move fast without
            cutting corners.
          </p>
          <div className="flex items-center gap-3 mt-6 text-slate-400 text-sm">
            <Clock size={16} className="text-gold-500" />
            Term sheet in <span className="text-white font-semibold">2 hours</span> &nbsp;·&nbsp; Average closing time: <span className="text-white font-semibold">5–7 business days</span>
          </div>
        </div>
      </section>

      {/* Steps */}
      <section className="section-padding bg-white">
        <div className="section-container">
          <div className="flex flex-col gap-12">
            {steps.map((step, i) => {
              const Icon = step.icon;
              return (
                <article key={step.step} className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
                  {/* Step number + icon */}
                  <div className="lg:col-span-1 flex lg:flex-col items-center lg:items-start gap-4">
                    <div className="flex items-center gap-3">
                      <span className="text-gold-500 font-bold text-5xl leading-none opacity-25">
                        {step.step}
                      </span>
                    </div>
                    <div className="p-3 bg-slate-100 rounded-xl">
                      <Icon size={22} className="text-navy-900" />
                    </div>
                  </div>

                  {/* Content */}
                  <div className="lg:col-span-2">
                    <h2 className="text-xl font-bold text-navy-900">{step.title}</h2>
                    <p className="text-slate-500 mt-3 leading-relaxed">{step.desc}</p>
                  </div>

                  {/* Details */}
                  <div className="lg:col-span-2">
                    <div className="card bg-slate-50 border-slate-100">
                      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">
                        What&apos;s needed / what to expect
                      </p>
                      <ul className="flex flex-col gap-2">
                        {step.details.map((d) => (
                          <li key={d} className="flex items-start gap-2 text-sm text-slate-700">
                            <ArrowRight size={14} className="text-gold-500 shrink-0 mt-0.5" />
                            {d}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {i < steps.length - 1 && (
                    <div className="lg:col-span-5 border-b border-slate-100" />
                  )}
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="section-padding bg-slate-50">
        <div className="section-container">
          <div className="text-center mb-12">
            <p className="section-label">Common Questions</p>
            <h2 className="section-heading">Frequently Asked Questions</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
            {faqs.map((faq) => (
              <article key={faq.q} className="card">
                <h3 className="font-bold text-navy-900 text-sm">{faq.q}</h3>
                <p className="text-slate-500 text-sm mt-2 leading-relaxed">{faq.a}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-navy-900 py-14">
        <div className="section-container flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h2 className="text-2xl font-bold text-white">Ready to get started?</h2>
            <p className="text-slate-400 text-sm mt-1">
              Apply now and receive a term sheet within 24–48 hours.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 shrink-0">
            <Link href="/apply" className="btn-primary">
              Apply Now
              <ArrowRight size={16} />
            </Link>
            <Link href="/contact" className="btn-secondary border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white hover:border-slate-700">
              <Phone size={15} />
              Talk to Us
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
