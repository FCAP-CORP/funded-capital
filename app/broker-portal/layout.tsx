import type { Metadata } from "next";
import PortalNav from "./PortalNav";

export const metadata: Metadata = {
  title: "Broker Portal | Funded Capital",
  robots: { index: false, follow: false },
};

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      <PortalNav />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
