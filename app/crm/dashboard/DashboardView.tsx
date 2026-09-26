import Link from "next/link";
import { ArrowRight, ChevronDown, Clock, MessageSquareText, Reply } from "lucide-react";
import { STAGE_LABEL, label } from "@/lib/crm/view";
import { nyDayLabel } from "@/lib/crm/queueView";
import {
  QUEUE_PREVIEW,
  followUpsLine,
  type Attention,
  type DashboardModel,
  type Kpi,
  type QueueCard,
  type QueueTab,
  type SourceGroup,
  type StageBar,
  type WeekBucket,
} from "@/lib/crm/dashboardView";
import type { SnoozedItem } from "@/lib/crm/dashboard";
import { RecordLink } from "../_record/RecordCardProvider";
import { BringBackButton, QueueRowActions } from "./QueueRowActions";
import { QueueTabs } from "./QueueTabs";
import { DueTasks, type DueTaskItem } from "./DueTasks";
import { cardClass } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";

/**
 * The dashboard, drawn from a model that has already been computed.
 *
 * A SERVER COMPONENT WITH NO DATA ACCESS. Everything it shows arrives in
 * `model` (lib/crm/dashboardView.ts builds it, pure and tested); nothing here
 * reads the database, the clock or Clerk. That split is what lets the layout be
 * rendered with made-up data and looked at before a deploy.
 *
 * The client pieces are small and named: QueueTabs (which panel is visible),
 * QueueRowActions (Log call + the More menu), DueTasks (the checkboxes) and
 * RecordLink (opening a card). The charts are server-rendered divs — no chart
 * library, no client JavaScript — with a visually hidden table carrying the
 * same numbers for screen readers.
 */

/** The kit's card surface (components/ui/card.tsx) — identical classes, one definition. */
const card = cardClass;
const h2 = "text-lg font-bold text-navy-900";
const quiet = "text-[13px] text-slate-500";
const textLink =
  "rounded-sm text-[13px] font-semibold text-navy-900 underline decoration-gold-500 decoration-2 underline-offset-4 " +
  "hover:decoration-navy-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-700";

/* ------------------------------------------------------------ attention */

function AttentionStrip({ a }: { a: Attention }) {
  if (a.kind === "calm") {
    // Calm is not an alarm: no navy, no gold button, nothing that shouts zero.
    return (
      <section aria-label="Most urgent" className={`${card} flex items-center gap-4 px-5 py-4`}>
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100">
          <MessageSquareText size={20} className="text-slate-600" aria-hidden="true" />
        </div>
        <p className="text-sm text-slate-700">
          <span className="font-semibold text-navy-900">{a.headline}</span> {a.detail}
        </p>
      </section>
    );
  }
  return (
    <section
      aria-label="Most urgent"
      className="flex flex-col gap-4 rounded-2xl bg-navy-900 px-5 py-[18px] text-white sm:flex-row sm:items-center sm:justify-between sm:px-[22px]"
    >
      <div className="flex items-start gap-4 sm:items-center">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gold-500/20">
          <MessageSquareText size={22} className="text-gold-400" aria-hidden="true" />
        </div>
        <div className="flex flex-col gap-0.5">
          <p className="text-[17px] font-bold">{a.headline}</p>
          <p className="text-sm text-slate-300">{a.detail}</p>
        </div>
      </div>
      <RecordLink
        applicationId={a.top.applicationId}
        label={`Open ${a.top.name}'s record, who has waited longest`}
        className="inline-flex h-11 shrink-0 items-center justify-center gap-2 self-start whitespace-nowrap rounded-xl bg-gold-500 px-[18px] text-sm font-bold text-navy-950 hover:bg-gold-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-navy-900 sm:self-auto"
      >
        Open {a.top.name}
        <ArrowRight size={16} aria-hidden="true" />
      </RecordLink>
    </section>
  );
}

/* ------------------------------------------------------------------ KPIs */

/** The kit's StatCard was cut from this card; the Pipeline page's strip uses the same one. */
function KpiCard({ title, kpi }: { title: string; kpi: Kpi }) {
  return <StatCard title={title} value={kpi.value} sub={kpi.sub} tone={kpi.tone === "warn" ? "warn" : "default"} />;
}

/* ------------------------------------------------------------ work queue */

/*
 * One row template, three widths. Five columns where the queue has room —
 * the last one a fixed width, so the header row lines up with the rows under it —
 * a full-width card below lg, the 2fr column at xl and up — and a two-line
 * row where it does not (a phone, or the 2fr column on a 1024px laptop).
 */
const ROW_COLS =
  "grid-cols-[minmax(0,1fr)_auto] " +
  "md:grid-cols-[minmax(0,2.1fr)_minmax(0,0.75fr)_minmax(0,1.5fr)_minmax(0,0.95fr)_9.25rem] " +
  "lg:grid-cols-[minmax(0,1fr)_auto] " +
  "xl:grid-cols-[minmax(0,2.1fr)_minmax(0,0.75fr)_minmax(0,1.5fr)_minmax(0,0.95fr)_9.25rem]";

const WAIT_TONE: Record<QueueCard["tone"], string> = {
  red: "font-bold text-red-700",
  amber: "font-bold text-amber-700",
  plain: "font-semibold text-slate-700",
};

function WroteBackBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
      <Reply size={11} aria-hidden="true" />
      Wrote back while snoozed
    </span>
  );
}

function QueueRow({ r }: { r: QueueCard }) {
  return (
    <li className={`grid ${ROW_COLS} items-center gap-x-3 gap-y-2 border-t border-slate-100 px-4 py-3 sm:px-5`}>
      <div className="col-span-2 flex min-w-0 flex-col gap-1 md:col-span-1 lg:col-span-2 xl:col-span-1">
        <RecordLink
          applicationId={r.applicationId}
          label={`Open the full record for ${r.name}`}
          className="group/name flex min-w-0 items-center gap-3 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
        >
          <span
            aria-hidden="true"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-navy-900 text-[13px] font-bold text-gold-400"
          >
            {r.initials}
          </span>
          <span className="flex min-w-0 flex-col">
            <span title={r.name} className="truncate text-sm font-semibold text-navy-900 underline decoration-transparent underline-offset-2 group-hover/name:decoration-gold-500">
              {r.name}
            </span>
            <span className="break-words text-xs text-slate-500">{r.sub}</span>
          </span>
        </RecordLink>
        {r.wroteBack && r.sub !== "Wrote back while snoozed" && (
          <span className="pl-12"><WroteBackBadge /></span>
        )}
      </div>

      {/* Three facts: a wrapped line on a narrow row, three columns on a wide one. */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 pl-12 md:contents lg:flex xl:contents">
        <span className={`text-sm tabular-nums ${WAIT_TONE[r.tone]}`}>
          <span className="sr-only">Waiting </span>
          {r.waitLabel}
        </span>
        <span className="min-w-0">
          <span className="sr-only">Stage: </span>
          <span className="inline-block max-w-full truncate rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
            {r.stageLabel}
          </span>
        </span>
        <span className="text-sm font-semibold tabular-nums text-navy-900 md:text-right lg:text-left xl:text-right">
          {r.amount ? (
            <><span className="sr-only">Requested </span>{r.amount}</>
          ) : (
            <span className="font-normal text-slate-500"><span aria-hidden="true" className="hidden md:inline lg:hidden xl:inline">—</span><span className="sr-only">No amount requested</span></span>
          )}
        </span>
      </div>

      <div className="justify-self-end">
        <QueueRowActions applicationId={r.applicationId} name={r.name} stage={r.stage} />
      </div>
    </li>
  );
}

function QueuePanel({ tab }: { tab: QueueTab }) {
  const first = tab.rows.slice(0, QUEUE_PREVIEW);
  const rest = tab.rows.slice(QUEUE_PREVIEW);
  return (
    <>
      <div
        aria-hidden="true"
        className={`hidden ${ROW_COLS} gap-x-3 px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500 sm:px-5 md:grid lg:hidden xl:grid`}
      >
        <span>Borrower</span><span>Waiting</span><span>Stage</span><span className="text-right">Requested</span><span />
      </div>
      <ul aria-label={`${tab.label}: ${tab.count} ${tab.count === 1 ? "file" : "files"}`}>
        {first.map((r) => <QueueRow key={r.applicationId} r={r} />)}
      </ul>
      {rest.length > 0 ? (
        <details className="group/more">
          <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-500 sm:px-5 [&::-webkit-details-marker]:hidden">
            <span className={quiet}>
              <span className="group-open/more:hidden">Showing {first.length} of {tab.count}</span>
              <span className="hidden group-open/more:inline">Showing all {tab.count}</span>
              {" · one reason per file, so nobody appears twice"}
            </span>
            <span className="text-[13px] font-semibold text-navy-900 underline decoration-gold-500 decoration-2 underline-offset-4">
              <span className="group-open/more:hidden">Show all {tab.count}</span>
              <span className="hidden group-open/more:inline">Show fewer</span>
            </span>
          </summary>
          <ul aria-label={`The other ${rest.length} in ${tab.label}`}>
            {rest.map((r) => <QueueRow key={r.applicationId} r={r} />)}
          </ul>
        </details>
      ) : (
        <p className={`border-t border-slate-100 px-4 py-3.5 sm:px-5 ${quiet}`}>
          One reason per file, so nobody appears twice.
        </p>
      )}
    </>
  );
}

/**
 * Everything put down, collapsed under the queue with the count on its summary.
 * Shown, not hidden: a queue that can be emptied by snoozing, with no record of
 * what was snoozed, rewards parking work over doing it.
 */
function PutDown({ items, heading, now }: { items: SnoozedItem[]; heading: string | null; now: Date }) {
  if (!heading) {
    return <p className={`border-t border-slate-100 px-4 py-3.5 sm:px-5 ${quiet}`}>Nothing put down.</p>;
  }
  return (
    <details className="group/put border-t border-slate-100">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-500 sm:px-5 [&::-webkit-details-marker]:hidden">
        <span className="text-sm font-semibold text-navy-900">{heading}</span>
        <ChevronDown size={16} className="shrink-0 text-slate-500 transition-transform group-open/put:rotate-180" aria-hidden="true" />
      </summary>
      <p className={`px-4 pb-2 sm:px-5 ${quiet}`}>Off the queue until the date, or until they write to you.</p>
      <ul className="divide-y divide-slate-100 border-t border-slate-100">
        {items.map((p) => (
          <li key={p.applicationId} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 sm:px-5">
            <div className="min-w-0">
              <RecordLink
                applicationId={p.applicationId}
                label={`Open the full record for ${p.name}`}
                className="block w-fit rounded-sm text-sm font-semibold text-navy-900 underline decoration-slate-300 underline-offset-2 hover:decoration-gold-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
              >
                {p.name}
              </RecordLink>
              <p className="text-xs text-slate-500">
                {label(STAGE_LABEL, p.stage)}
                <span aria-hidden="true"> · </span>
                <span className="sr-only">, </span>
                back <span className="tabular-nums text-slate-700">{nyDayLabel(p.until, now)}</span>
              </p>
              {p.note && <p className="mt-1 break-words text-xs italic text-slate-600">{p.note}</p>}
            </div>
            <BringBackButton applicationId={p.applicationId} name={p.name} />
          </li>
        ))}
      </ul>
    </details>
  );
}

function WorkQueue({ model, now }: { model: DashboardModel; now: Date }) {
  const { tabs, queueTotal } = model;
  return (
    <section aria-labelledby="queue-h" className={`${card} flex min-w-0 flex-col`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pb-3.5 pt-5 sm:px-5">
        <h2 id="queue-h" className={h2}>Needs you today</h2>
        <span className={quiet}>
          {queueTotal === 0 ? "Nothing waiting" : `${queueTotal} ${queueTotal === 1 ? "file" : "files"} · most urgent first`}
        </span>
      </div>
      {tabs.length === 0 ? (
        <p className="border-t border-slate-100 px-4 py-8 text-center text-sm text-slate-600 sm:px-5">
          Nothing is waiting on a reply, going stale, or sitting untouched. That is the goal state,
          not a broken query.
        </p>
      ) : (
        <QueueTabs
          label="Work queue by reason"
          tabs={tabs.map((t) => ({ key: t.reason, label: t.label, count: t.count }))}
          panels={tabs.map((t) => <QueuePanel key={t.reason} tab={t} />)}
        />
      )}
      <PutDown items={model.parked} heading={model.parkedHeading} now={now} />
    </section>
  );
}

/* ------------------------------------------------------------ due today */

/** How many tasks to list before summarising the rest. */
const TASKS_SHOWN = 8;

function DueToday({ model }: { model: DashboardModel }) {
  const { tasks, followUps } = model;
  const shown: DueTaskItem[] = tasks.slice(0, TASKS_SHOWN).map((t) => ({
    id: t.id,
    title: t.title,
    applicationId: t.applicationId,
    borrower: t.borrower,
    when: t.when,
    overdue: t.overdueDays > 0,
  }));
  const more = tasks.length - shown.length;
  return (
    <section aria-labelledby="due-h" className={`${card} flex flex-col gap-3.5 p-5`}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="due-h" className={h2}>Due today</h2>
        <span className={`${quiet} whitespace-nowrap`}>tasks + follow-ups</span>
      </div>
      {tasks.length === 0 && followUps === 0 ? (
        <p className="text-sm text-slate-600">Nothing due today.</p>
      ) : (
        <>
          {tasks.length > 0 ? <DueTasks items={shown} /> : <p className="text-sm text-slate-600">No tasks due.</p>}
          {more > 0 && <p className="text-xs text-slate-500">and {more} more due or overdue, on their deals</p>}
          {followUps > 0 && (
            <p className="flex items-center gap-3 border-t border-slate-100 pt-3 text-sm text-navy-900">
              <Clock size={18} className="shrink-0 text-gold-700" aria-hidden="true" />
              <span>
                <span className="font-semibold">{followUpsLine(followUps).lead}</span> {followUpsLine(followUps).rest}
              </span>
            </p>
          )}
        </>
      )}
    </section>
  );
}

/* ---------------------------------------------------- pipeline by stage */

const BAR_TONE: Record<StageBar["tone"], string> = {
  navy: "bg-navy-900",
  gold: "bg-gold-500",
  empty: "bg-transparent",
};

function PipelineByStage({ stages }: { stages: StageBar[] }) {
  return (
    <section aria-labelledby="stage-h" className={`${card} flex flex-col gap-3 p-5`}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="stage-h" className={h2}>Pipeline by stage</h2>
        <Link href="/crm/board" className={textLink}>Open board</Link>
      </div>
      <ul className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_2.25rem] items-center gap-x-3 gap-y-2.5 text-[13px]">
        {stages.map((s) => (
          <li key={s.key} className="col-span-3 grid grid-cols-subgrid items-center">
            <span className="leading-tight text-navy-900">
              {s.label}
              {s.members.length > 1 && (
                <span className="sr-only"> ({s.members.map((m) => STAGE_LABEL[m] ?? m).join(", ")} combined)</span>
              )}
            </span>
            <span aria-hidden="true" className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              <span
                className={`block h-full rounded-full ${BAR_TONE[s.tone]}`}
                style={{ width: s.count > 0 ? `max(${s.pct}%, 6px)` : "0%" }}
              />
            </span>
            <span className={`text-right font-bold tabular-nums ${s.count === 0 ? "text-slate-500" : "text-navy-900"}`}>
              {s.count}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-slate-500">Gold marks the conversion gate: term sheet issued, then signed.</p>
    </section>
  );
}

/* ---------------------------------------------------------- lead sources */

/**
 * The same four source colours as /crm/reports (tailwind `chart-*`, checked
 * for colour-blind separation), so a source is one colour everywhere. White
 * gaps between segments, and the numbers printed in the legend.
 */
const SOURCE_TONE: Record<SourceGroup, string> = {
  website: "bg-chart-website",
  biggerpockets: "bg-chart-bp",
  broker: "bg-chart-broker",
  other: "bg-chart-other",
};

function LeadSources({ model }: { model: DashboardModel }) {
  const { total, slices } = model.sources;
  return (
    <section aria-labelledby="src-h" className={`${card} flex flex-col gap-3 p-5`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <h2 id="src-h" className={h2}>Where leads came from</h2>
        <span className={`${quiet} whitespace-nowrap`}>last 30 days</span>
      </div>
      {total === 0 ? (
        <p className="text-sm text-slate-600">No applications arrived in the last 30 days.</p>
      ) : (
        <>
          <div aria-hidden="true" className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full">
            {slices.filter((s) => s.count > 0).map((s) => (
              <span key={s.key} className={`min-w-[4px] basis-0 ${SOURCE_TONE[s.key]}`} style={{ flexGrow: s.count }} />
            ))}
          </div>
          <ul className="flex flex-col gap-2 text-[13px]" aria-label={`${total} applications by source`}>
            {slices.map((s) => (
              <li key={s.key} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-navy-900">
                  <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-[3px] ${SOURCE_TONE[s.key]}`} />
                  {s.label}
                </span>
                <span className="tabular-nums">
                  <span className="font-bold text-navy-900">{s.count}</span>
                  <span className="text-slate-500"> · {s.pct}%</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/* ----------------------------------------------------------- weekly trend */

function Bar({ value, peak, tone }: { value: number; peak: number; tone: "navy" | "gold" }) {
  return (
    <div
      className={`relative w-full max-w-[1.25rem] rounded-t-[3px] ${tone === "navy" ? "bg-navy-900" : "bg-gold-500"}`}
      style={{ height: `${(value / peak) * 100}%` }}
    >
      {value > 0 && (
        <span className="absolute bottom-full left-1/2 mb-0.5 -translate-x-1/2 text-[10px] font-semibold tabular-nums text-slate-600 max-sm:hidden">
          {value}
        </span>
      )}
    </div>
  );
}

function WeeklyTrend({ weeks, peak }: { weeks: WeekBucket[]; peak: number }) {
  const totalSubmitted = weeks.reduce((s, w) => s + w.submitted, 0);
  const totalTerm = weeks.reduce((s, w) => s + w.termSheets, 0);
  return (
    <section aria-labelledby="trend-h" className={`${card} flex flex-col gap-4 p-5`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 id="trend-h" className={h2}>Applications per week</h2>
        <div className="flex gap-4 text-[13px] text-slate-600" aria-hidden="true">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-navy-900" />Submitted</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-gold-500" />Term sheet issued</span>
        </div>
      </div>

      <div aria-hidden="true">
        <div className="flex h-40 items-end gap-1 border-b border-slate-200 pt-5 sm:gap-3">
          {weeks.map((w) => (
            <div key={w.start} className="flex h-full min-w-0 flex-1 items-end justify-center gap-0.5 sm:gap-1">
              <Bar value={w.submitted} peak={peak} tone="navy" />
              <Bar value={w.termSheets} peak={peak} tone="gold" />
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex gap-1 sm:gap-3">
          {weeks.map((w, i) => (
            <span
              key={w.start}
              className={`min-w-0 flex-1 whitespace-nowrap text-center text-[10px] text-slate-500 sm:text-[11px] ${
                (weeks.length - 1 - i) % 2 === 1 ? "max-sm:invisible" : ""
              }`}
            >
              {w.partial ? "This wk" : w.label}
            </span>
          ))}
        </div>
      </div>

      {/* The wrapper is what hides it: a table ignores width:1px and would widen the page. */}
      <div className="sr-only">
      <table>
        <caption>
          Applications submitted and term sheets first issued per week, last {weeks.length} weeks, Monday to
          Sunday, New York time. {totalSubmitted} submitted and {totalTerm} term sheets in total.
        </caption>
        <thead>
          <tr><th scope="col">Week</th><th scope="col">Submitted</th><th scope="col">Term sheets issued</th></tr>
        </thead>
        <tbody>
          {weeks.map((w) => (
            <tr key={w.start}>
              <th scope="row">{w.range}{w.partial ? " (so far)" : ""}</th>
              <td>{w.submitted}</td>
              <td>{w.termSheets}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      <p className="text-xs text-slate-500">
        Last {weeks.length} weeks, Monday to Sunday, New York time; this week so far. Submitted counts the day an
        application arrived; term sheets count the first move into Term Sheet Issued.
      </p>
    </section>
  );
}

/* ------------------------------------------------------------- the page */

export function DashboardBody({ model, now }: { model: DashboardModel; now: Date }) {
  const { kpis } = model;
  return (
    <div className="flex flex-col gap-6">
      <AttentionStrip a={model.attention} />

      <section aria-label="The book" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard title="Open pipeline" kpi={kpis.pipeline} />
        <KpiCard title="Submitted this month" kpi={kpis.submitted} />
        <KpiCard title="Term sheets out" kpi={kpis.termSheets} />
        <KpiCard title="Funded year to date" kpi={kpis.funded} />
      </section>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <WorkQueue model={model} now={now} />
        <div className="flex min-w-0 flex-col gap-5">
          <DueToday model={model} />
          <PipelineByStage stages={model.stages} />
          <LeadSources model={model} />
        </div>
      </div>

      <WeeklyTrend weeks={model.weeks} peak={model.weekPeak} />
    </div>
  );
}
