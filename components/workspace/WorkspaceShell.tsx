import { resolveEntitlement, workspaceNav } from "@/lib/workspace/nav.server";
import { Toaster } from "@/components/ui/toast";
import WorkspaceNav from "./WorkspaceNav";

/**
 * The frame both halves of the signed-in product render inside.
 *
 * A server component, so the link list is computed where the answer can be
 * trusted and arrives in the HTML rather than being assembled in the browser
 * from something the browser was told about itself.
 *
 * IT IS NOT A GATE. `/crm/layout.tsx` and `/broker-portal/layout.tsx` each
 * decide admission BEFORE rendering this, and each page and server action
 * beneath them checks again. Wrapping something in this shell grants nothing.
 *
 * `canSearch` turns on the staff half of the ⌘K palette (deals and people).
 * It is the same cached `isCrmStaff()` answer the sidebar already used, so it
 * costs no extra lookup — and like the sidebar it is a courtesy: the search
 * route asserts staff for itself and 404s everyone else.
 *
 * PERFORMANCE: one `<Suspense>`-friendly server component; the client
 * JavaScript in the frame is the sidebar (drawer toggle + the ⌘K listener) and
 * the ~1 KB toaster. The palette itself, and `cmdk` with it, is loaded only
 * when someone opens it. The content column is untouched, so every page under
 * it keeps the static-shell-plus-boundary shape that `cacheComponents` needs.
 */
export default async function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const [sections, entitlement] = await Promise.all([workspaceNav(), resolveEntitlement()]);

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      <WorkspaceNav sections={sections} canSearch={entitlement.lendingOs} />
      <div className="flex-1 min-w-0">{children}</div>
      <Toaster />
    </div>
  );
}
