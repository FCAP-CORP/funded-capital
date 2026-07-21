import { redirect } from "next/navigation";

/**
 * The old per-deal demo page is retired. Submissions and their documents now
 * live in the Google Sheet / Drive; the dashboard links straight to each
 * submission's Drive folder. Any old link here goes back to the dashboard.
 */
export default function DealRedirect() {
  redirect("/broker-portal");
}
