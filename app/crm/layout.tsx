import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isCrmStaff } from "@/lib/crm/access";
import WorkspaceShell from "@/components/workspace/WorkspaceShell";

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
   *
   * THIS LINE, NOT THE SIDEBAR, IS WHAT KEEPS BROKERS OUT. `WorkspaceShell`
   * below decides which links a person is shown, which is a courtesy and not a
   * control — see the header of lib/workspace/nav.ts. The gate is here.
   */
  if (!(await isCrmStaff())) notFound();

  return <WorkspaceShell>{children}</WorkspaceShell>;
}
