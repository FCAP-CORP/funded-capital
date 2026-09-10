import type { Metadata } from "next";
import PortalNav from "./PortalNav";
import { isPortalAdmin } from "@/lib/revenueShare.server";

export const metadata: Metadata = {
  title: "Participant Portal | Funded Capital",
  robots: { index: false, follow: false, nocache: true },
};

export default async function ParticipantPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Resolved on the server so the nav never has to ask the browser who it is.
  const admin = await isPortalAdmin();

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      <PortalNav isAdmin={admin} />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
