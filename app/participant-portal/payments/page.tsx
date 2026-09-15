import Link from "next/link";
import { getMyParticipation } from "@/lib/revenueShare.server";
import {
  allPayments,
  allScheduled,
  formatDate,
  isSettledState,
  money,
  moneyExact,
  PAYMENT_STATE_META,
  paymentState,
} from "@/lib/revenueShare";
import { Figure, PageHeader, Panel, PortalMessage, ProgramDisclaimer, StatusPill } from "../ui";

export const metadata = {
  title: "Payments | Participant Portal",
  robots: { index: false, follow: false, nocache: true },
};

export default async function PaymentsPage() {
  const result = await getMyParticipation();

  if (!result.ok) {
    return (
      <PortalMessage title="Payment records unavailable">
        We could not load your payment records just now. Please try again shortly, or
        contact{" "}
        <a href="mailto:info@fundedcapital.com" className="text-gold-600 underline">
          info@fundedcapital.com
        </a>
        .
      </PortalMessage>
    );
  }

  const { participations, totals } = result.data;
  const many = participations.length > 1;

  const payments = allPayments(participations);
  const scheduled = allScheduled(participations);
  // Settled means paid OR ended by an early payoff. Counting an ended period as
  // "remaining" would promise money that is no longer coming.
  const upcoming = scheduled.filter((r) => !isSettledState(paymentState(r)));
  const remainingTotal = upcoming.reduce((n, r) => n + (r.scheduledAmount || 0), 0);
  const endedCount = scheduled.filter((r) => paymentState(r) === "ended").length;

  return (
    <div className="p-5 sm:p-8 lg:p-10 max-w-5xl mx-auto">
      <PageHeader
        eyebrow="Revenue Share Participation"
        title="Payments"
        meta={
          many
            ? `Combined across ${participations.length} participations`
            : `Participation ${participations[0].view.participationId}`
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Figure
          label="Paid to Date"
          value={money(totals.totalPaidToDate)}
          note={`${payments.length} payment${payments.length === 1 ? "" : "s"} received`}
        />
        <Figure
          label={many ? "Combined Monthly Share" : "Monthly Revenue Share"}
          value={money(totals.monthlyRevenueShare)}
          note={
            totals.monthlyRevenueShare > 0
              ? "Paid on or before the 15th"
              : "No active participations"
          }
        />
        <Figure
          label="Remaining Scheduled"
          value={money(remainingTotal)}
          note={
            endedCount > 0
              ? `Across ${upcoming.length} payment${upcoming.length === 1 ? "" : "s"} · ${endedCount} ended on early payoff`
              : `Across ${upcoming.length} payment${upcoming.length === 1 ? "" : "s"}`
          }
        />
      </div>

      <div className="mb-6">
        <Panel
          title="Payment History"
          description={
            many
              ? "Every payment sent to you, across all participations"
              : "Payments sent to you, with confirmation reference"
          }
          flush
        >
          {payments.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">
              No payments have been sent yet.
            </p>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b border-slate-100">
                      {["Date Sent", ...(many ? ["Participation"] : []), "For Period", "Amount", "Method", "Reference"].map((h) => (
                        <th
                          key={h}
                          scope="col"
                          className={`px-5 py-3 font-semibold text-[11px] uppercase tracking-[0.1em] text-slate-500 ${h === "Amount" ? "text-right" : ""}`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((row, i) => (
                      <tr key={`${row.participationId}-${row.dateSent}-${i}`} className="border-b border-slate-50 last:border-0">
                        <td className="px-5 py-3.5 font-semibold text-ink tabular-nums">{formatDate(row.dateSent)}</td>
                        {many && (
                          <td className="px-5 py-3.5">
                            <Link
                              href={`/participant-portal/participation/${encodeURIComponent(row.participationId)}`}
                              className="text-gold-600 hover:text-gold-700 tabular-nums font-medium"
                            >
                              {row.participationId}
                            </Link>
                          </td>
                        )}
                        <td className="px-5 py-3.5 text-slate-600 tabular-nums">{formatDate(row.paymentPeriod)}</td>
                        <td className="px-5 py-3.5 text-right font-semibold text-ink tabular-nums">{moneyExact(row.amountSent)}</td>
                        <td className="px-5 py-3.5 text-slate-600">{row.method || "—"}</td>
                        <td className="px-5 py-3.5 text-slate-500 text-xs tabular-nums">{row.confirmationRef || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="md:hidden divide-y divide-slate-100">
                {payments.map((row, i) => (
                  <div key={`${row.participationId}-m${i}`} className="px-5 py-4">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="font-semibold text-ink tabular-nums">{formatDate(row.dateSent)}</p>
                      <p className="font-bold text-ink tabular-nums">{moneyExact(row.amountSent)}</p>
                    </div>
                    <p className="mt-1 text-xs text-slate-500 tabular-nums">
                      {many ? `${row.participationId} · ` : ""}
                      For {formatDate(row.paymentPeriod)}
                      {row.method ? ` · ${row.method}` : ""}
                    </p>
                    {row.confirmationRef && (
                      <p className="mt-0.5 text-xs text-slate-400 tabular-nums">Ref {row.confirmationRef}</p>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </Panel>
      </div>

      <Panel
        title="Payment Schedule"
        description={
          endedCount > 0
            ? "Periods after an early payoff are shown as ended — those payments are not due"
            : many
              ? "Every payment through maturity, across all participations"
              : "Every payment through maturity"
        }
        flush
      >
        {scheduled.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">
            Your payment schedule will appear here once your designated loan funds.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-slate-100">
                  {["Due Date", ...(many ? ["Participation"] : ["#"]), "Amount", "Status"].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className={`px-5 py-3 font-semibold text-[11px] uppercase tracking-[0.1em] text-slate-500 ${h === "Amount" ? "text-right" : ""}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scheduled.map((row) => {
                  const state = paymentState(row);
                  const meta = PAYMENT_STATE_META[state];
                  return (
                    <tr
                      key={`${row.participationId}-${row.paymentNumber}`}
                      className={`border-b border-slate-50 last:border-0 ${state === "due" ? "bg-gold-500/[0.04]" : ""}`}
                    >
                      <td
                        className={`px-5 py-3.5 font-semibold tabular-nums ${state === "ended" ? "text-slate-400" : "text-ink"}`}
                      >
                        {formatDate(row.dueDate)}
                      </td>
                      <td className="px-5 py-3.5 text-slate-500 tabular-nums">
                        {many ? row.participationId : row.paymentNumber}
                      </td>
                      <td
                        className={`px-5 py-3.5 text-right font-semibold tabular-nums ${state === "ended" ? "text-slate-400 line-through decoration-slate-300" : "text-ink"}`}
                      >
                        {money(row.scheduledAmount)}
                      </td>
                      <td className="px-5 py-3.5">
                        <StatusPill label={meta.label} className={meta.className} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <ProgramDisclaimer />
    </div>
  );
}
