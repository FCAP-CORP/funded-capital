import Link from "next/link";
import { cardClass } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { compactMoney } from "@/lib/crm/dashboardView";
import type { SourceGroup } from "@/lib/crm/dashboardView";
import {
  RANGES, RANGE_LABEL, SOURCE_LABEL_SHORT, durationLabel, niceMax, pctLabel,
  type RangeKey, type ReportsModel, type TrendBucket,
} from "@/lib/crm/reports";

/**
 * The reports page body. SERVER-RENDERED, ZERO CLIENT JAVASCRIPT: charts are
 * divs sized by percentage (the dashboard's approach), hover detail is the
 * native `title` tooltip on each mark, the range picker is plain links, and
 * every chart has a visually hidden table with the exact numbers.
 *
 * COLOUR. Lead sources use a four-hue palette checked with the data-viz
 * validator (lightness band, chroma, colour-blind separation between
 * neighbours: all pass). Two of the four sit under 3:1 against white, which
 * is why every chart that uses them also prints its numbers in the legend and
 * has the table. The same four colours mark the same sources on the
 * dashboard, so a colour means one thing everywhere. Single-measure charts
 * are navy. Text is never drawn in a series colour.
 */

const card = `${cardClass} flex min-w-0 flex-col gap-4 p-5`;
const h2 = "text-lg font-bold text-navy-900";
const quiet = "text-[13px] text-slate-500";
const note = "text-xs text-slate-500";

export const SOURCE_FILL: Record<SourceGroup, string> = {
  website: "bg-chart-website",
  biggerpockets: "bg-chart-bp",
  broker: "bg-chart-broker",
  other: "bg-chart-other",
};
const SOURCE_KEYS: SourceGroup[] = ["website", "biggerpockets", "broker", "other"];

const n = (v: number) => v.toLocaleString("en-US");

/* ------------------------------------------------------------ range picker */

export function RangePicker({ active }: { active: RangeKey }) {
  return (
    <nav aria-label="Report period" className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1">
      {RANGES.map((r) => (
        <Link
          key={r}
          href={r === "90d" ? "/crm/reports" : `/crm/reports?range=${r}`}
          aria-current={r === active ? "page" : undefined}
          scroll={false}
          className={
            "rounded-lg px-3 py-1.5 text-[13px] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 " +
            (r === active ? "bg-navy-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-navy-900")
          }
        >
          {RANGE_LABEL[r]}
        </Link>
      ))}
    </nav>
  );
}

/* ------------------------------------------------------------------- KPIs */

function Kpis({ m }: { m: ReportsModel }) {
  const k = m.kpis;
  return (
    <section aria-label="Headline numbers" className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
      <StatCard title="New leads" value={n(k.leads)} sub={m.window.label.toLowerCase()} />
      <StatCard
        title="Contacted"
        value={pctLabel(k.contactedPct)}
        sub={`${n(k.contacted)} of ${n(k.leads)} reached out to`}
        tone={k.contactedPct !== null && k.contactedPct < 80 ? "warn" : "default"}
      />
      <StatCard
        title="Within 24 hours"
        value={pctLabel(k.within24hPct)}
        sub={`${n(k.within24h)} leads contacted the same day`}
        tone={k.within24hPct !== null && k.within24hPct < 50 ? "warn" : "default"}
      />
      <StatCard title="Median first contact" value={durationLabel(k.medianResponseHours)} sub="from arrival to first email, text or call" />
      <StatCard
        title="Lead → term sheet"
        value={pctLabel(k.cohortConversionPct)}
        sub={`${n(k.cohortTermSheets)} of these leads so far · ${n(k.termSheetsIssued)} issued in period`}
      />
      <StatCard
        title="Funded in period"
        value={n(k.funded)}
        sub={k.funded > 0 ? `${compactMoney(k.fundedVolume)} requested` : "none recorded in period"}
      />
    </section>
  );
}

/* ------------------------------------------------------------ lead trend */

function Legend({ totals }: { totals: Record<SourceGroup, number> }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-slate-700" aria-label="Sources">
      {SOURCE_KEYS.map((g) => (
        <li key={g} className="flex items-center gap-1.5">
          <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-[3px] ${SOURCE_FILL[g]}`} />
          {SOURCE_LABEL_SHORT[g]}
          <span className="font-semibold tabular-nums text-navy-900">{n(totals[g])}</span>
        </li>
      ))}
    </ul>
  );
}

function Column({ b, max }: { b: TrendBucket; max: number }) {
  const tip = `${b.range}${b.partial ? " (so far)" : ""}: ${b.total} lead${b.total === 1 ? "" : "s"}` +
    SOURCE_KEYS.filter((g) => b.bySource[g] > 0).map((g) => `\n${SOURCE_LABEL_SHORT[g]}: ${b.bySource[g]}`).join("");
  return (
    <div title={tip} className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end">
      {b.total > 0 && (
        <span className="mb-1 text-[10px] font-semibold tabular-nums text-slate-600 max-sm:hidden">{b.total}</span>
      )}
      {/* Stacked from the baseline; a 2px white gap between segments; rounded only at the top. */}
      <div
        className="flex w-full max-w-6 flex-col-reverse gap-[2px] overflow-hidden rounded-t-[4px] group-hover:opacity-80"
        style={{ height: `${(b.total / max) * 100}%` }}
      >
        {SOURCE_KEYS.filter((g) => b.bySource[g] > 0).map((g) => (
          <span key={g} className={`block w-full ${SOURCE_FILL[g]}`} style={{ flexGrow: b.bySource[g], flexBasis: 0, minHeight: 2 }} />
        ))}
      </div>
    </div>
  );
}

function LeadTrend({ m }: { m: ReportsModel }) {
  const { buckets, foldedBefore } = m.trend;
  const peak = Math.max(0, ...buckets.map((b) => b.total));
  const max = niceMax(peak);
  const totals = Object.fromEntries(SOURCE_KEYS.map((g) => [g, buckets.reduce((s, b) => s + b.bySource[g], 0)])) as Record<SourceGroup, number>;
  const every = buckets.length > 16 ? 3 : buckets.length > 8 ? 2 : 1;
  const grain = m.window.grain === "week" ? "week" : "month";
  return (
    <section aria-labelledby="trend-h" className={card}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 id="trend-h" className={h2}>New leads per {grain}, by source</h2>
        <Legend totals={totals} />
      </div>

      <div aria-hidden="true" className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-2">
        <div className="relative h-52 text-right text-[10px] tabular-nums text-slate-500">
          <span className="absolute right-0 top-0 -translate-y-1/2">{max}</span>
          <span className="absolute right-0 top-1/2 -translate-y-1/2">{max / 2}</span>
          <span className="absolute bottom-0 right-0 translate-y-1/2">0</span>
        </div>
        <div className="relative h-52">
          {/* Hairline gridlines at max and half, solid, recessive. */}
          <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-slate-100" />
          <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-slate-100" />
          <div className="absolute inset-0 flex items-end gap-1 border-b border-slate-300 sm:gap-2">
            {buckets.map((b) => <Column key={b.key} b={b} max={max} />)}
          </div>
        </div>
        <div />
        <div className="mt-1.5 flex gap-1 sm:gap-2">
          {buckets.map((b, i) => (
            <span
              key={b.key}
              className={`min-w-0 flex-1 whitespace-nowrap text-center text-[10px] text-slate-500 sm:text-[11px] ${
                (buckets.length - 1 - i) % every !== 0 ? "invisible" : (buckets.length - 1 - i) % (every * 3) !== 0 ? "max-sm:invisible" : ""
              }`}
            >
              {b.partial ? (grain === "week" ? "This wk" : "This mo") : b.label}
            </span>
          ))}
        </div>
      </div>

      <div className="sr-only">
        <table>
          <caption>New leads per {grain} by source, {m.window.label.toLowerCase()}, New York time.</caption>
          <thead>
            <tr><th scope="col">{grain === "week" ? "Week" : "Month"}</th>{SOURCE_KEYS.map((g) => <th key={g} scope="col">{SOURCE_LABEL_SHORT[g]}</th>)}<th scope="col">Total</th></tr>
          </thead>
          <tbody>
            {buckets.map((b) => (
              <tr key={b.key}>
                <th scope="row">{b.range}{b.partial ? " (so far)" : ""}</th>
                {SOURCE_KEYS.map((g) => <td key={g}>{b.bySource[g]}</td>)}
                <td>{b.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className={note}>
        Counted on the day each lead arrived. Hover a column for its breakdown.
        {foldedBefore && ` Leads before ${foldedBefore.slice(0, 7)} are included in the first column.`}
      </p>
    </section>
  );
}

/* --------------------------------------------------------------- hbars */

type HBar = { key: string; label: string; value: number; display: string; sub?: string; muted?: boolean };

function HBars({ rows, caption }: { rows: HBar[]; caption: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <>
      {/*
        Phone: label and value on one line, the bar full width underneath.
        sm and up: three columns, label | bar | value. Either way the bar
        never shrinks to nothing because a long label took its room.
      */}
      <ul aria-hidden="true" className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-[13px] sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto] sm:gap-y-2.5">
        {rows.map((r) => (
          <li
            key={r.key}
            className="col-span-2 grid grid-cols-subgrid items-center gap-y-1 max-sm:pb-1.5 sm:col-span-3"
            title={`${r.label}: ${r.display}${r.sub ? ` · ${r.sub}` : ""}`}
          >
            <span className="line-clamp-2 leading-tight text-navy-900">{r.label}</span>
            <span className="h-3 overflow-hidden rounded-r-[4px] bg-slate-100 max-sm:order-last max-sm:col-span-2">
              <span
                className={`block h-full rounded-r-[4px] ${r.muted ? "bg-slate-400" : "bg-navy-900"}`}
                style={{ width: r.value > 0 ? `max(${(r.value / max) * 100}%, 4px)` : "0%" }}
              />
            </span>
            <span className="whitespace-nowrap text-right tabular-nums">
              <span className={`font-bold ${r.value === 0 ? "text-slate-500" : "text-navy-900"}`}>{r.display}</span>
              {r.sub && <span className="text-slate-500"> · {r.sub}</span>}
            </span>
          </li>
        ))}
      </ul>
      <div className="sr-only">
        <table>
          <caption>{caption}</caption>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}><th scope="row">{r.label}</th><td>{r.display}</td><td>{r.sub ?? ""}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Funnel({ m }: { m: ReportsModel }) {
  return (
    <section aria-labelledby="funnel-h" className={card}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="funnel-h" className={h2}>Where leads end up</h2>
        <span className={quiet}>leads that arrived in period</span>
      </div>
      <HBars
        caption={`Of the leads that arrived ${m.window.label.toLowerCase()}, how many reached each step.`}
        rows={m.funnel.map((s) => ({
          key: s.key,
          label: s.label,
          value: s.count,
          display: n(s.count),
          sub: s.key === "leads" ? undefined : `${pctLabel(s.pctOfLeads)} of leads`,
        }))}
      />
      <p className={note}>
        Follows each lead to wherever it got, however long it took. A deal that jumped straight to a later stage counts
        for the steps before it.
      </p>
    </section>
  );
}

function Speed({ m }: { m: ReportsModel }) {
  const never = m.speed.find((s) => s.never)!;
  return (
    <section aria-labelledby="speed-h" className={card}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="speed-h" className={h2}>Speed to first contact</h2>
        <span className={quiet}>leads that arrived in period</span>
      </div>
      <HBars
        caption={`How long leads that arrived ${m.window.label.toLowerCase()} waited for a first email, text or call.`}
        rows={m.speed.map((s) => ({ key: s.key, label: s.label, value: s.count, display: n(s.count), sub: `${s.pct}%`, muted: s.never }))}
      />
      {never.count > 0 ? (
        <p className="text-[13px] text-slate-700">
          <span className="font-semibold text-amber-700">{n(never.count)} lead{never.count === 1 ? "" : "s"}</span> from this
          period {never.count === 1 ? "has" : "have"} had no email, text or call yet.{" "}
          <Link href="/crm/dashboard" className="font-semibold text-navy-900 underline decoration-gold-500 decoration-2 underline-offset-4">
            Open the work queue
          </Link>
        </p>
      ) : (
        <p className={note}>Every lead from this period has been contacted.</p>
      )}
      <p className={note}>Counts emails and texts sent, and calls either way (calls do not record a direction yet).</p>
    </section>
  );
}

/* ------------------------------------------------------------ source table */

function Sources({ m }: { m: ReportsModel }) {
  const th = "px-3 py-2 text-left text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500";
  const td = "whitespace-nowrap px-3 py-2.5 tabular-nums";
  const total = m.sources.reduce((s, r) => s + r.leads, 0);
  return (
    <section aria-labelledby="src-h" className={card}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="src-h" className={h2}>Lead sources compared</h2>
        <span className={quiet}>leads that arrived in period</span>
      </div>
      <div className="-mx-5 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-[13px]">
          <thead className="border-b border-slate-200">
            <tr>
              <th scope="col" className={`${th} pl-5`}>Source</th>
              <th scope="col" className={`${th} text-right`}>Leads</th>
              <th scope="col" className={`${th} text-right`}>Contacted</th>
              <th scope="col" className={`${th} text-right`}>Median first contact</th>
              <th scope="col" className={`${th} text-right`}>Term sheets</th>
              <th scope="col" className={`${th} text-right`}>Funded</th>
              <th scope="col" className={`${th} pr-5 text-right`}>Lead → term sheet</th>
            </tr>
          </thead>
          <tbody>
            {m.sources.map((r) => (
              <tr key={r.key} className="border-b border-slate-100 last:border-0">
                <th scope="row" className={`${td} pl-5 text-left font-semibold text-navy-900`}>
                  <span className="flex items-center gap-2">
                    <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-[3px] ${SOURCE_FILL[r.key]}`} />
                    {r.label}
                  </span>
                </th>
                <td className={`${td} text-right font-semibold text-navy-900`}>
                  {n(r.leads)}
                  {total > 0 && <span className="font-normal text-slate-500"> · {Math.round((r.leads / total) * 100)}%</span>}
                </td>
                <td className={`${td} text-right`}>{pctLabel(r.contactedPct)}</td>
                <td className={`${td} text-right`}>{durationLabel(r.medianResponseHours)}</td>
                <td className={`${td} text-right`}>{n(r.termSheets)}</td>
                <td className={`${td} text-right`}>{n(r.funded)}</td>
                <td className={`${td} pr-5 text-right font-semibold text-navy-900`}>{pctLabel(r.conversionPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={note}>
        Other = referrals, LinkedIn, REIA, cold email, wholesale and unrecorded. Brokers = deals a broker submitted.
      </p>
    </section>
  );
}

/* ------------------------------------------------------ products and losses */

function Products({ m }: { m: ReportsModel }) {
  return (
    <section aria-labelledby="prod-h" className={card}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="prod-h" className={h2}>What borrowers asked for</h2>
        <span className={quiet}>leads that arrived in period</span>
      </div>
      {m.products.length === 0 ? (
        <p className="text-sm text-slate-600">No leads in this period.</p>
      ) : (
        <HBars
          caption={`Leads that arrived ${m.window.label.toLowerCase()} by loan type, with the total requested.`}
          rows={m.products.map((p) => ({
            key: p.key,
            label: p.label,
            value: p.leads,
            display: n(p.leads),
            sub: p.requested > 0 ? `${compactMoney(p.requested)} requested` : undefined,
            muted: p.key === "unknown" || p.key === "not_our_product",
          }))}
        />
      )}
      <p className={note}>Requested amounts are what the borrower asked for, before underwriting.</p>
    </section>
  );
}

function Lost({ m }: { m: ReportsModel }) {
  return (
    <section aria-labelledby="lost-h" className={card}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="lost-h" className={h2}>Why deals were lost</h2>
        <span className={quiet}>closed as lost in period</span>
      </div>
      {m.lost.total === 0 ? (
        <p className="text-sm text-slate-600">No deals were closed as lost in this period.</p>
      ) : (
        <HBars
          caption={`Deals closed as lost ${m.window.label.toLowerCase()}, by reason.`}
          rows={m.lost.rows.map((r) => ({ key: r.reason, label: r.reason, value: r.count, display: n(r.count), muted: r.reason === "No reason recorded" }))}
        />
      )}
      <p className={note}>Reasons come from the Closed – Lost question on the board, the table and the record card.</p>
    </section>
  );
}

/* ------------------------------------------------------------- the page */

export function ReportsBody({ m }: { m: ReportsModel }) {
  return (
    <div className="flex flex-col gap-5">
      <Kpis m={m} />
      <LeadTrend m={m} />
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <Funnel m={m} />
        <Speed m={m} />
      </div>
      <Sources m={m} />
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <Products m={m} />
        <Lost m={m} />
      </div>
    </div>
  );
}
