import { Suspense } from "react";
import { notFound } from "next/navigation";
import { isCrmStaff } from "@/lib/crm/access";
import { getPipeline, getCounts } from "@/lib/db/queries";
import { money, daysSince } from "@/lib/crm/view";
import PipelineTable from "./PipelineTable";
import { GridSkeleton, StatSkeleton } from "./Skeleton";
import ViewToggle from "./ViewToggle";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { RecordCardProvider } from "./_record/RecordCardProvider";
import RecordCardSlot from "./_record/RecordCardSlot";

/** The route every action on this page refreshes — the record card's included. */
const HERE = "/crm" as const;

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
      {/* The same KPI card as the dashboard (components/ui/stat-card.tsx). */}
      <section aria-label="The pipeline in numbers" className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatCard title="Open files" value={String(open.length)} sub={`${counts.applications} all time`} />
        <StatCard title="Requested" value={money(openValue)} sub="open files only" />
        <StatCard
          title="Stalled 30d+"
          value={String(stalled)}
          sub="no stage movement"
          tone={stalled > 0 ? "warn" : "default"}
        />
        <StatCard
          title="Never contacted"
          value={String(counts.neverContacted)}
          sub="no call, text or email"
          tone={counts.neverContacted > 0 ? "warn" : "default"}
        />
        <StatCard
          title="Contacts"
          value={counts.contacts.toLocaleString("en-US")}
          sub={`${counts.noApplication.toLocaleString("en-US")} with no deal yet`}
          className="col-span-2 lg:col-span-1"
        />
      </section>

      <PipelineTable rows={rows} />
    </>
  );
}

/**
 * `searchParams` is passed down as a PROMISE and only awaited inside the
 * record card's own <Suspense> — reading it here would make the whole page
 * unprerenderable under cacheComponents (see CLAUDE.md). `?open=<id>` opens
 * the record card over the grid.
 */
export default function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <RecordCardProvider here={HERE}>
      <main className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        <PageHeader
          title="Pipeline"
          description="Every application in one place. Change a stage here — one deal or fifty — and the history is written with it."
          actions={<ViewToggle current="table" />}
        />

        <Suspense fallback={<><StatSkeleton count={5} /><GridSkeleton /></>}>
          <Pipeline />
        </Suspense>

        <Suspense fallback={null}>
          <RecordCardSlot searchParams={searchParams} from={HERE} />
        </Suspense>
      </main>
    </RecordCardProvider>
  );
}
