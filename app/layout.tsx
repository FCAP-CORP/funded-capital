import { ClerkProvider } from "@clerk/nextjs";
import { Suspense } from "react";
import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter, Inter_Tight } from "next/font/google";
import "./globals.css";
import SiteChrome from "@/components/SiteChrome";
import Analytics from "@/components/Analytics";

/*
 * Fonts are self-hosted by next/font: downloaded at build time, served from
 * this domain, with size-adjusted fallbacks so text does not jump when they
 * load. They replace a render-blocking Google Fonts @import in globals.css.
 * Inter is the body face everywhere (portals, CRM, public site). The public
 * site adds Inter Tight for headlines, the tighter display cut fintech and
 * lending sites use, and IBM Plex Mono for figures. (Fraunces was tried first
 * on 25 Sep 2026 and dropped: an editorial serif, with an ornate "&", read as
 * a magazine rather than a lender.)
 */
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-headline",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://fundedcapital.com"),
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
    url: "https://fundedcapital.com",
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
    <html
      lang="en"
      className={`${inter.variable} ${interTight.variable} ${plexMono.variable}`}
    >
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