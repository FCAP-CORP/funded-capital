import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AlertTriangle, CalendarClock, CheckCircle2, Undo2 } from "lucide-react";
import { getBook, isPortalAdmin } from "@/lib/revenueShare.server";
import { formatDate, isPaidOff, money, statusStyle, todayIso } from "@/lib/revenueShare";
import { Figure, PageHeader, Panel, PortalMessage, StatusPill } from "../ui";

export const metadata = {
  title: "Program Book | Participant Portal",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * CACHING — read before editing.
 *
 * Do NOT add `export const dynamic = "force-dynamic"` here. next.config.ts sets
 * `cacheComponents: true`, and any route segment config is a hard build error:
 * *Route segment config "dynamic" is not compatible with
 * nextConfig.cacheComponents*. That error does not surface in `npm run
 * typecheck` — only a full production build catches it — so it can sit in the
 * tree failing every deploy while local checks look green, which is exactly
 * what happened here.
 *
 * The replacement is structural: the page stays a static shell and everything
 * that reads live data sits inside <Suspense>, which makes that subtree dynamic
 * on its own. `app/crm/page.tsx` is the reference implementation.
 */
export default function ProgramBookPage() {
  return (
    <Suspense fallback={<ProgramBookLoading />}>
      <ProgramBook />
    </Suspense>
  );
}

function ProgramBookLoading() {
  return (
    <div className="p-5 sm:p-8 lg:p-10 max-w-6xl mx-auto animate-pulse" aria-busy="true">
      <span className="sr-only">Loading the program book…</span>
      <div className="h-2.5 w-32 rounded bg-slate-200 mb-3" />
      <div className="h-7 w-56 rounded bg-slate-300 mb-8" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="h-2.5 w-24 rounded bg-slate-200" />
            <div className="h-6 w-28 rounded bg-slate-300 mt-4" />
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-slate-200 bg-white h-64" />
    </div>
  );
}

async function ProgramBook() {
  // A participant who guesses this URL gets a 404, not a 403 — the admin
  // surface should not advertise that it exists.
  if (!(await isPortalAdmin())) notFound();

  const result = await getBook();
  if (!result.ok) {
    return (
      <PortalMessage title="Program records unavailable">
        <>
          {result.reason === "unconfigured"
            ? "PARTICIPANT_WEBAPP_URL and PARTICIPANT_WEBAPP_SECRET are not set on this deployment."
            : "The sheet did not answer on either of two attempts. This is usually transient — reload before changing anything."}
          {/*
            The exact failure, admin-only. Without this the page printed a
            guess, and the guess was wrong: it blamed the Apps Script
            deployment while that deployment was healthy the whole time.
          */}
          {result.detail && (
            <span className="mt-4 block rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-left font-mono text-xs leading-relaxed text-slate-600">
              {result.detail}
            </span>
          )}
        </>
      </PortalMessage>
    );
  }

  const { participants, summary: s } = result.data;
  const today = todayIso();

  // Most urgent first: overdue, then behind, then nearest maturity.
  const roster = [...participants].sort((a, b) => {
    const aActive = (a.status || "").toLowerCase() === "active" ? 0 : 1;
    const bActive = (b.status || "").toLowerCase() === "active" ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    const aOwed = (a.balanceOwed || 0) > 0 ? 0 : 1;
    const bOwed = (b.balanceOwed || 0) > 0 ? 0 : 1;
    if (aOwed !== bOwed) return aOwed - bOwed;
    return (a.daysToMaturity || 9999) - (b.daysToMaturity || 9999);
  });

  const alerts = [
    {
      label: "Payments behind",
      value: s.behindCount,
      icon: AlertTriangle,
      tone: s.behindCount > 0 ? "text-red-600" : "text-slate-400",
    },
    {
      label: "Overdue payments",
      value: s.overdueCount,
      icon: AlertTriangle,
      tone: s.overdueCount > 0 ? "text-red-600" : "text-slate-400",
    },
    {
      label: "Maturing within 90 days",
      value: s.maturingWithin90,
      icon: CalendarClock,
      tone: s.maturingWithin90 > 0 ? "text-amber-600" : "text-slate-400",
    },
    {
      label:
        s.capitalReturning > 0
          ? `Capital to return — ${money(s.capitalReturning)}`
          : "Capital to return",
      value: s.paidOffCount,
      icon: Undo2,
      tone: s.capitalReturnOverdueCount > 0 ? "text-red-600" : s.capitalReturning > 0 ? "text-sky-600" : "text-slate-400",
    },
    {
      label: `Active participations · ${s.holders} holder${s.holders === 1 ? "" : "s"}`,
      value: s.activeParticipants,
      icon: CheckCircle2,
      tone: "text-emerald-600",
    },
  ];

  return (
    <div className="p-5 sm:p-8 lg:p-10 max-w-7xl mx-auto">
      <PageHeader
        eyebrow="Internal — Funded Capital"
        title="Program Book"
        meta={
          <>
            Read-only view of the participant sheet as of {formatDate(today)}. Edit
            program records in the tracker; this page follows.
          </>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <Figure label="Capital Deployed" value={money(s.capitalDeployed)} note={`${s.activeParticipants} active participations of ${s.totalParticipants} · ${s.holders} holder${s.holders === 1 ? "" : "s"}`} />
        <Figure label="Monthly Obligation" value={money(s.monthlyObligation)} note={`${money(s.monthlyObligation * 12)} annualised run-rate`} emphasis />
        <Figure label="Due This Month" value={money(s.dueThisMonth)} note={`${s.dueThisMonthCount} payment${s.dueThisMonthCount === 1 ? "" : "s"} outstanding`} />
        <Figure label="Loan Volume Supported" value={money(s.loanVolumeSupported)} note={`${money(s.totalPaidToDate)} paid to participants to date`} />
      </div>

      {s.overdueCount > 0 && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-5 py-4">
          <p className="text-sm font-bold text-red-800">
            {s.overdueCount} payment{s.overdueCount === 1 ? "" : "s"} past due —{" "}
            {money(s.overdueAmount)}
          </p>
          <p className="mt-1 text-sm text-red-700">
            These are scheduled payments with a due date in the past and no matching
            row in the Payment Log.
          </p>
        </div>
      )}

      {s.capitalReturning > 0 && (
        <div
          className={`mb-4 rounded-lg border px-5 py-4 ${
            s.capitalReturnOverdueCount > 0
              ? "border-red-200 bg-red-50"
              : "border-sky-200 bg-sky-50"
          }`}
        >
          <p
            className={`text-sm font-bold ${s.capitalReturnOverdueCount > 0 ? "text-red-800" : "text-ink"}`}
          >
            {money(s.capitalReturning)} of capital to return on{" "}
            {s.paidOffCount} early payoff{s.paidOffCount === 1 ? "" : "s"}
            {s.capitalReturnBy ? ` — first due ${formatDate(s.capitalReturnBy)}` : ""}
          </p>
          <p
            className={`mt-1 text-sm ${s.capitalReturnOverdueCount > 0 ? "text-red-700" : "text-sky-900"}`}
          >
            {s.capitalReturnOverdueCount > 0
              ? `${s.capitalReturnOverdueCount} return deadline${s.capitalReturnOverdueCount === 1 ? " has" : "s have"} passed with no date in the Capital Returned column.`
              : "Due within ten business days of payoff. Record the date in the tracker's Capital Returned column once sent, and the portal switches to past tense."}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {alerts.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="bg-white rounded-lg border border-slate-200 px-4 py-3.5 flex items-center gap-3">
            <Icon size={17} className={tone} />
            <div className="min-w-0">
              <p className="text-lg font-bold text-ink tabular-nums leading-none">{value}</p>
              <p className="mt-1 text-[11px] text-slate-500 truncate">{label}</p>
            </div>
          </div>
        ))}
      </div>

      <Panel
        title="Participation Roster"
        description="One row per participation, not per person — a holder with several appears several times. Sorted by urgency: active and owed money first, then nearest maturity."
        flush
      >
        {roster.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">
            No participants on file yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="text-left border-b border-slate-200">
                  {["Participant", "Table", "Level", "Capital", "Loan", "Monthly", "Funded", "Maturity", "Paid", "Owed", "Status"].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className={`px-4 py-3 font-semibold text-[10px] uppercase tracking-[0.1em] text-slate-500 ${
                        ["Capital", "Loan", "Monthly", "Paid", "Owed"].includes(h) ? "text-right" : ""
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {roster.map((r) => {
                  const owed = r.balanceOwed || 0;
                  const off = isPaidOff(r);
                  const returned = String(r.capitalReturned || "").slice(0, 10);
                  return (
                    <tr key={r.participantId} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                      <td className="px-4 py-3.5">
                        <p className="font-semibold text-ink">{r.entityName?.trim() || r.fullName}</p>
                        <p className="text-xs text-slate-400 tabular-nums">
                          {r.participantId} · {r.email}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 text-slate-600">{r.programVersion || "—"}</td>
                      <td className="px-4 py-3.5 text-slate-600">{r.tier || "—"}</td>
                      <td className="px-4 py-3.5 text-right font-medium text-ink tabular-nums">{money(r.capitalContributed)}</td>
                      <td className="px-4 py-3.5 text-right text-slate-600 tabular-nums">{money(r.designatedLoanSize)}</td>
                      <td className="px-4 py-3.5 text-right font-semibold text-ink tabular-nums">{money(r.monthlyRevenueShare)}</td>
                      <td className="px-4 py-3.5 text-slate-600 tabular-nums">{formatDate(r.fundingDate)}</td>
                      <td className="px-4 py-3.5 text-slate-600 tabular-nums">
                        {off ? (
                          <>
                            <span className="text-slate-400 line-through decoration-slate-300">
                              {formatDate(r.maturityDate)}
                            </span>
                            <span className="ml-2 text-[11px] font-semibold text-sky-600">
                              repaid {formatDate(r.payoffDate)}
                            </span>
                          </>
                        ) : (
                          <>
                            {formatDate(r.maturityDate)}
                            {Number.isFinite(r.daysToMaturity) && r.daysToMaturity >= 0 && r.daysToMaturity <= 90 && (
                              <span className="ml-2 text-[11px] font-semibold text-amber-600">
                                {r.daysToMaturity}d
                              </span>
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right text-slate-600 tabular-nums">{money(r.totalPaidToDate)}</td>
                      <td className={`px-4 py-3.5 text-right tabular-nums font-semibold ${owed > 0 ? "text-red-600" : "text-slate-400"}`}>
                        {owed > 0 ? money(owed) : "—"}
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusPill label={r.status || "—"} className={statusStyle(r.status)} />
                        {off && (
                          <p className="mt-1 text-[11px] tabular-nums">
                            {returned ? (
                              <span className="text-slate-400">
                                returned {formatDate(returned)}
                              </span>
                            ) : (
                              <span
                                className={
                                  r.capitalReturnDue && String(r.capitalReturnDue).slice(0, 10) < today
                                    ? "font-semibold text-red-600"
                                    : "text-sky-600"
                                }
                              >
                                {money(r.capitalContributed)} due {formatDate(r.capitalReturnDue)}
                              </span>
                            )}
                          </p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <p className="mt-8 text-[11px] leading-relaxed text-slate-400">
        Internal view. Contains program version and level data that must never appear
        on a participant-facing surface. Figures are recomputed from the sheet rows on
        every load rather than read from the Dashboard tab, so they reflect the current
        roster and payment log. Holder count is distinct by email — participations and
        people are not the same number.
      </p>
    </div>
  );
}
