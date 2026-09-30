import { ClerkProvider } from "@clerk/nextjs";
import { Suspense } from "react";
import type { Metadata } from "next";
import "./globals.css";
import SiteChrome from "@/components/SiteChrome";
import Analytics from "@/components/Analytics";

export const metadata: Metadata = {
  // www is the site's real address (the sitemap, robots.txt and JSON-LD all use
  // it). Every page's relative canonical resolves against this, so it must be
  // www, or each canonical would point at a URL that redirects.
  // No `alternates.canonical` here on purpose: a canonical in the root layout is
  // inherited by every page that does not set its own, declaring them all
  // copies of the home page. Each public page sets its own instead
  // (lib/seo.regress.ts checks).
  metadataBase: new URL("https://www.fundedcapital.com"),
  title: {
    default: "Funded Capital | Private Real Estate Lender",
    template: "%s | Funded Capital",
  },
  description:
    "Fast, flexible private real estate loans for fix & flip, bridge, DSCR, and new construction. Apply in minutes. Fund in days.",
  keywords: [
    "private lender",
    "hard money loans",
    "fix and flip loans",
    "bridge loans",
    "DSCR loans",
    "real estate financing",
    "Funded Capital",
  ],
  openGraph: {
    type: "website",
    // No `url` here: pages without their own openGraph inherit this object,
    // so a url here gave every page og:url = the home page (LinkedIn and
    // Facebook treat og:url as the canonical for a share). Blog posts set
    // their own; everything else lets the scraper use the page's address.
    title: "Funded Capital | Private Real Estate Lender",
    description:
      "Fast, flexible private real estate loans. Fix & Flip, Bridge, DSCR, New Construction. Apply in minutes.",
    siteName: "Funded Capital",
  },
  twitter: {
    card: "summary_large_image",
    title: "Funded Capital | Private Real Estate Lender",
    description:
      "Fast, flexible private real estate loans. Fix & Flip, Bridge, DSCR, New Construction.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
      </head>
      <body className="antialiased">
        {/*
          Next.js 16 Cache Components: Clerk reads live auth data, which is
          dynamic. `dynamic` opts the provider into dynamic rendering, and the
          Suspense boundary lets the static shell prerender while auth streams
          in — resolving "connection() accessed outside <Suspense>".
        */}
        <Suspense fallback={null}>
          <ClerkProvider
            dynamic
            /*
              Defaults for anything Clerk redirects on its own. The two portals
              each have their own sign-in screen and pass their own redirect
              props, which win over these; what is left falling back here is
              broker traffic and Clerk's hosted pages (password resets), so the
              broker portal is the right default. Participants are never routed
              by inference — they arrive at /participant-portal directly.
            */
            signInUrl="/sign-in"
            signUpUrl="/sign-up"
            signInFallbackRedirectUrl="/broker-portal"
            signUpFallbackRedirectUrl="/broker-portal"
          >
            <SiteChrome>{children}</SiteChrome>
          </ClerkProvider>
        </Suspense>
        {/*
          Measurement. Sits outside the Clerk boundary on purpose: analytics
          must not depend on auth resolving, and must still record the visit if
          that boundary ever fails. Loaded lazily, so it costs nothing before
          the page is usable.
        */}
        <Analytics />
      </body>
    </html>
  );
}