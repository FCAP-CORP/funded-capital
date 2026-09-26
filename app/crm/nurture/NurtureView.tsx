import Link from "next/link";
import { AlertTriangle, CheckCircle2, Inbox, Info, Sprout } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import {
  ENROLL_MAX, EXCLUSION_LABEL, MAX_SYNC_ATTEMPTS, PROGRAMS, STOP_LABEL, SYNC_LABEL, WIN_REASONS,
  type Exclusion, type ProgramKey, type StopReason, type SyncState,
} from "@/lib/nurture/nurture";
import type { EnrolledPerson, NurturePageData } from "@/lib/nurture/nurture.server";
import { EnrollPanel } from "./EnrollPanel";
import { RowAction } from "./RowAction";

export type NurtureTab = "ready" | "enrolled" | "stopped";

const HERE = "/crm/nurture";
const href = (program: ProgramKey, view?: NurtureTab) =>
  `${HERE}?program=${program}${view && view !== "ready" ? `&view=${view}` : ""}`;

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" }) : "—";

/** Server-rendered. The only client pieces are EnrollPanel and RowAction. */
export function NurtureView({ data, program, tab }: { data: NurturePageData; program: ProgramKey; tab: NurtureTab }) {
  const current = PROGRAMS.find((p) => p.key === program)!;
  const mine = data.enrolled.filter((e) => e.program === program);
  const active = mine.filter((e) => e.status === "active");
  const stopped = mine.filter((e) => e.status === "stopped");
  const candidates = data.candidates[program];

  return (
    <div className="flex flex-col gap-5">
      {!data.configured && (
        <div role="status" className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden />
          <p>
            <strong>Klaviyo isn&apos;t connected yet.</strong> You can enrol people now — they wait in a queue and go to
            Klaviyo automatically once <code className="rounded bg-amber-100 px-1">KLAVIYO_PRIVATE_KEY</code> is set in Vercel.
          </p>
        </div>
      )}

      {/* The four programmes */}
      <nav aria-label="Programmes" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {data.byProgram.map((s) => {
          const p = PROGRAMS.find((x) => x.key === s.key)!;
          const on = s.key === program;
          return (
            <Link
              key={s.key}
              href={href(s.key)}
              aria-current={on ? "page" : undefined}
              className={cn(
                "group flex flex-col gap-3 rounded-2xl border bg-white p-5 transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-700 focus-visible:ring-offset-2",
                on ? "border-navy-900 ring-1 ring-navy-900" : "border-slate-200 hover:border-slate-400",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-[15px] font-bold text-navy-900">{p.name}</h2>
                {s.syncFailed > 0 && <Badge tone="danger">{s.syncFailed} not synced</Badge>}
              </div>
              <p className="text-[13px] leading-snug text-slate-600">{p.who}</p>
              <dl className="mt-auto grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-center">
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Ready</dt>
                  <dd className="text-xl font-extrabold tabular-nums text-navy-900">{s.ready}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Enrolled</dt>
                  <dd className="text-xl font-extrabold tabular-nums text-navy-900">{s.active}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Came back</dt>
                  <dd className="text-xl font-extrabold tabular-nums text-emerald-700">{s.wins}</dd>
                </div>
              </dl>
            </Link>
          );
        })}
      </nav>

      {/* The chosen programme */}
      <Card as="section" aria-labelledby="prog-h" className="overflow-hidden">
        <div className="flex flex-col gap-1 border-b border-slate-200 px-5 pb-0 pt-5">
          <h2 id="prog-h" className="text-lg font-bold text-navy-900">{current.name}</h2>
          <p className="text-[13px] text-slate-600">
            {current.what} Sent by Klaviyo from the list <span className="font-semibold text-slate-800">{current.klaviyoListName}</span>.
          </p>
          <div role="tablist" aria-label={`${current.name} people`} className="-mb-px mt-3 flex gap-1 overflow-x-auto">
            {([
              ["ready", `Ready to enrol (${candidates.length})`],
              ["enrolled", `In programme (${active.length})`],
              ["stopped", `Stopped (${stopped.length})`],
            ] as const).map(([key, text]) => (
              <Link
                key={key}
                role="tab"
                aria-selected={tab === key}
                href={href(program, key)}
                scroll={false}
                className={cn(
                  "whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-700",
                  tab === key ? "border-gold-500 text-navy-900" : "border-transparent text-slate-500 hover:text-navy-900",
                )}
              >
                {text}
              </Link>
            ))}
          </div>
        </div>

        <div role="tabpanel">
          {tab === "ready" && (
            candidates.length === 0 ? (
              <EmptyState icon={Inbox} title="Nobody is waiting" description="Everyone who fits this programme is already in it, or in touch with you. New people appear here as leads go quiet." />
            ) : (
              <EnrollPanel
                program={program}
                programName={current.name}
                people={candidates.slice(0, ENROLL_MAX)}
                total={candidates.length}
              />
            )
          )}
          {tab === "enrolled" && <EnrolledTable rows={active} />}
          {tab === "stopped" && <StoppedTable rows={stopped} />}
        </div>
      </Card>

      <HowItWorks excluded={data.excluded} />
    </div>
  );
}

function syncBadge(e: EnrolledPerson) {
  const stuck = e.syncAttempts >= MAX_SYNC_ATTEMPTS && (e.syncState === "pending_add" || e.syncState === "pending_remove");
  if (stuck) return <Badge tone="danger" title={e.syncError ?? undefined}>Not synced</Badge>;
  if (e.syncError) return <Badge tone="warning" title={e.syncError}>Retrying</Badge>;
  const tone = e.syncState === "added" ? "success" : e.syncState === "removed" ? "muted" : "info";
  return <Badge tone={tone}>{SYNC_LABEL[e.syncState as SyncState] ?? e.syncState}</Badge>;
}

function PersonCell({ e }: { e: EnrolledPerson }) {
  return (
    <td className="px-5 py-3">
      {e.applicationId ? (
        <Link href={`/crm?open=${e.applicationId}`} className="font-semibold text-navy-900 underline decoration-gold-500/60 underline-offset-2 hover:decoration-gold-600">
          {e.name}
        </Link>
      ) : (
        <span className="font-semibold text-navy-900">{e.name}</span>
      )}
      <span className="block text-[12px] text-slate-500">{e.email}</span>
    </td>
  );
}

function EnrolledTable({ rows }: { rows: EnrolledPerson[] }) {
  if (rows.length === 0) {
    return <EmptyState icon={Sprout} title="Nobody in this programme yet" description="Enrol people from the Ready tab." />;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
          <tr><th scope="col" className="px-5 py-2.5">Person</th><th scope="col" className="px-5 py-2.5">Enrolled</th><th scope="col" className="px-5 py-2.5">Klaviyo</th><th scope="col" className="px-5 py-2.5 text-right"><span className="sr-only">Actions</span></th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((e) => {
            const stuck = e.syncAttempts >= MAX_SYNC_ATTEMPTS;
            return (
              <tr key={e.id}>
                <PersonCell e={e} />
                <td className="whitespace-nowrap px-5 py-3 tabular-nums text-slate-700">{day(e.enrolledAt)}</td>
                <td className="px-5 py-3">
                  {syncBadge(e)}
                  {e.syncError && <span className="mt-1 block max-w-xs truncate text-[12px] text-slate-500" title={e.syncError}>{e.syncError}</span>}
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-right">
                  <span className="inline-flex gap-2">
                    {stuck && <RowAction kind="retry" id={e.id} name={e.name} />}
                    <RowAction kind="stop" id={e.id} name={e.name} />
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StoppedTable({ rows }: { rows: EnrolledPerson[] }) {
  if (rows.length === 0) {
    return <EmptyState icon={CheckCircle2} title="Nobody has left this programme yet" description="When someone replies, starts a deal or unsubscribes, they move here with the reason." />;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
          <tr><th scope="col" className="px-5 py-2.5">Person</th><th scope="col" className="px-5 py-2.5">Stopped</th><th scope="col" className="px-5 py-2.5">Why</th><th scope="col" className="px-5 py-2.5">Klaviyo</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((e) => {
            const win = WIN_REASONS.includes(e.stopReason as StopReason);
            return (
              <tr key={e.id}>
                <PersonCell e={e} />
                <td className="whitespace-nowrap px-5 py-3 tabular-nums text-slate-700">{day(e.stoppedAt)}</td>
                <td className="px-5 py-3">
                  <Badge tone={win ? "success" : "neutral"}>{STOP_LABEL[e.stopReason as StopReason] ?? e.stopReason ?? "—"}</Badge>
                </td>
                <td className="px-5 py-3">{syncBadge(e)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function HowItWorks({ excluded }: { excluded: Record<string, number> }) {
  const rows = (Object.entries(excluded) as [Exclusion, number][]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  return (
    <details className="group rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-700">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-navy-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-700">
        <Info size={16} aria-hidden /> How this works, and who is left out
      </summary>
      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Each programme is a Klaviyo list. A flow in Klaviyo sends the emails; nothing goes out until that flow is switched on there.</li>
          <li>One programme per person at a time, and never the same one twice.</li>
          <li>Anyone you emailed, texted or called — or who contacted you — in the last 30 days is left alone, and so is anyone with a deal in progress.</li>
          <li>They leave automatically when they reply, a new enquiry arrives, their deal moves forward, you contact them yourself, or they unsubscribe. An unsubscribe in Klaviyo is copied into Lending OS and blocks email from the record card too.</li>
          <li>Klaviyo adds the unsubscribe link and our address to every email.</li>
        </ul>
        {rows.length > 0 && (
          <div>
            <p className="mb-2 font-semibold text-navy-900">Not offered right now</p>
            <dl className="divide-y divide-slate-100">
              {rows.map(([k, n]) => (
                <div key={k} className="flex justify-between gap-4 py-1.5">
                  <dt>{EXCLUSION_LABEL[k] ?? k}</dt>
                  <dd className="tabular-nums font-semibold text-navy-900">{n}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </details>
  );
}
