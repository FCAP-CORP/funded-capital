import Link from "next/link";
import { LayoutGrid, Table2 } from "lucide-react";

/**
 * Table / Board switch for the pipeline. Two links, no JavaScript.
 *
 * Separate routes rather than a ?view= parameter: reading search params under
 * Partial Prerendering would push the whole page behind Suspense, and each
 * route refreshes only itself after an action (see CrmRoute in ./actions.ts).
 */
export default function ViewToggle({ current }: { current: "table" | "board" }) {
  const item = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
      active ? "bg-white text-navy-900 shadow-sm" : "text-slate-500 hover:text-navy-900"
    }`;
  return (
    <nav aria-label="Pipeline view" className="inline-flex rounded-lg bg-slate-100 p-0.5">
      <Link href="/crm" className={item(current === "table")} aria-current={current === "table" ? "page" : undefined}>
        <Table2 className="h-3.5 w-3.5" aria-hidden /> Table
      </Link>
      <Link href="/crm/board" className={item(current === "board")} aria-current={current === "board" ? "page" : undefined}>
        <LayoutGrid className="h-3.5 w-3.5" aria-hidden /> Board
      </Link>
    </nav>
  );
}
