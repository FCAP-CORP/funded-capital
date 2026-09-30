import Link from "next/link";
import { ArrowLeft, Building2, Layers } from "lucide-react";
import { getMyParticipationById } from "@/lib/revenueShare.server";
import {
  capitalReturn,
  DEPLOYMENT_SUMMARY,
  formatDate,
  hasDesignatedLoan,
  isPaidOff,
  lockUpCleared,
  money,
  moneySmart,
  nextScheduledPayment,
  PAYMENT_STATE_META,
  paymentState,
  scheduleOf,
  statusStyle,
  termProgress,
} from "@/lib/revenueShare";
import {
  CapitalReturnNotice,
  DetailRow,
  Figure,
  Meter,
  Notice,
  PageHeader,
  Panel,
  PortalMessage,
  ProgramDisclaimer,
  StatusPill,
} from "../../ui";

export const metadata = {
  title: "Participation | Participant Portal",
  robots: { index: false, follow: false, nocache: true },
};

export default async function ParticipationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getMyParticipationById(decodeURIComponent(id));

  if (!result.ok) {
    return (
      <PortalMessage title="Participation not found">
        We could not find that participation on your account. Return to your{" "}
        <Link href="/participant-portal" className="text-gold-600 underline">
          overview
        </Link>
        , or contact{" "}
        <a href="mailto:info@fundedcapital.com" className="text-gold-600 underline">
          info@fundedcapital.com
        </a>
        .
      </PortalMessage>
    );
  }

  const { packet, participation } = result.data;
  const p = participation.view;
  // Rows carry the payoff date, so periods after an early payoff read as
  // "ended" rather than ageing into a debt that no longer exists.
  const schedule = scheduleOf(participation);
  const next = nextScheduledPayment(schedule);
  const nextState = next ? paymentState(next) : null;
  const cleared = lockUpCleared(p);
  const paidOff = isPaidOff(p);
  const ret = capitalReturn(p);
  // Anchor Series capital is not secured against one property, so those rows
  // carry no loan reference, address or loan size. Showing "$0" and "Property
  // details pending" would read as missing data rather than as the structure.
  const designated = hasDesignatedLoan(p);
  /**
   * Counted from the Payment Log rows, which is the same source the Overview
   * and Payments pages use. `p.paymentsLogged` is the tracker's own column and
   * is maintained separately, so the two drift: with a run marked in the
   * Participants tab but not yet written to the log, the Overview said "11
   * payments received" while this page said "12 payments sent".
   */
  const paymentsSent = participation.payments?.length ?? 0;
  const many = packet.participations.length > 1;

  return (
    <div className="p-5 sm:p-8 lg:p-10 max-w-5xl mx-auto">
      {many && (
        <Link
          href="/participant-portal"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-gold-600 mb-5"
        >
          <ArrowLeft size={13} />
          All {packet.participations.length} participations
        </Link>
      )}

      <PageHeader
        eyebrow="Participation Detail"
        title={p.participationId}
        meta={
          <span className="inline-flex items-center gap-3 flex-wrap">
            <span>{designated ? p.property || "Property details pending" : DEPLOYMENT_SUMMARY}</span>
            {p.status && <StatusPill label={p.status} className={statusStyle(p.status)} />}
          </span>
        }
      />

      {ret && (
        <div className="mb-6">
          <CapitalReturnNotice info={ret} />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Figure
          label="Capital Contributed"
          value={money(p.capitalContributed)}
          note={
            ret
              ? ret.state === "returned"
                ? `Returned ${formatDate(ret.on)}`
                : ret.due
                  ? `Being returned — expected by ${formatDate(ret.due)}`
                  : "Being returned"
              : "Returned in full at maturity"
          }
        />
        <Figure
          label="Monthly Revenue Share"
          value={moneySmart(p.monthlyRevenueShare)}
          note={paidOff ? "Payments ended — loan repaid early" : "Paid on or before the 15th"}
          emphasis={!paidOff}
        />
        <Figure
          label="Paid to Date"
          value={money(p.totalPaidToDate)}
          note={`${paymentsSent} payment${paymentsSent === 1 ? "" : "s"} sent`}
        />
      </div>

      {next && (
        <div className="mb-6">
          <Panel title="Next Payment on This Participation">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-[26px] leading-none font-bold tabular-nums text-ink">
                  {money(next.scheduledAmount)}
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  Due {formatDate(next.dueDate)}
                  {p.paymentMethod ? ` · by ${p.paymentMethod}` : ""}
                </p>
              </div>
              {nextState && (
                <StatusPill
                  label={PAYMENT_STATE_META[nextState].label}
                  className={PAYMENT_STATE_META[nextState].className}
                />
              )}
            </div>
          </Panel>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Loan reference and address only. Borrower identity is confidential
            under the agreement and is never sent to the browser. */}
        <Panel
          title={designated ? "Designated Loan" : "Capital Deployment"}
          description={
            designated
              ? "The loan this contribution supports"
              : "How this contribution is put to work"
          }
        >
          <div className="flex items-start gap-3 mb-3">
            <span className="mt-0.5 h-9 w-9 shrink-0 grid place-items-center rounded-md bg-slate-100 text-slate-500">
              {designated ? <Building2 size={17} /> : <Layers size={17} />}
            </span>
            <p className="text-sm font-semibold text-ink leading-snug">
              {designated ? p.property || "Property details pending" : DEPLOYMENT_SUMMARY}
            </p>
          </div>
          <dl>
            {designated && (
              <>
                <DetailRow label="Loan reference" value={p.loanReference || "—"} mono />
                <DetailRow label="Loan amount" value={money(p.designatedLoanSize)} mono />
              </>
            )}
            <DetailRow label="Term" value={p.termMonths ? `${p.termMonths} months` : "—"} mono />
          </dl>
        </Panel>

        <Panel
          title="Term"
          description={paidOff ? "Funding through early payoff" : "Funding through maturity"}
        >
          <dl className="mb-5">
            <DetailRow label="Funding date" value={formatDate(p.fundingDate)} mono />
            <DetailRow label="First payment" value={formatDate(p.firstPaymentDue)} mono />
            <DetailRow label="Scheduled maturity" value={formatDate(p.maturityDate)} mono />
            {paidOff ? (
              <>
                <DetailRow label="Loan repaid" value={formatDate(p.payoffDate)} mono />
                <DetailRow
                  label={ret?.state === "returned" ? "Capital returned" : "Capital return due"}
                  value={formatDate(
                    ret?.state === "returned" ? ret.on : p.capitalReturnDue
                  )}
                  mono
                />
              </>
            ) : (
              <DetailRow
                label="Days remaining"
                value={
                  Number.isFinite(p.daysToMaturity) && p.daysToMaturity > 0
                    ? `${p.daysToMaturity}`
                    : "—"
                }
                mono
              />
            )}
          </dl>
          <Meter fraction={paidOff ? 1 : termProgress(p)} label="Term elapsed" />
          <div className="mt-2 flex justify-between text-[11px] text-slate-400 tabular-nums">
            <span>{formatDate(p.fundingDate)}</span>
            <span>{formatDate(paidOff ? p.payoffDate : p.maturityDate)}</span>
          </div>
        </Panel>
      </div>

      {/* Schedule for this participation only. */}
      <div className="mt-6">
        <Panel
          title="Payment Schedule"
          description={
            paidOff
              ? "Payments ended when the borrower repaid on " + formatDate(p.payoffDate)
              : "Every payment on this participation"
          }
          flush
        >
          {schedule.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">
              The schedule will appear here once this contribution is funded.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-slate-100">
                    {["#", "Due Date", "Amount", "Status"].map((h) => (
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
                  {schedule.map((row) => {
                    const state = paymentState(row);
                    const meta = PAYMENT_STATE_META[state];
                    return (
                      <tr
                        key={row.paymentNumber}
                        className={`border-b border-slate-50 last:border-0 ${state === "due" ? "bg-gold-500/[0.04]" : ""} ${state === "ended" ? "text-slate-400" : ""}`}
                      >
                        <td className="px-5 py-3.5 text-slate-400 tabular-nums">{row.paymentNumber}</td>
                        <td
                          className={`px-5 py-3.5 font-semibold tabular-nums ${state === "ended" ? "text-slate-400" : "text-ink"}`}
                        >
                          {formatDate(row.dueDate)}
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
      </div>

      {!paidOff && (
      <div className="mt-6">
        <Notice
          title={
            cleared
              ? "Early withdrawal available on this participation"
              : "Inside the initial six-month period"
          }
        >
          {cleared ? (
            <>
              The initial six-month period on this participation ended{" "}
              {formatDate(p.lockUpEnds)}. Early withdrawal of this capital
              contribution is available with 30 days written notice to{" "}
              <a href="mailto:info@fundedcapital.com" className="underline">
                info@fundedcapital.com
              </a>{" "}
              or by certified mail, subject to a fee equal to 10% of the original
              contribution — {money(p.capitalContributed * 0.1)} on this
              participation, returning {money(p.capitalContributed * 0.9)}.
              Partial withdrawals are not permitted. Revenue share already paid to
              you is yours and is never reclaimed.
            </>
          ) : (
            <>
              The first six months from this participation&rsquo;s funding date are a
              fixed period during which withdrawal is not available. That period ends{" "}
              {formatDate(p.lockUpEnds)}. After it, withdrawal is available with 30
              days written notice, subject to a fee equal to 10% of the original
              capital contribution.
              {many && " Your other participations carry their own dates."}
            </>
          )}
        </Notice>
      </div>
      )}

      <ProgramDisclaimer />
    </div>
  );
}
