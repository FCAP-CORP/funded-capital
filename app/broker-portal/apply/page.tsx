import { Suspense } from "react";
import ApplyClient from "./ApplyClient";

export const metadata = {
  title: "New Application | Funded Capital Broker Portal",
};

/**
 * The form reads `?draft=<id>` (a saved application to pick up) with
 * useSearchParams, which under cacheComponents must sit inside a <Suspense>
 * boundary or the build refuses to prerender the page.
 */
export default function PortalApplyPage() {
  return (
    <Suspense fallback={null}>
      <ApplyClient />
    </Suspense>
  );
}
