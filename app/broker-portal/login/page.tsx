import { redirect } from "next/navigation";

/**
 * The old demo login is retired. Real authentication is handled by Clerk at
 * /sign-in (the proxy redirects unauthenticated users there automatically).
 * Anyone landing here who is already signed in goes straight to the dashboard.
 */
export default function PortalLoginRedirect() {
  redirect("/broker-portal");
}
