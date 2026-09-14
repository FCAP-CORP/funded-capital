import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isCrmStaff } from "@/lib/crm/access";
import CrmNav from "./CrmNav";

export const metadata: Metadata = {
  title: "Lending OS | Funded Capital",
  // Internal tooling. Never in the index, never in the sitemap.
  robots: { index: false, follow: false },
};

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  /**
   * 404, not 403, and not a redirect.
   *
   * A signed-in non-staff user should not learn that /crm exists. The same
   * choice is made on the participant admin route for the same reason. The
   * middleware has already sent signed-out visitors to /sign-in; this is the
   * second gate, and each page and server action carries its own as well.
   */
  if (!(await isCrmStaff())) notFound();

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      <CrmNav />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
