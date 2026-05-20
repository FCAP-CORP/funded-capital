"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X, ChevronDown } from "lucide-react";

const navLinks = [
  {
    label: "Loan Programs",
    href: "/loan-programs",
    children: [
      { label: "Fix & Flip Loans", href: "/fix-and-flip-loans" },
      { label: "DSCR / Rental Loans", href: "/dscr-loans" },
      { label: "New Construction", href: "/new-construction-loans" },
      { label: "Multifamily Loans", href: "/multifamily-loans" },
      { label: "View All Programs", href: "/loan-programs" },
    ],
  },
  { label: "Calculator", href: "/calculator" },
  { label: "How It Works", href: "/how-it-works" },
  { label: "Broker Program", href: "/broker-program" },
  {
    label: "Company",
    href: "#",
    children: [
      { label: "About Us", href: "/about" },
      { label: "Why Us", href: "/why-us" },
    ],
  },
  { label: "Contact", href: "/contact" },
];

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const toggleDropdown = (label: string) =>
    setOpenDropdown((prev) => (prev === label ? null : label));

  return (
    <header className="sticky top-0 z-50 bg-navy-900 border-b border-navy-800">
      <div className="section-container">
        <div className="flex items-center justify-between h-16 lg:h-20">

          {/* Logo */}
          <Link href="/" className="flex items-center shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/Original.png"
              alt="Funded Capital — The Key To Limitless Capital"
              style={{ height: "52px", width: "auto" }}
            />
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-6" aria-label="Main navigation">
            {navLinks.map((link) =>
              link.children ? (
                <div key={link.label} className="relative">
                  <button
                    onClick={() => toggleDropdown(link.label)}
                    className="flex items-center gap-1 text-slate-300 hover:text-white font-medium text-sm transition-colors"
                    aria-expanded={openDropdown === link.label}
                  >
                    {link.label}
                    <ChevronDown
                      size={14}
                      className={`transition-transform duration-200 ${openDropdown === link.label ? "rotate-180" : ""}`}
                    />
                  </button>
                  {openDropdown === link.label && (
                    <div className="absolute top-full left-0 mt-2 w-52 bg-navy-800 border border-navy-700 rounded-xl shadow-card-hover py-1 z-50">
                      {link.children.map((child, i) => (
                        <Link
                          key={child.href}
                          href={child.href}
                          onClick={() => setOpenDropdown(null)}
                          className={`block px-4 py-2.5 text-sm text-slate-300 hover:text-white hover:bg-navy-700 transition-colors ${
                            i === link.children!.length - 1
                              ? "border-t border-navy-700 mt-1 pt-3 text-gold-400 hover:text-gold-300"
                              : ""
                          }`}
                        >
                          {child.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-slate-300 hover:text-white font-medium text-sm transition-colors"
                >
                  {link.label}
                </Link>
              )
            )}
          </nav>

          {/* Desktop CTA */}
          <div className="hidden lg:flex items-center gap-3">
            <Link href="/apply" className="btn-primary text-sm px-5 py-2.5">
              Apply Now
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            className="lg:hidden p-2 text-slate-300 hover:text-white"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle mobile menu"
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="lg:hidden border-t border-navy-800 bg-navy-900">
          <nav className="section-container py-4 flex flex-col gap-1" aria-label="Mobile navigation">
            {navLinks.map((link) =>
              link.children ? (
                <div key={link.label}>
                  <p className="px-3 py-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
                    {link.label}
                  </p>
                  {link.children.map((child) => (
                    <Link
                      key={child.href}
                      href={child.href}
                      onClick={() => setMobileOpen(false)}
                      className="block px-3 py-2 text-slate-300 hover:text-white hover:bg-navy-800 rounded-lg text-sm font-medium transition-colors"
                    >
                      {child.label}
                    </Link>
                  ))}
                </div>
              ) : (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="block px-3 py-2 text-slate-300 hover:text-white hover:bg-navy-800 rounded-lg text-sm font-medium transition-colors"
                >
                  {link.label}
                </Link>
              )
            )}
            <div className="pt-3 mt-1 border-t border-navy-800">
              <Link
                href="/apply"
                onClick={() => setMobileOpen(false)}
                className="btn-primary w-full text-sm"
              >
                Apply Now
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
