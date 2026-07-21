"use client";

import { usePathname } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

/**
 * Renders the public marketing Header/Footer on all pages EXCEPT the
 * broker portal and admin app, which use their own full-screen shell.
 * This keeps the existing marketing site untouched.
 */
export default function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "";
  const isApp =
    pathname.startsWith("/broker-portal") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up");

  if (isApp) {
    return <>{children}</>;
  }

  return (
    <>
      <Header />
      <main>{children}</main>
      <Footer />
    </>
  );
}
