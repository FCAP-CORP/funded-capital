import { ClerkProvider } from "@clerk/nextjs";
import { Suspense } from "react";
import type { Metadata } from "next";
import "./globals.css";
import SiteChrome from "@/components/SiteChrome";
import Analytics from "@/components/Analytics";

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
              Clerk's own hosted screens and its emailed invitation links need
              to know where this application's sign-in and sign-up pages live,
              and where to send someone once they are through. An invitation
              created in the Clerk Dashboard cannot carry its own redirect, so
              everyone lands on /portal, which forwards each person to the
              portal they actually belong to.
            */
            signInUrl="/sign-in"
            signUpUrl="/sign-up"
            signInFallbackRedirectUrl="/portal"
            signUpFallbackRedirectUrl="/portal"
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