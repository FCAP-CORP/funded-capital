import DashboardClient from "./DashboardClient";

/**
 * The broker's dashboard.
 *
 * Admission is NOT decided here — it is decided once in `layout.tsx`, which
 * wraps every route under /broker-portal. Putting the check on this page would
 * have left /broker-portal/apply and /broker-portal/price reachable by anyone
 * signed in. See the note in the layout.
 */
export const metadata = {
  title: "Dashboard | Funded Capital Broker Portal",
};

export default function DashboardPage() {
  return <DashboardClient />;
}
