/**
 * Loading shells for the Suspense boundaries on the CRM pages.
 *
 * Sized to the real thing so the layout does not jump when the rows arrive —
 * a shifting grid is the most common way a streamed page feels broken even
 * though it is faster.
 */

export function StatSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="h-2.5 w-20 rounded bg-slate-100" />
          <div className="mt-2 h-6 w-16 rounded bg-slate-100" />
          <div className="mt-2 h-2.5 w-24 rounded bg-slate-50" />
        </div>
      ))}
    </div>
  );
}

export function GridSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="h-9 w-full rounded-lg border border-slate-200 bg-white" aria-hidden="true" />
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden" role="status" aria-label="Loading">
        <div className="h-10 border-b border-slate-200 bg-slate-50" />
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-slate-100 px-3 py-3 last:border-0">
            <div className="h-3 w-40 rounded bg-slate-100" />
            <div className="h-3 w-28 rounded bg-slate-100" />
            <div className="h-3 w-16 rounded bg-slate-50" />
            <div className="h-3 w-24 rounded bg-slate-50" />
          </div>
        ))}
      </div>
    </div>
  );
}
