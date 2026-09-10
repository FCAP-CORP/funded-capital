import { redirect } from "next/navigation";
import { getMyParticipation } from "@/lib/revenueShare.server";

export const metadata = {
  title: "Signing you in | Funded Capital",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * The post-sign-in switchboard.
 *
 * One Clerk instance serves two audiences. Invitations created in the Clerk
 * Dashboard cannot carry a redirect URL of their own, so every newly activated
 * account would otherwise land in the broker portal regardless of who they are.
 * This route asks the one question that settles it — does this email hold any
 * participations? — and forwards accordingly. Participants never see the broker
 * portal, and brokers are unaffected.
 *
 * Guarded in proxy.ts, so an unauthenticated visitor is sent to sign in first.
 */
export default async function PortalRouter() {
  const result = await getMyParticipation();
  redirect(result.ok ? "/participant-portal" : "/broker-portal");
}
