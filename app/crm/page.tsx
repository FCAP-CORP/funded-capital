import { getPipeline, getCounts } from "@/lib/db/queries";
import { money, daysSince } from "@/lib/crm/view";
import PipelineTable from "./PipelineTable";

/**
 * Pipeline — the Lending OS home screen.
 *
 * A Server Component: the query runs on the server and the grid arrives as HTML
 * with the rows already in it. The only JavaScript that ships is the grid's own
 * interaction code.
 *
 * `force-dynamic` because this reads live pipeline state. A cached CRM that
 * shows yesterday's stages is worse than no CRM.
 */
export const dynamic = "force-dynamic";

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

export default async function PipelinePage() {
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
    <main className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-navy-900">Pipeline</h1>
        <p className="mt-1 text-sm text-slate-500">
          Every application in one place. Change a stage here and the history is written with it.
        </p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Stat label="Open files" value={String(open.length)} sub={`${counts.applications} all time`} />
        <Stat label="Requested" value={money(openValue)} sub="open files only" />
        <Stat
          label="Stalled 30d+"
          value={String(stalled)}
          sub="no stage movement"
          tone={stalled > 0 ? "warn" : "default"}
        />
        <Stat
          label="Contacts"
          value={String(counts.contacts)}
          sub={`${counts.noApplication} with no deal yet`}
        />
      </div>

      <PipelineTable rows={rows} />
    </main>
  );
}
