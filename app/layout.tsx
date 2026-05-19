import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

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
        <Header />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
