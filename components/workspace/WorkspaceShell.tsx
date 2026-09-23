import { workspaceNav } from "@/lib/workspace/nav.server";
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
 * PERFORMANCE: one `<Suspense>`-friendly server component; the only client
 * JavaScript in the frame is the sidebar's mobile drawer toggle. The content
 * column is untouched, so every page under it keeps the static-shell-plus-
 * boundary shape that `cacheComponents` needs.
 */
export default async function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const sections = await workspaceNav();

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      <WorkspaceNav sections={sections} />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
