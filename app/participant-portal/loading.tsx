/**
 * Shown the instant a portal link is clicked.
 *
 * The sheet behind this portal answers in seconds, not milliseconds. Without a
 * loading boundary Next holds the old page on screen until the new one is
 * ready, so a click looked like nothing happened. This skeleton makes every
 * navigation feel immediate and tells the reader work is in progress.
 */
export default function ParticipantPortalLoading() {
  return (
    <div className="p-5 sm:p-8 lg:p-10 max-w-5xl mx-auto animate-pulse" aria-busy="true">
      <span className="sr-only">Loading your participation…</span>

      {/* Header */}
      <div className="border-b border-slate-200 pb-6 mb-8">
        <div className="h-2.5 w-32 rounded bg-slate-200 mb-3" />
        <div className="h-7 w-64 rounded bg-slate-300" />
        <div className="h-3 w-48 rounded bg-slate-200 mt-3" />
      </div>

      {/* Figures */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="h-2.5 w-20 rounded bg-slate-200" />
            <div className="h-6 w-28 rounded bg-slate-300 mt-4" />
            <div className="h-2.5 w-16 rounded bg-slate-200 mt-3" />
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="h-11 border-b border-slate-200 bg-slate-50" />
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-5 py-3.5 border-b border-slate-100 last:border-0"
          >
            <div className="h-3 w-24 rounded bg-slate-200" />
            <div className="h-3 w-40 rounded bg-slate-200" />
            <div className="h-3 w-20 rounded bg-slate-200 ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
