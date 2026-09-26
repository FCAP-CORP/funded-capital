"use client";

import { usePathname } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

/**
 * Renders the public marketing Header/Footer on all pages EXCEPT the signed-in
 * applications, which supply their own full-screen shell.
 *
 * Every app route must be listed here. /participant-portal was missing, so a
 * participant who signed in to look at their own money got the marketing
 * navigation bolted above their portal — "Apply Now", "Broker Login" and the
 * Funded Capital logo a second time, over a private financial page. /crm was
 * missing for the same reason. When a new signed-in area is added, its prefix
 * belongs in this list on day one.
 */
const APP_PREFIXES = [
  "/broker-portal",
  "/participant-portal",
  "/crm",
  "/admin",
  "/sign-in",
  "/sign-up",
];

export default function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "";
  const isApp = APP_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (isApp) {
    return <>{children}</>;
  }

  /*
   * `.site` scopes the public look ("Ledger", globals.css) to these pages only,
   * so the portals and the CRM above never pick it up.
   */
  return (
    <div className="site">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:bg-bone focus:px-4 focus:py-2 focus:text-deep"
      >
        Skip to content
      </a>
      <Header />
      <main id="main">{children}</main>
      <Footer />
    </div>
  );
}
