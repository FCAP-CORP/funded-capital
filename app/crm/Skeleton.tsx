import { Skeleton } from "@/components/ui/skeleton";
import { cardClass } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Loading shells for the Suspense boundaries on the CRM pages.
 *
 * Sized to the real thing so the layout does not jump when the rows arrive —
 * a shifting grid is the most common way a streamed page feels broken even
 * though it is faster. Built from the kit's Skeleton, which stops pulsing
 * under `prefers-reduced-motion`.
 */

export function StatSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div
      className={cn("mb-6 grid grid-cols-2 gap-3 sm:gap-4", count === 5 ? "lg:grid-cols-5" : count === 3 ? "sm:grid-cols-3" : "lg:grid-cols-4")}
      aria-hidden="true"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={cn(cardClass, "flex flex-col gap-2.5 p-4 sm:p-5", count === 5 && i === 4 && "col-span-2 lg:col-span-1")}>
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-16" />
          <Skeleton className="h-3 w-24 bg-slate-50" />
        </div>
      ))}
    </div>
  );
}

export function GridSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label="Loading">
      <div className="flex gap-2" aria-hidden="true">
        <div className="h-10 flex-1 rounded-lg border border-slate-200 bg-white" />
        <div className="hidden h-9 w-24 rounded-lg border border-slate-200 bg-white sm:block" />
        <div className="hidden h-9 w-24 rounded-lg border border-slate-200 bg-white sm:block" />
      </div>
      <div className={cn(cardClass, "overflow-hidden")} aria-hidden="true">
        <div className="h-10 border-b border-slate-200 bg-slate-50" />
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-slate-100 px-3 py-3 last:border-0">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3 w-16 bg-slate-50" />
            <Skeleton className="h-3 w-24 bg-slate-50" />
          </div>
        ))}
      </div>
    </div>
  );
}
