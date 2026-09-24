import { Suspense } from "react";
import { notFound } from "next/navigation";
import { isCrmStaff } from "@/lib/crm/access";
import { getPipeline, getCounts } from "@/lib/db/queries";
import { money, daysSince } from "@/lib/crm/view";
import PipelineTable from "./PipelineTable";
import { GridSkeleton, StatSkeleton } from "./Skeleton";
import ViewToggle from "./ViewToggle";

/**
 * Pipeline — the Lending OS home screen.
 *
 * NO `export const dynamic = "force-dynamic"` HERE. This project runs Next 16
 * with `cacheComponents: true` (see next.config.ts), which rejects the old route
 * segment config outright — the build fails with "not compatible with
 * nextConfig.cacheComponents".
 *
 * Cache Components asks the question differently: the page is a static shell,
 * and anything that reads live data goes inside a <Suspense> boundary, which
 * makes that subtree dynamic on its own. That is strictly better here. The
 * heading and sidebar paint immediately from the prerendered shell and the grid
 * streams in behind them, instead of the whole screen waiting on Postgres.
 */

export const metadata = {
  title: "Pipeline | Funded Capital Lending OS",
};

function Stat({ label, value, sub, tone = "default" }: {
  label: string; value: string; sub?: string; tone?: "default" | "warn";
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${tone === "warn" ? "text-amber-600" : "text-navy-900"}`}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

/** Everything that touches the database lives in here, behind the boundary. */
async function Pipeline() {
  // Checked here too, not only in the layout: a layout and its page render
  // concurrently, so this is what guarantees the query never runs for someone
  // who is not staff.
  if (!(await isCrmStaff())) notFound();

  const [rows, counts] = await Promise.all([getPipeline(), getCounts()]);

  const open = rows.filter((r) => r.stage !== "closed_lost" && r.stage !== "payoff");

  // Requested amount, not funded amount — nothing here has closed yet, and
  // labelling a pipeline number as volume is how a forecast becomes a promise.
  const openValue = open.reduce((sum, r) => sum + (Number(r.requestedAmount) || 0), 0);

  // The number that decides today's work: open files with no movement in 30 days.
  const stalled = open.filter((r) => {
    const d = daysSince(r.stageEnteredAt);
    return d !== null && d >= 30;
  }).length;

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <Stat label="Open files" value={String(open.length)} sub={`${counts.applications} all time`} />
        <Stat label="Requested" value={money(openValue)} sub="open files only" />
        <Stat
          label="Stalled 30d+"
          value={String(stalled)}
          sub="no stage movement"
          tone={stalled > 0 ? "warn" : "default"}
        />
        <Stat
          label="Never contacted"
          value={String(counts.neverContacted)}
          sub="no call, text or email"
          tone={counts.neverContacted > 0 ? "warn" : "default"}
        />
        <Stat
          label="Contacts"
          value={String(counts.contacts)}
          sub={`${counts.noApplication} with no deal yet`}
        />
      </div>

      <PipelineTable rows={rows} />
    </>
  );
}

export default function PipelinePage() {
  return (
    <main className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Pipeline</h1>
          <p className="mt-1 text-sm text-slate-500">
            Every application in one place. Change a stage here and the history is written with it.
          </p>
        </div>
        <ViewToggle current="table" />
      </header>

      <Suspense fallback={<><StatSkeleton /><GridSkeleton /></>}>
        <Pipeline />
      </Suspense>
    </main>
  );
}
