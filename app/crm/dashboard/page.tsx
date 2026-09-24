import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AlertTriangle, Clock, Copy, FileWarning, MailQuestion, Reply, UserX } from "lucide-react";
import { isCrmStaff } from "@/lib/crm/access";
import { getDashboardApplications } from "@/lib/db/queries";
import {
  QUEUE_DEFAULTS,
  REASON_LABEL,
  buildWorkQueue,
  computeKpis,
  queueSummary,
  snoozedItems,
  snoozesBrokenByInbound,
  stageCounts,
  type QueueReason,
  type SnoozedItem,
} from "@/lib/crm/dashboard";
import { STAGE_LABEL, ageLabel, label, money } from "@/lib/crm/view";
import { nyDayLabel, putDownHeading, queueRows, type QueueRowView } from "@/lib/crm/queueView";
import { GridSkeleton, StatSkeleton } from "../Skeleton";
import { BringBackButton, QueueRowActions } from "./QueueRowActions";

/**
 * Dashboard — the numbers, and then the work.
 *
 * ORDER IS THE ARGUMENT. The KPIs are a compact strip at the top and the work
 * queue is the body of the page, because a number saying "84 stalled" changes
 * nothing about today and a list saying "these people are waiting, longest
 * first" is a morning. A dashboard that only reports gets admired once and then
 * ignored; this one is meant to be worked down.
 *
 * NO `export const dynamic` — same rule as every other /crm page. Next 16 with
 * `cacheComponents: true` rejects route segment config outright, so the page is
 * a static shell and everything touching the database sits inside <Suspense>.
 *
 * PERFORMANCE: the only client JavaScript is QueueRowActions.tsx — the row
 * buttons and the "bring back" button, one small module with no dependencies
 * beyond React and the icons already on the page. Every row, badge and bar is
 * server-rendered HTML; the bars are divs with a width percentage, not a
 * charting library. The heading and the empty frame paint from the prerendered
 * shell and the data streams in behind them. One database round trip feeds
 * every section, because the queue, the put-down list, the KPIs and the funnel
 * are readings of the same rows rather than separate queries. A button press
 * is one server action, and the refreshed list comes back in that same
 * response — no second fetch.
 *
 * CONVERSION — the internal kind: every queue row carries a mailto link with
 * the borrower's address already in it. The gap between noticing someone has
 * waited twenty days and actually writing to them is where this kind of screen
 * usually dies, so the reply is one click from the finding, not a search away
 * on another page.
 *
 * And the record of having done it is one click from the row too: "Log call",
 * "Log email", "Log text", a note, a snooze, a stage. Work that has to be
 * written down somewhere else afterwards mostly is not written down, and then
 * the queue keeps nagging about a borrower who was phoned this morning.
 */

export const metadata = {
  title: "Dashboard | Funded Capital Lending OS",
};

/** Matches the Pipeline page's stat tile exactly — one visual language. */
function Stat({ label: text, value, sub, tone = "default" }: {
  label: string; value: string; sub?: string; tone?: "default" | "warn";
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">{text}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${tone === "warn" ? "text-amber-600" : "text-navy-900"}`}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

const REASON_ICON: Record<QueueReason, React.ComponentType<{ size?: number; className?: string }>> = {
  awaiting_reply: MailQuestion,
  term_sheet_cold: FileWarning,
  duplicate: Copy,
  stalled: Clock,
  never_contacted: UserX,
};

/**
 * Badge tone carries severity, and the icon and the word carry it too.
 *
 * Never colour alone: an amber pill and a red pill are the same pill to a
 * colourblind reader, so every badge ships its label and its own icon.
 */
const REASON_TONE: Record<QueueReason, string> = {
  awaiting_reply: "bg-red-50 text-red-700 border-red-200",
  term_sheet_cold: "bg-amber-50 text-amber-700 border-amber-200",
  duplicate: "bg-violet-50 text-violet-700 border-violet-200",
  stalled: "bg-slate-100 text-slate-700 border-slate-200",
  never_contacted: "bg-slate-100 text-slate-700 border-slate-200",
};

function ReasonBadge({ reason }: { reason: QueueReason }) {
  const Icon = REASON_ICON[reason];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${REASON_TONE[reason]}`}>
      <Icon size={12} />
      {REASON_LABEL[reason]}
    </span>
  );
}

/**
 * "They wrote back after you put this down."
 *
 * The one badge on this screen that means a decision you made is now out of
 * date. Its own icon and words, never colour alone, same as the reasons.
 */
function WroteBackBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
      <Reply size={12} aria-hidden="true" />
      Wrote back while snoozed
    </span>
  );
}

/**
 * One deal: the facts on the first line, the things you can do on the second.
 *
 * Each deal is its own <tbody> — several are valid HTML — so the hover
 * highlight covers the deal and its controls together, and the columns above
 * keep their widths instead of being squeezed by a sixth column of buttons.
 */
function QueueRow({ item }: { item: QueueRowView }) {
  return (
    <tbody className="border-t border-slate-100 hover:bg-slate-50 [&>tr>td:first-child]:pl-4 [&>tr>td:last-child]:pr-4">
      <tr>
        <td className="pt-3 pb-2 pr-4 align-top">
          <p className="font-medium text-navy-900">{item.name}</p>
          {item.email ? (
            <a href={`mailto:${item.email}`} className="text-xs text-slate-500 hover:text-gold-700 underline-offset-2 hover:underline">
              {item.email}
            </a>
          ) : (
            <p className="text-xs text-slate-400">no email on file</p>
          )}
        </td>
        <td className="pt-3 pb-2 pr-4 align-top">
          <div className="flex flex-col items-start gap-1">
            {item.reason && <ReasonBadge reason={item.reason} />}
            {item.wroteBack && <WroteBackBadge />}
          </div>
        </td>
        <td className="pt-3 pb-2 pr-4 align-top text-sm tabular-nums text-slate-700 whitespace-nowrap">
          {ageLabel(item.waitingDays)}
        </td>
        <td className="pt-3 pb-2 pr-4 align-top text-sm text-slate-600">{label(STAGE_LABEL, item.stage)}</td>
        <td className="pt-3 pb-2 align-top text-sm tabular-nums text-slate-700 text-right whitespace-nowrap">
          {item.requestedAmount ? money(item.requestedAmount) : "—"}
        </td>
      </tr>
      <tr>
        <td colSpan={5} className="pb-3">
          <QueueRowActions applicationId={item.applicationId} name={item.name} stage={item.stage} />
        </td>
      </tr>
    </tbody>
  );
}

/**
 * Everything put down, with the count on top.
 *
 * Shown, not hidden: a queue that can be emptied by snoozing, with no record of
 * what was snoozed, rewards parking work over doing it. Nothing put down is one
 * quiet line rather than an empty box.
 */
function PutDown({ items, now }: { items: SnoozedItem[]; now: Date }) {
  const heading = putDownHeading(items, now);
  if (!heading) {
    return <p className="mb-10 text-sm text-slate-500">Nothing put down.</p>;
  }
  return (
    <section className="mb-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="text-lg font-bold text-navy-900">{heading}</h2>
        <p className="text-sm text-slate-500">Off the queue until the date — or until they write to you</p>
      </div>
      <ul className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
        {items.map((p) => (
          <li key={p.applicationId} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="font-medium text-navy-900">{p.name}</p>
              <p className="text-xs text-slate-500">
                {label(STAGE_LABEL, p.stage)}
                <span aria-hidden="true"> · </span>
                <span className="sr-only">, </span>
                back <span className="tabular-nums text-slate-700">{nyDayLabel(p.until, now)}</span>
              </p>
              {p.note && <p className="mt-1 text-xs italic text-slate-600 break-words">{p.note}</p>}
            </div>
            <BringBackButton applicationId={p.applicationId} name={p.name} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** How many rows to show before the list stops being a list. */
const QUEUE_LIMIT = 30;

async function Dashboard() {
  // Checked here as well as in the layout: a layout and its page render
  // concurrently, so this is what keeps the query from running for a non-staff
  // user. getDashboardApplications asserts staff a third time, for itself.
  if (!(await isCrmStaff())) notFound();

  const apps = await getDashboardApplications();

  // One clock for every decision on the page, so the queue, the put-down list
  // and the wrote-back badge cannot disagree about what "now" is.
  const now = new Date();

  const kpis = computeKpis(apps, now);
  const queue = buildWorkQueue(apps, QUEUE_DEFAULTS, now);
  const summary = queueSummary(queue).filter((s) => s.count > 0);
  const stages = stageCounts(apps);
  const rows = queueRows(queue, apps, snoozesBrokenByInbound(apps, now), now);
  const parked = snoozedItems(apps, now);

  const shown = rows.slice(0, QUEUE_LIMIT);
  const remaining = rows.length - shown.length;

  // The widest bar sets the scale. Every other bar is read against it, so a
  // book with one enormous stage renders honestly as one enormous bar.
  const peak = Math.max(1, ...stages.map((s) => s.count));

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-8">
        <Stat label="Funded YTD" value={money(kpis.fundedYtd.amount)} sub={`${kpis.fundedYtd.count} loans`} />
        <Stat label="Funded MTD" value={money(kpis.fundedThisMonth.amount)} sub={`${kpis.fundedThisMonth.count} this month`} />
        <Stat label="Submitted MTD" value={String(kpis.submittedThisMonth)} sub="new applications" />
        <Stat label="Lost MTD" value={String(kpis.lostThisMonth)} sub="closed — lost" />
        <Stat label="Open files" value={String(kpis.openCount)} sub={`${apps.length} all time`} />
        <Stat label="Requested" value={money(kpis.openRequested)} sub="open files only" />
      </div>

      {/* ---------------------------------------------------- the work queue */}
      <section className="mb-10">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <h2 className="text-lg font-bold text-navy-900">Needs you today</h2>
          <p className="text-sm text-slate-500">
            {rows.length === 0 ? "Nothing waiting" : `${rows.length} ${rows.length === 1 ? "file" : "files"}, most urgent first`}
          </p>
        </div>

        {summary.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {summary.map((s) => (
              <span key={s.reason} className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                <ReasonBadge reason={s.reason} />
                <span className="tabular-nums font-semibold text-navy-900">{s.count}</span>
              </span>
            ))}
          </div>
        )}

        {rows.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
            <p className="text-sm text-slate-600">
              Nothing is waiting on a reply, going stale, or sitting untouched. That is the goal state,
              not a broken query — the counts above still add up.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                  <th className="py-2.5 px-4 font-semibold">Borrower</th>
                  <th className="py-2.5 pr-4 font-semibold">Why</th>
                  <th className="py-2.5 pr-4 font-semibold">Waiting</th>
                  <th className="py-2.5 pr-4 font-semibold">Stage</th>
                  <th className="py-2.5 pr-4 font-semibold text-right">Requested</th>
                </tr>
              </thead>
              {shown.map((item) => <QueueRow key={item.applicationId} item={item} />)}
            </table>
            {remaining > 0 && (
              <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
                {remaining} more below the top {QUEUE_LIMIT}. Clear these first — they have waited longest.
              </p>
            )}
          </div>
        )}
      </section>

      {/* ------------------------------------------------ what was put down */}
      <PutDown items={parked} now={now} />

      {/* -------------------------------------------------- the funnel shape */}
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <h2 className="text-lg font-bold text-navy-900">Pipeline shape</h2>
          <p className="text-sm text-slate-500">Every stage, including the empty ones</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <ul className="space-y-2">
            {stages.map((s) => (
              <li key={s.stage} className="grid grid-cols-[9.5rem_1fr_auto] items-center gap-3">
                <span className="text-xs text-slate-600 truncate">{label(STAGE_LABEL, s.stage)}</span>
                {/*
                  One series, so one hue and no legend — the heading names what
                  is plotted. The track is a lighter step of the same ramp so an
                  empty stage still reads as a stage rather than as missing data.
                */}
                <span className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                  <span
                    className="block h-full rounded-r-full bg-navy-800"
                    style={{ width: `${(s.count / peak) * 100}%` }}
                  />
                </span>
                <span className="text-xs tabular-nums text-slate-700 w-10 text-right">{s.count}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}

export default function DashboardPage() {
  return (
    <main className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-navy-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          Where the book stands, and who is waiting on you.
        </p>
      </header>

      <Suspense fallback={<><StatSkeleton /><GridSkeleton /></>}>
        <Dashboard />
      </Suspense>
    </main>
  );
}
