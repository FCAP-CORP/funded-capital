import { Suspense } from "react";
import { PageHeader } from "@/components/ui/page-header";
import ReportsContent from "./ReportsContent";

/**
 * Reports — how the lead engine is performing, over a period you pick.
 *
 * STAFF ONLY: ReportsContent checks isCrmStaff before it reads anything, the
 * layout checks too, and the data loader asserts staff a third time.
 *
 * NO `export const dynamic`, and `searchParams` (the period) is awaited only
 * inside the <Suspense> boundary, in ReportsContent — the same PPR rules as every /crm page
 * (CLAUDE.md, "Known quirks"). The header is a static shell; the period
 * picker, the numbers and the charts stream in together because they all
 * depend on the period.
 *
 * PERFORMANCE: one database query (lib/crm/reports.server.ts), every number
 * computed on the server by lib/crm/reports.ts, charts drawn as divs — no
 * chart library and no client JavaScript on this page at all. Switching the
 * period is a link.
 *
 * CONVERSION — the internal kind: the numbers that change what happens
 * tomorrow are up front (how many leads were contacted, and how fast), and the
 * one that should sting — leads nobody has reached out to — links straight to
 * the work queue.
 */

export const metadata = {
  title: "Reports | Funded Capital Lending OS",
};

function ReportsSkeleton() {
  const block = "rounded-2xl border border-slate-200 bg-white";
  return (
    <div className="flex flex-col gap-5" role="status" aria-label="Loading reports">
      <div className="h-10 w-full max-w-xl rounded-xl bg-slate-200/60" />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className={`${block} h-[124px]`} />)}
      </div>
      <div className={`${block} h-80`} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className={`${block} h-72`} />
        <div className={`${block} h-72`} />
      </div>
    </div>
  );
}

export default function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <main className="mx-auto flex max-w-[1400px] flex-col px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        title="Reports"
        description="How many leads came in, how fast they were contacted, and how far they got — by source, loan type and period."
      />
      <Suspense fallback={<ReportsSkeleton />}>
        <ReportsContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
