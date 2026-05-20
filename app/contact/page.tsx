import type { Metadata } from "next";
import Link from "next/link";
import { Mail, Phone, MapPin, Clock, ArrowRight } from "lucide-react";
import ContactForm from "@/components/ContactForm";

export const metadata: Metadata = {
  title: "Contact Us",
  description:
    "Get in touch with the Funded Capital team — by phone, email, or form. We respond within 4 business hours.",
};

const contactInfo = [
  {
    icon: Phone,
    label: "Phone",
    value: "+1 (305) 857-5620",
    href: "tel:+13058575620",
    sub: "Mon–Fri, 8am–6pm ET",
  },
  {
    icon: Mail,
    label: "Email",
    value: "processing@fundedcapital.com",
    href: "mailto:processing@fundedcapital.com",
    sub: "Response within 2 business hours",
  },
  {
    icon: MapPin,
    label: "Headquarters",
    value: "100 N Biscayne Blvd, Suite 1210",
    href: null,
    sub: "Miami, FL 33132 — Lending in 44 States",
  },
  {
    icon: Clock,
    label: "Hours",
    value: "Mon–Fri: 8am–6pm ET",
    href: null,
    sub: "Sat: 10am–2pm ET",
  },
];

export default function ContactPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-navy-900 py-16 lg:py-20">
        <div className="section-container max-w-3xl">
          <p className="section-label">Contact Us</p>
          <h1 className="text-4xl lg:text-5xl font-bold text-white mt-2">
            Talk to a Real Person
          </h1>
          <p className="text-slate-300 text-lg mt-4 leading-relaxed">
            Questions about a loan, an active deal, or just want to explore your
            options? Reach out — we respond within 4 business hours.
          </p>
        </div>
      </section>

      <section className="section-padding bg-white">
        <div className="section-container">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">

            {/* Contact Info */}
            <div className="flex flex-col gap-6">
              <div>
                <p className="section-label">Get in Touch</p>
                <h2 className="text-2xl font-bold text-navy-900 mt-2">
                  We&apos;re Here to Help
                </h2>
                <p className="text-slate-500 text-sm mt-3 leading-relaxed">
                  Whether you have a deal ready to go or just want to explore
                  your financing options, our team is ready to help.
                </p>
              </div>

              <div className="flex flex-col gap-4">
                {contactInfo.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.label} className="flex items-start gap-3">
                      <div className="p-2 bg-slate-100 rounded-lg shrink-0 mt-0.5">
                        <Icon size={16} className="text-navy-900" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                          {item.label}
                        </p>
                        {item.href ? (
                          <a
                            href={item.href}
                            className="font-semibold text-navy-900 hover:text-gold-600 transition-colors text-sm"
                          >
                            {item.value}
                          </a>
                        ) : (
                          <p className="font-semibold text-navy-900 text-sm">
                            {item.value}
                          </p>
                        )}
                        <p className="text-slate-400 text-xs mt-0.5">{item.sub}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Apply shortcut */}
              <div className="card bg-slate-50 border-slate-100 mt-2">
                <p className="font-bold text-navy-900 text-sm">
                  Ready to apply?
                </p>
                <p className="text-slate-500 text-xs mt-1">
                  Skip the back-and-forth — apply online and get a term sheet
                  within 24–48 hours.
                </p>
                <Link href="/apply" className="btn-primary mt-4 text-sm w-full justify-center">
                  Apply Now
                  <ArrowRight size={14} />
                </Link>
              </div>
            </div>

            {/* Contact Form */}
            <div className="lg:col-span-2">
              <ContactForm />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
