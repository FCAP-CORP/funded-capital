import type { Metadata } from "next";
import CrmNav from "./CrmNav";

export const metadata: Metadata = {
  title: "Lending OS | Funded Capital",
  // Internal tooling. Never in the index, never in the sitemap.
  robots: { index: false, follow: false },
};

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      <CrmNav />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
