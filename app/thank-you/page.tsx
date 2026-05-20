import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, ArrowRight, Phone, Mail } from "lucide-react";

export const metadata: Metadata = {
  title: "Thank You | Funded Capital",
  description: "Your message has been received. A Funded Capital loan officer will be in touch shortly.",
  robots: { index: false, follow: false },
};

export default function ThankYouPage() {
  return (
    <section className="bg-slate-50 section-padding min-h-[70vh] flex items-center">
      <div className="section-container">
        <div className="max-w-xl mx-auto text-center">
          <div className="flex justify-center mb-6">
            <div className="p-4 bg-gold-500/10 rounded-full">
              <CheckCircle2 size={48} className="text-gold-500" />
            </div>
          </div>

          <h1 className="text-3xl lg:text-4xl font-bold text-navy-900">
            We&apos;ve Received Your Submission
          </h1>
          <p className="text-slate-500 mt-4 leading-relaxed">
            Thank you for reaching out to Funded Capital. A loan officer will
            review your information and be in touch within 2 business hours.
          </p>

          <div className="mt-8 card bg-white text-left flex flex-col gap-4">
            <p className="font-semibold text-navy-900 text-sm">Need to reach us directly?</p>
            <a
              href="tel:+13058575620"
              className="flex items-center gap-2 text-slate-600 hover:text-gold-600 transition-colors text-sm"
            >
              <Phone size={15} className="text-gold-500 shrink-0" />
              +1 (305) 857-5620
            </a>
            <a
              href="mailto:processing@fundedcapital.com"
              className="flex items-center gap-2 text-slate-600 hover:text-gold-600 transition-colors text-sm"
            >
              <Mail size={15} className="text-gold-500 shrink-0" />
              processing@fundedcapital.com
            </a>
          </div>

          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/" className="btn-primary">
              Back to Home
              <ArrowRight size={16} />
            </Link>
            <Link href="/loan-programs" className="btn-secondary">
              View Loan Programs
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
