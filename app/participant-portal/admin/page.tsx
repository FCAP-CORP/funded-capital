import { notFound } from "next/navigation";
import { AlertTriangle, CalendarClock, CheckCircle2 } from "lucide-react";
import { getBook, isPortalAdmin } from "@/lib/revenueShare.server";
import { formatDate, money, todayIso } from "@/lib/revenueShare";
import { Figure, PageHeader, Panel, PortalMessage, StatusPill } from "../ui";

export const metadata = {
  title: "Program Book | Participant Portal",
  robots: { index: false, follow: false, nocache: true },
};

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  matured: "bg-slate-100 text-slate-600 ring-slate-500/20",
  withdrawn: "bg-slate-100 text-slate-600 ring-slate-500/20",
  pending: "bg-gold-500/10 text-gold-700 ring-gold-600/25",
};

export default async function ProgramBookPage() {
  // A participant who guesses this URL gets a 404, not a 403 — the admin
  // surface should not advertise that it exists.
  if (!(await isPortalAdmin())) notFound();

  const result = await getBook();
  if (!result.ok) {
    return (
      <PortalMessage title="Program records unavailable">
        {result.reason === "unconfigured"
          ? "PARTICIPANT_WEBAPP_URL and PARTICIPANT_WEBAPP_SECRET are not set on this deployment."
          : "The participant sheet could not be reached. Check that the Apps Script deployment is still live."}
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
                  const statusKey = (r.status || "").trim().toLowerCase();
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
                        {formatDate(r.maturityDate)}
                        {Number.isFinite(r.daysToMaturity) && r.daysToMaturity >= 0 && r.daysToMaturity <= 90 && (
                          <span className="ml-2 text-[11px] font-semibold text-amber-600">
                            {r.daysToMaturity}d
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right text-slate-600 tabular-nums">{money(r.totalPaidToDate)}</td>
                      <td className={`px-4 py-3.5 text-right tabular-nums font-semibold ${owed > 0 ? "text-red-600" : "text-slate-400"}`}>
                        {owed > 0 ? money(owed) : "—"}
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusPill
                          label={r.status || "—"}
                          className={STATUS_STYLES[statusKey] ?? "bg-slate-100 text-slate-600 ring-slate-500/20"}
                        />
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
