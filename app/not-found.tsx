import type { Metadata } from "next";
import Link from "next/link";
import { COMPANY } from "@/lib/site/facts";
import { ArrowLink, Eyebrow } from "@/components/site/ui";

export const metadata: Metadata = {
  title: "Page not found | Funded Capital",
  robots: { index: false },
};

/*
 * Branded 404. A server component with no JavaScript: a visitor who followed
 * an old link lands on a page that still offers the four ways forward an
 * investor usually wants (programs, insights, apply, home) plus the phone.
 */

const links = [
  { href: "/loan-programs", label: "Loan programs", body: "Fix & flip, DSCR, ground-up and multifamily." },
  { href: "/blog", label: "Insights", body: "Guides for real estate investors and brokers." },
  { href: "/", label: "Home", body: "Start from the top." },
];

export default function NotFound() {
  return (
    <section aria-labelledby="nf-heading" className="bg-bone text-deep">
      <div className="section-container grid gap-12 py-20 lg:grid-cols-12 lg:gap-6 lg:py-28">
        <div className="flex flex-col gap-6 lg:col-span-7">
          <Eyebrow>Error 404</Eyebrow>
          <h1 id="nf-heading" className="text-5xl leading-[0.98] sm:text-6xl lg:text-[80px]">
            This page moved or never existed.
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-deep-muted">
            The link may be out of date. If you have a deal to fund, the application takes a few minutes, or call
            us at{" "}
            <a href={COMPANY.phoneHref} className="text-link font-figure">
              {COMPANY.phone}
            </a>
            .
          </p>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Link href="/apply" className="btn-primary text-base">
              Apply now
            </Link>
            <ArrowLink href="/">Back to home</ArrowLink>
          </div>
        </div>
        <nav aria-label="Popular pages" className="self-end lg:col-span-4 lg:col-start-9">
          <ul className="border-t-2 border-deep">
            {links.map((l) => (
              <li key={l.href} className="border-b border-rule">
                <Link href={l.href} className="group flex flex-col gap-1 py-5">
                  <span className="font-headline text-2xl font-semibold transition-colors group-hover:text-brass-700">
                    {l.label}
                  </span>
                  <span className="text-[15px] text-deep-muted">{l.body}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </section>
  );
}
