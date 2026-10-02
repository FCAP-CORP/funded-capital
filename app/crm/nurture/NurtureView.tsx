import Link from "next/link";
import { AlertTriangle, CheckCircle2, Inbox, Info, KeyRound, Mail, MousePointerClick, ShieldAlert, Sprout } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import {
  EXCLUSION_LABEL, MAX_SYNC_ATTEMPTS, OUTREACH_COOL_OFF_DAYS, PROGRAMS, STOP_LABEL, SYNC_LABEL, WIN_REASONS,
  type Exclusion, type ProgramKey, type StopReason, type SyncState,
} from "@/lib/nurture/nurture";
import { EVENT_LABEL, MODE_LABEL, RELEASE_BLOCK_LABEL, afterLabel } from "@/lib/nurture/cockpit";
import type { Cockpit, EnrolledPerson, NurturePageData, ProgramState } from "@/lib/nurture/nurture.server";
import { FlowSwitch, ModeSwitch, PauseSwitch, RefreshButton } from "./CockpitControls";
import { EnrollPanel } from "./EnrollPanel";
import { RowAction } from "./RowAction";

export type NurtureTab = "ready" | "enrolled" | "stopped" | "emails";

const HERE = "/crm/nurture";
/** How many ready people the list shows. Enrolling is still capped at ENROLL_MAX per click. */
const SHOW_MAX = 1000;
const href = (program: ProgramKey, view?: NurtureTab) =>
  `${HERE}?program=${program}${view && view !== "ready" ? `&view=${view}` : ""}`;

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" }) : "—";

/** Server-rendered. The client pieces are EnrollPanel, RowAction and the cockpit switches. */
export function NurtureView({ data, program, tab }: { data: NurturePageData; program: ProgramKey; tab: NurtureTab }) {
  const current = PROGRAMS.find((p) => p.key === program)!;
  const mine = data.enrolled.filter((e) => e.program === program);
  const active = mine.filter((e) => e.status === "active");
  const stopped = mine.filter((e) => e.status === "stopped");
  const candidates = data.candidates[program];
  const cp = data.cockpit;
  const state = cp.programs[program];
  const summary = data.byProgram.find((s) => s.key === program)!;

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

      {data.configured && cp.keyNeedsPermissions && (
        <div role="status" className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <KeyRound size={18} className="mt-0.5 shrink-0" aria-hidden />
          <p>
            <strong>One-time step: the Klaviyo key needs more permissions.</strong>{" "}
            Adding and removing people works, but
            Lending OS can&apos;t see or switch the email flows, read results or show previews — so nobody is sent yet. In Klaviyo,
            create a private API key with <em>Profiles, Lists and Flows</em> (full access) and <em>Events, Metrics and Templates</em> (read),
            then replace <code className="rounded bg-amber-100 px-1">KLAVIYO_PRIVATE_KEY</code> in Vercel.
          </p>
        </div>
      )}

      <CockpitBar cp={cp} configured={data.configured} />
      {cp.clicks.length > 0 && <Clicks cp={cp} />}

      {/* The five programmes */}
      <nav aria-label="Programmes" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
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
              <div className="flex flex-wrap gap-1.5">
                <FlowBadge st={cp.programs[s.key]} />
                <Badge tone={cp.programs[s.key].mode === "auto" ? "gold" : "neutral"}>{MODE_LABEL[cp.programs[s.key].mode]}</Badge>
                {s.queued > 0 && <Badge tone="info">{s.queued} waiting</Badge>}
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
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {data.configured && (
              <FlowSwitch
                program={program}
                name={current.name}
                live={state.flowLive}
                ready={candidates.length}
                queued={summary.queued}
                auto={state.mode === "auto"}
                problems={state.problems}
                cap={cp.warmup.cap}
              />
            )}
            <ModeSwitch program={program} name={current.name} mode={state.mode} />
            <span className="text-[13px] text-slate-600">
              {state.mode === "auto"
                ? "Everyone who qualifies is added each weekday morning."
                : "Only the people you tick are added."}
            </span>
          </div>
          {state.problems.length > 0 && (
            <p role="alert" className="mt-2 flex gap-2 text-[13px] text-red-700">
              <ShieldAlert size={16} className="mt-0.5 shrink-0" aria-hidden /> {state.problems.join(" ")}
            </p>
          )}
          {state.flowError && !cp.keyNeedsPermissions && (
            <p className="mt-2 text-[13px] text-amber-800">Last read from Klaviyo failed: {state.flowError}</p>
          )}
          <div role="tablist" aria-label={`${current.name} people`} className="-mb-px mt-3 flex gap-1 overflow-x-auto">
            {([
              ["ready", `Ready to enrol (${candidates.length})`],
              ["enrolled", `In programme (${active.length})`],
              ["stopped", `Stopped (${stopped.length})`],
              ["emails", `Emails (${state.snapshot?.emails.length ?? 0})`],
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
              <EmptyState icon={Inbox} title="Nobody is waiting" description="Everyone who fits this programme is already in it, or has responded to you recently. New people appear here as leads go quiet." />
            ) : (
              <EnrollPanel
                program={program}
                programName={current.name}
                people={candidates.slice(0, SHOW_MAX)}
                total={candidates.length}
                preselect={current.preselect}
              />
            )
          )}
          {tab === "enrolled" && <EnrolledTable rows={active} />}
          {tab === "stopped" && <StoppedTable rows={stopped} />}
          {tab === "emails" && <Emails st={state} />}
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
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
          <tr><th scope="col" className="px-5 py-2.5">Person</th><th scope="col" className="px-5 py-2.5">Enrolled</th><th scope="col" className="px-5 py-2.5">Emails</th><th scope="col" className="px-5 py-2.5">Latest</th><th scope="col" className="px-5 py-2.5">Klaviyo</th><th scope="col" className="px-5 py-2.5 text-right"><span className="sr-only">Actions</span></th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((e) => {
            const stuck = e.syncAttempts >= MAX_SYNC_ATTEMPTS;
            return (
              <tr key={e.id}>
                <PersonCell e={e} />
                <td className="whitespace-nowrap px-5 py-3 tabular-nums text-slate-700">{day(e.enrolledAt)}</td>
                <td className="whitespace-nowrap px-5 py-3 tabular-nums text-slate-700">{e.emailsSent}</td>
                <td className="whitespace-nowrap px-5 py-3 text-slate-700">
                  {e.lastEvent ? (
                    <span className={e.lastEvent.kind === "click" ? "font-semibold text-emerald-700" : undefined}>
                      {EVENT_LABEL[e.lastEvent.kind] ?? e.lastEvent.kind} · {day(e.lastEvent.at)}
                    </span>
                  ) : "—"}
                </td>
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
    return <EmptyState icon={CheckCircle2} title="Nobody has left this programme yet" description="When someone replies, starts a deal, unsubscribes or has had every email, they move here with the reason." />;
  }
  return (
    <div className="relative overflow-x-auto">
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
          <li>Each programme is a Klaviyo list with a flow that sends the emails. Nothing goes out until you turn that programme&apos;s emails on here.</li>
          <li>New people wait in a queue and go out on weekday mornings from 9:30 New York time — a few dozen a day at first, more each sending day — so Gmail and Outlook learn to trust the sender. Bounces or spam complaints over the line pause sending by themselves.</li>
          <li>Automatic programmes add everyone who qualifies each weekday morning; &ldquo;You choose&rdquo; programmes add only who you tick.</li>
          <li>One programme per person at a time, and never the same one twice.</li>
          <li>The 30 days run from their last response, not from your last email: anyone who wrote, texted, called you or spoke with you on a call in the last 30 days is left alone, and so is anyone with a deal in progress. Your own email, text or unanswered call holds them back only {OUTREACH_COOL_OFF_DAYS} days, so a drip never lands the morning after a personal note.</li>
          <li>They leave automatically when they reply (including a call where you spoke), a new enquiry arrives, their deal moves forward, or they unsubscribe. Reaching out yourself does not stop their emails. An unsubscribe in Klaviyo is copied into Lending OS and blocks email from the record card too.</li>
          <li>Each programme is 3–4 emails over about 6–13 weeks, then it stops. A few days after the last email they&apos;re taken off the list and show under Stopped as &ldquo;{STOP_LABEL.finished}&rdquo;. They can join a different programme later if they qualify, never the same one again.</li>
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

/* ------------------------------------------------------------- cockpit */

function FlowBadge({ st }: { st: ProgramState }) {
  if (st.flowLive) return <Badge tone="success">Emails on</Badge>;
  if (st.flowStatus === "live") return <Badge tone="warning" title="Klaviyo hasn't been checked in the last hour">Emails on · unconfirmed</Badge>;
  if (st.flowStatus === "manual") return <Badge tone="warning">Manual in Klaviyo</Badge>;
  return <Badge tone="muted">Emails off</Badge>;
}

const pct1 = (r: number | null) => (r === null ? "—" : `${(Math.round(r * 1000) / 10).toFixed(1)}%`);

function CockpitBar({ cp, configured }: { cp: Cockpit; configured: boolean }) {
  const h = cp.health;
  const healthTone = h.level === "stop" ? "text-red-700" : h.level === "watch" ? "text-amber-800" : "text-emerald-700";
  const status = cp.paused
    ? { title: "Sending is paused", tone: "border-red-200 bg-red-50", text: cp.pausedReason ?? "Paused." }
    : cp.queuedTotal === 0
      ? { title: "Sending is on", tone: "border-slate-200 bg-white", text: "Nobody is waiting to go out." }
      : cp.blocked && cp.blocked !== "outside_window"
        ? { title: "Sending is on", tone: "border-slate-200 bg-white", text: `${cp.queuedTotal} waiting. ${RELEASE_BLOCK_LABEL[cp.blocked]}.` }
        : { title: "Sending is on", tone: "border-slate-200 bg-white", text: `${cp.queuedTotal} waiting. Next release ${cp.nextRelease}.` };
  return (
    <section aria-labelledby="cockpit-h" className={cn("flex flex-col gap-4 rounded-2xl border p-5", status.tone)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="cockpit-h" className="text-[15px] font-bold text-navy-900">{status.title}</h2>
          <p className="text-[13px] text-slate-700">{status.text}</p>
          {cp.paused && cp.pausedByGuard && (
            <p className="mt-1 text-[13px] text-red-700">Paused automatically to protect your sender reputation. Check the addresses that bounced, then resume.</p>
          )}
        </div>
        {configured && (
          <div className="flex flex-wrap gap-2">
            <RefreshButton />
            <PauseSwitch paused={cp.paused} />
          </div>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-3 border-t border-slate-200/70 pt-3 sm:grid-cols-4">
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Warm-up</dt>
          <dd className="text-sm font-semibold text-navy-900">
            {cp.warmup.warming ? `Day ${cp.warmup.day} of ${cp.warmup.of}` : "Complete"}
            <span className="block text-[12px] font-normal text-slate-600">Up to {cp.warmup.cap} people a day</span>
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Released today</dt>
          <dd className="text-sm font-semibold tabular-nums text-navy-900">
            {cp.releasedToday} <span className="font-normal text-slate-600">of {cp.warmup.cap}</span>
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Emails, last 7 days</dt>
          <dd className="text-sm font-semibold tabular-nums text-navy-900">{h.sent.toLocaleString("en-US")}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Deliverability</dt>
          <dd className={cn("text-sm font-semibold", healthTone)} title={h.reason ?? undefined}>
            {h.level === "stop" ? "Over the line" : h.level === "watch" ? "Watch" : "Healthy"}
            <span className="block text-[12px] font-normal tabular-nums text-slate-600">
              Bounces {pct1(h.bounceRate)} · spam {pct1(h.spamRate)}
            </span>
          </dd>
        </div>
      </dl>
    </section>
  );
}

function Clicks({ cp }: { cp: Cockpit }) {
  return (
    <section aria-labelledby="clicks-h" className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5">
      <h2 id="clicks-h" className="flex items-center gap-2 text-[15px] font-bold text-navy-900">
        <MousePointerClick size={16} aria-hidden /> Clicked in the last 14 days — worth a personal note
      </h2>
      <p className="mt-1 text-[13px] text-slate-700">
        They opened a nurture email and clicked. The morning drip task drafts a short note in Gmail for each; sending it (or any
        email, text or call) takes them out of the programme automatically.
      </p>
      <ul className="mt-3 divide-y divide-emerald-100">
        {cp.clicks.map((c) => {
          const p = PROGRAMS.find((x) => x.key === c.program);
          return (
            <li key={c.enrollmentId} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2 text-sm">
              <span>
                {c.applicationId ? (
                  <Link href={`/crm?open=${c.applicationId}`} className="font-semibold text-navy-900 underline decoration-gold-500/60 underline-offset-2 hover:decoration-gold-600">{c.name}</Link>
                ) : (
                  <span className="font-semibold text-navy-900">{c.name}</span>
                )}
                <span className="text-slate-600"> · {p?.name ?? c.program}{c.subject ? ` · “${c.subject}”` : ""}</span>
              </span>
              <span className="tabular-nums text-[13px] text-slate-600">{day(c.at)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * What the programme sends, straight from Klaviyo's flow: when, subject,
 * preview text, and the email itself rendered for a sample person. The
 * preview is a sandboxed iframe (no scripts, no forms, links do nothing), so
 * email HTML can never run inside Lending OS.
 */
function Emails({ st }: { st: ProgramState }) {
  const emails = st.snapshot?.emails ?? [];
  if (emails.length === 0) {
    return <EmptyState icon={Mail} title="No emails read from Klaviyo yet" description="They appear after the next sync, or press Refresh from Klaviyo above." />;
  }
  return (
    <ol className="divide-y divide-slate-100">
      {emails.map((e, i) => (
        <li key={e.messageId || i} className="grid gap-4 px-5 py-5 lg:grid-cols-[260px_1fr]">
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Email {i + 1} · {afterLabel(e.afterDays)}</span>
            <span className="text-[15px] font-bold text-navy-900">{e.subject || "(no subject)"}</span>
            {e.previewText && <span className="text-[13px] text-slate-600">{e.previewText}</span>}
            <span className="text-[12px] text-slate-500">
              {i === 0 ? "When they're released: weekday mornings from 9:30am New York time" : "Weekdays, 9:30am in their time zone"}
            </span>
          </div>
          {e.html ? (
            <iframe
              title={`Preview: ${e.subject}`}
              srcDoc={e.html}
              sandbox=""
              loading="lazy"
              className="h-[520px] w-full rounded-xl border border-slate-200 bg-white"
            />
          ) : (
            <p className="rounded-xl border border-dashed border-slate-300 p-6 text-[13px] text-slate-500">
              Preview not rendered yet. It appears after the next daily refresh, or press Refresh from Klaviyo.
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}
