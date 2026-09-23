import type { Metadata } from "next";
import { Suspense } from "react";
import { currentUser } from "@clerk/nextjs/server";
import { isCrmStaff } from "@/lib/crm/access";
import { admitBroker } from "@/lib/broker/provision";
import PortalNav from "./PortalNav";
import AccessGate from "./AccessGate";

export const metadata: Metadata = {
  title: "Broker Portal | Funded Capital",
  robots: { index: false, follow: false },
};

/**
 * Admission to the broker portal is decided HERE, in the layout, not in a page.
 *
 * THE REASON IS A HOLE I ALMOST SHIPPED. Putting the check on the dashboard
 * page would have left `/broker-portal/apply`, `/broker-portal/price` and the
 * rest wide open — an uninvited visitor could skip the front door and submit an
 * application. The layout wraps every route under `/broker-portal`, so there is
 * one door and no way around it.
 *
 * It also means someone who is refused never sees the broker navigation at all.
 * A refusal screen sitting inside the product's own sidebar reads as a glitch;
 * a clean standalone page reads as a deliberate answer.
 *
 * `proxy.ts` has already sent signed-out visitors to /sign-in. This is the
 * second gate, and — like /crm — each page and server action beneath it still
 * carries its own checks, because a layout and its page render concurrently.
 */

async function Shell({ children }: { children: React.ReactNode }) {
  const user = await currentUser();

  /**
   * Staff pass without an invitation and without a broker row.
   *
   * Luis owns this product; telling him he needs an invitation to it would be
   * absurd, and creating a broker row for him would put him in his own
   * unassigned queue. `resolveBrokerViewer` still returns null for him, so the
   * dashboard shows its empty state — which is truthful, as he has no broker
   * deals of his own.
   */
  const staff = await isCrmStaff();

  if (!staff) {
    const email = user?.primaryEmailAddress?.emailAddress ?? null;
    const outcome = await admitBroker(user?.id, email, user?.fullName);
    if (!outcome.admitted) return <AccessGate email={email} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      <PortalNav />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}
