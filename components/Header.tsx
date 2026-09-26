"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Menu, X } from "lucide-react";
import Logo from "@/components/site/Logo";

/**
 * Public site header ("Ledger", 25 Sep 2026).
 *
 * The only client component in the site chrome: it holds the open/closed state
 * of the mobile menu and the programs dropdown. Everything it renders is plain
 * links, so the page works (and every link is crawlable) before it hydrates.
 * The dropdown closes on Escape and on a click outside, and the mobile menu
 * closes whenever the route changes.
 */

const programs = [
  { label: "Fix & Flip", href: "/fix-and-flip-loans", note: "Purchase and rehab" },
  { label: "DSCR Rental", href: "/dscr-loans", note: "The rent qualifies" },
  { label: "Ground-Up Construction", href: "/new-construction-loans", note: "Build from the lot up" },
  { label: "Multifamily & Bridge", href: "/multifamily-loans", note: "Buy, stabilize, refinance" },
];

const links = [
  { label: "Calculator", href: "/calculator" },
  { label: "How it works", href: "/how-it-works" },
  { label: "Brokers", href: "/broker-program" },
  { label: "Insights", href: "/blog" },
  { label: "About", href: "/about" },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Header() {
  const pathname = usePathname() || "/";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [programsOpen, setProgramsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMobileOpen(false);
    setProgramsOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!programsOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setProgramsOpen(false);
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setProgramsOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [programsOpen]);

  const programActive =
    pathname === "/loan-programs" || programs.some((p) => isActive(pathname, p.href));

  return (
    <header className="sticky top-0 z-50 bg-deep border-b border-bone/10">
      <div className="section-container flex h-16 lg:h-[76px] items-center justify-between gap-6">
        <Link href="/" aria-label="Funded Capital home" className="shrink-0">
          <Logo />
        </Link>

        <nav aria-label="Main" className="hidden lg:flex items-center gap-8 text-[15px] text-[#C9D1DD]">
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setProgramsOpen((o) => !o)}
              aria-expanded={programsOpen}
              aria-controls="programs-menu"
              className={`inline-flex items-center gap-1.5 py-2 hover:text-bone transition-colors ${
                programActive ? "text-bone" : ""
              }`}
            >
              Loan programs
              <ChevronDown size={15} aria-hidden="true" className={`transition-transform ${programsOpen ? "rotate-180" : ""}`} />
            </button>
            {programsOpen && (
              <div
                id="programs-menu"
                className="absolute left-0 top-full mt-3 w-[340px] bg-bone text-deep border border-rule shadow-[0_24px_60px_rgba(0,0,0,0.35)]"
              >
                <ul className="py-2">
                  {programs.map((p) => (
                    <li key={p.href}>
                      <Link
                        href={p.href}
                        className="flex flex-col gap-0.5 px-5 py-3 hover:bg-linen focus-visible:bg-linen focus:outline-none"
                        aria-current={isActive(pathname, p.href) ? "page" : undefined}
                      >
                        <span className="font-headline text-lg font-semibold">{p.label}</span>
                        <span className="text-sm text-deep-muted">{p.note}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/loan-programs"
                  className="block border-t border-rule px-5 py-3 text-sm font-semibold hover:bg-linen"
                >
                  Compare every program
                </Link>
              </div>
            )}
          </div>
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={isActive(pathname, l.href) ? "page" : undefined}
              className={`py-2 hover:text-bone transition-colors ${
                isActive(pathname, l.href) ? "text-bone border-b-2 border-brass-500" : ""
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden lg:flex items-center gap-5">
          <Link href="/sign-in" className="text-[15px] text-[#C9D1DD] hover:text-bone">
            Broker login
          </Link>
          <Link href="/apply" className="btn-primary !min-h-[44px] !py-2 text-[15px]">
            Apply now
          </Link>
        </div>

        <div className="flex lg:hidden items-center gap-2">
          <Link href="/apply" className="btn-primary !min-h-[44px] !px-4 !py-2 text-sm">
            Apply
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen((o) => !o)}
            aria-expanded={mobileOpen}
            aria-controls="mobile-menu"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            className="inline-flex h-11 w-11 items-center justify-center border border-bone/30 text-bone rounded-[2px]"
          >
            {mobileOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav id="mobile-menu" aria-label="Mobile" className="lg:hidden border-t border-bone/10 bg-deep">
          <div className="section-container py-4 flex flex-col">
            <p className="eyebrow eyebrow-on-deep py-2">Loan programs</p>
            {programs.map((p) => (
              <Link key={p.href} href={p.href} className="py-3 border-b border-bone/10 font-headline text-xl text-bone">
                {p.label}
              </Link>
            ))}
            <Link href="/loan-programs" className="py-3 border-b border-bone/10 text-[#C9D1DD]">
              Compare every program
            </Link>
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="py-3 border-b border-bone/10 text-[#C9D1DD]">
                {l.label}
              </Link>
            ))}
            <Link href="/contact" className="py-3 border-b border-bone/10 text-[#C9D1DD]">
              Contact
            </Link>
            <Link href="/sign-in" className="py-3 text-[#C9D1DD]">
              Broker login
            </Link>
            <a href="tel:+13058575620" className="mt-3 font-figure text-brass-300">
              (305) 857-5620
            </a>
          </div>
        </nav>
      )}
    </header>
  );
}
