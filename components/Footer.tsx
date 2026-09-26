import Link from "next/link";
import Logo from "@/components/site/Logo";

/**
 * Public site footer ("Ledger", 25 Sep 2026). Server component, no JavaScript.
 *
 * The brass band keeps Apply Now on every page's last screen, which the brand
 * rules require. Contact details match reference_contact_details: the main
 * line, processing@ and the Biscayne Blvd office.
 */

const columns = [
  {
    title: "Programs",
    links: [
      { label: "Fix & Flip", href: "/fix-and-flip-loans" },
      { label: "DSCR Rental", href: "/dscr-loans" },
      { label: "Ground-Up Construction", href: "/new-construction-loans" },
      { label: "Multifamily & Bridge", href: "/multifamily-loans" },
      { label: "Compare programs", href: "/loan-programs" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Why Funded Capital", href: "/why-us" },
      { label: "How it works", href: "/how-it-works" },
      { label: "Insights", href: "/blog" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    title: "Brokers & tools",
    links: [
      { label: "Broker program", href: "/broker-program" },
      { label: "Broker login", href: "/sign-in" },
      { label: "Loan calculator", href: "/calculator" },
      { label: "Apply now", href: "/apply" },
    ],
  },
];

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer>
      <section aria-labelledby="footer-cta" className="bg-brass-500 text-deep">
        <div className="section-container flex flex-col gap-6 py-12 lg:flex-row lg:items-center lg:justify-between lg:py-14">
          <h2 id="footer-cta" className="font-headline text-3xl font-semibold leading-tight sm:text-4xl lg:max-w-2xl">
            Got a deal under contract? Send it today.
          </h2>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link href="/apply" className="btn-dark text-base">
              Apply now
            </Link>
            <a href="tel:+13058575620" className="font-figure text-base underline-offset-4 hover:underline">
              or call (305) 857-5620
            </a>
          </div>
        </div>
      </section>

      <div className="bg-deep text-[#C9D1DD]">
        <div className="section-container py-14 lg:py-16">
          <div className="grid gap-10 lg:grid-cols-[2fr_1fr_1fr_1fr]">
            <div className="flex flex-col gap-4">
              <Link href="/" aria-label="Funded Capital home" className="self-start">
                <Logo />
              </Link>
              <p className="font-headline text-2xl text-bone">Close with confidence.</p>
              <address className="not-italic text-sm leading-7">
                100 N Biscayne Blvd, Suite 1210, Miami, FL 33132
                <br />
                <a href="tel:+13058575620" className="hover:text-bone">(305) 857-5620</a>
                {" · "}
                <a href="mailto:processing@fundedcapital.com" className="hover:text-bone">
                  processing@fundedcapital.com
                </a>
              </address>
            </div>
            {columns.map((col) => (
              <nav key={col.title} aria-label={col.title} className="flex flex-col gap-3 text-[15px]">
                <h2 className="eyebrow eyebrow-on-deep !font-figure !text-xs !tracking-[0.14em] !font-normal">
                  {col.title}
                </h2>
                {col.links.map((l) => (
                  <Link key={l.href} href={l.href} className="hover:text-bone">
                    {l.label}
                  </Link>
                ))}
              </nav>
            ))}
          </div>
          <div className="mt-12 flex flex-col gap-3 border-t border-bone/15 pt-6 text-xs leading-6 text-[#8B96A8] lg:flex-row lg:justify-between">
            <p className="max-w-3xl">
              Business-purpose loans to real estate investors only; not for owner-occupied property. This is not an
              offer to lend. Rates are shown as ranges. Terms are subject to underwriting, appraisal, title, and
              insurance.
            </p>
            <p className="flex gap-4 shrink-0">
              <span>© {year} Funded Capital</span>
              <Link href="/privacy" className="hover:text-bone">Privacy</Link>
              <Link href="/terms" className="hover:text-bone">Terms</Link>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
