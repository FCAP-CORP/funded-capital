import Link from "next/link";
import { Mail, Phone, MapPin, ArrowRight } from "lucide-react";

const footerLinks = {
  "Loan Programs": [
    { label: "Fix & Flip", href: "/loan-programs#fix-flip" },
    { label: "DSCR / Rental", href: "/loan-programs#dscr" },
    { label: "New Construction", href: "/loan-programs#construction" },
    { label: "Multifamily", href: "/loan-programs#multifamily" },
  ],
  "Company": [
    { label: "About Us", href: "/about" },
    { label: "Why Us", href: "/why-us" },
    { label: "How It Works", href: "/how-it-works" },
    { label: "Broker Program", href: "/broker-program" },
  ],
  "Support": [
    { label: "Contact Us", href: "/contact" },
    { label: "Apply Now", href: "/apply" },
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms of Service", href: "/terms" },
  ],
};

export default function Footer() {
  const currentYear = 2025;

  return (
    <footer className="bg-navy-900 text-slate-300">
      {/* CTA Banner */}
      <div className="bg-gold-500">
        <div className="section-container py-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h2 className="text-navy-900 font-bold text-2xl">
              Ready to fund your next deal?
            </h2>
            <p className="text-navy-800 text-sm mt-1">
              Fast approvals. Competitive rates. No red tape.
            </p>
          </div>
          <Link
            href="/apply"
            className="inline-flex items-center gap-2 bg-navy-900 hover:bg-navy-800 text-white font-semibold px-6 py-3 rounded-xl transition-colors duration-200 shadow-sm shrink-0"
          >
            Apply Now
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>

      {/* Main Footer */}
      <div className="section-container py-14">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10">

          {/* Brand column */}
          <div className="lg:col-span-2">
            <Link href="/" className="inline-block mb-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/LogoWhite.png"
                alt="Funded Capital — Close with Confidence"
                style={{ height: "64px", width: "auto" }}
              />
            </Link>
            <p className="text-slate-400 text-sm leading-relaxed max-w-sm">
              A private real estate lending firm providing fast, flexible capital
              for investors and brokers nationwide. We fund where banks won&apos;t.
            </p>

            {/* Contact details */}
            <div className="mt-6 flex flex-col gap-3 text-sm">
              <a
                href="tel:+13058575620"
                className="flex items-center gap-2 text-slate-400 hover:text-gold-500 transition-colors"
              >
                <Phone size={14} className="shrink-0" />
                +1 (305) 857-5620
              </a>
              <a
                href="mailto:processing@fundedcapital.com"
                className="flex items-center gap-2 text-slate-400 hover:text-gold-500 transition-colors"
              >
                <Mail size={14} className="shrink-0" />
                processing@fundedcapital.com
              </a>
              <span className="flex items-center gap-2 text-slate-400">
                <MapPin size={14} className="shrink-0" />
                100 N Biscayne Blvd, Suite 1210, Miami, FL 33132
              </span>
            </div>
          </div>

          {/* Link columns */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h3 className="text-white font-semibold text-sm uppercase tracking-widest mb-4">
                {category}
              </h3>
              <ul className="flex flex-col gap-2.5">
                {links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-slate-400 hover:text-gold-500 text-sm transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-6 border-t border-navy-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <p>
            &copy; {currentYear} Funded Capital. All rights reserved.
          </p>
          <p>
            This is not an offer to lend. All loans subject to approval.
            Licensed in applicable states.
          </p>
        </div>
      </div>
    </footer>
  );
}
