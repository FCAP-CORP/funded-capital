import Link from "next/link";
import { ArrowRight, ChevronRight, Send } from "lucide-react";
import { getMyParticipation } from "@/lib/revenueShare.server";
import { capitalReturn, formatDate, isPaidOff, money, statusStyle } from "@/lib/revenueShare";
import {
  CapitalReturnNotice,
  Figure,
  Notice,
  PageHeader,
  Panel,
  PortalMessage,
  ProgramDisclaimer,
  StatusPill,
} from "./ui";

/**
 * CACHING - do not add `export const dynamic = "force-dynamic"` here.
 *
 * next.config.ts sets `cacheComponents: true` (Next 16 Partial Prerendering),
 * which rejects the `dynamic` route-segment config outright and fails the
 * build. It is also unnecessary: every participant figure on this page comes
 * from getMyParticipation(), which reads the Clerk session, and any read of
 * the session marks that subtree dynamic automatically. Next prerenders only
 * the empty chrome and streams the participant data per request - verified by
 * inspecting the prerendered shell, which contains no participant data at all.
 */

export default async function ParticipantOverviewPage() {
  const result = await getMyParticipation();

  if (!result.ok) {
    if (result.reason === "unconfigured") {
      return (
        <PortalMessage title="Portal not yet connected">
          Program records are not connected to this portal yet. Once the participant
          sheet is linked, your participation details will appear here automatically.
        </PortalMessage>
      );
    }
    if (result.reason === "unavailable") {
      return (
        <PortalMessage title="Program records are temporarily unavailable">
          We could not reach program records just now. Please try again in a few
          minutes. If this continues, contact{" "}
          <a href="mailto:info@fundedcapital.com" className="text-gold-600 underline">
            info@fundedcapital.com
          </a>
          .
        </PortalMessage>
      );
    }
    // Whoever lands here is in the wrong place, not at a dead end: either they
    // used a different address than the one on their agreement, or they are a
    // broker who followed the wrong link. Both need a way onward in one click.
    return (
      <PortalMessage title="No participation found for this sign-in">
        <>
          We could not match this email address to a participation on file. If you
          signed in with a different address than the one on your agreement, please
          sign out and try again, or contact{" "}
          <a href="mailto:info@fundedcapital.com" className="text-gold-600 underline">
            info@fundedcapital.com
          </a>
          .
          <span className="mt-5 block border-t border-slate-200 pt-4 text-sm text-slate-500">
            Looking for the broker portal?{" "}
            <Link
              href="/broker-portal"
              className="font-semibold text-gold-600 hover:underline"
            >
              Go to Broker Portal
            </Link>
          </span>
        </>
      </PortalMessage>
    );
  }

  const { holder, participations, totals } = result.data;
  const many = participations.length > 1;

  // Early payoffs, most recent first. Each gets its own notice so a holder with
  // several participations can tell which loan repaid.
  const returning = participations
    .map((p) => ({ v: p.view, info: capitalReturn(p.view) }))
    .filter((x) => x.info !== null)
    .sort((a, b) => String(b.v.payoffDate).localeCompare(String(a.v.payoffDate)));

  return (
    <div className="p-5 sm:p-8 lg:p-10 max-w-5xl mx-auto">
      <PageHeader
        eyebrow="Revenue Share Participation"
        title={holder.displayName}
        meta={
          <>
            {totals.participationCount} participation
            {totals.participationCount === 1 ? "" : "s"} on file
            {totals.activeCount !== totals.participationCount &&
              ` · ${totals.activeCount} active`}
          </>
        }
      />

      {/* An early payoff is the first thing a holder needs to see: their
          payments on that loan have stopped and their capital is coming back. */}
      {returning.length > 0 && (
        <div className="mb-6 space-y-3">
          {returning.map(({ v, info }) => (
            <CapitalReturnNotice
              key={v.participationId}
              info={info}
              context={many ? v.property || v.participationId : undefined}
            />
          ))}
        </div>
      )}

      {/* Consolidated position. For a holder with several participations this
          is the number that matters — any single participation understates it. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Figure
          label="Total Capital Contributed"
          value={money(totals.capitalContributed)}
          note={
            many
              ? `Across ${totals.activeCount} active participation${totals.activeCount === 1 ? "" : "s"} · returned in full at maturity`
              : "Returned in full at maturity"
          }
        />
        <Figure
          label={many ? "Combined Monthly Share" : "Monthly Revenue Share"}
          value={money(totals.monthlyRevenueShare)}
          note={
            totals.monthlyRevenueShare > 0
              ? "Paid on or before the 15th"
              : "No active participations"
          }
          emphasis={totals.monthlyRevenueShare > 0}
        />
        <Figure
          label="Paid to Date"
          value={money(totals.totalPaidToDate)}
          note={`${totals.paymentsLogged} payment${totals.paymentsLogged === 1 ? "" : "s"} received`}
        />
      </div>

      {totals.capitalReturning > 0 && (
        <div className="mb-6">
          <Panel title="Capital Being Returned">
            <p className="text-[26px] leading-none font-bold tabular-nums text-ink">
              {money(totals.capitalReturning)}
            </p>
            <p className="mt-2 text-sm text-slate-500">
              {totals.capitalReturnBy
                ? `Expected by ${formatDate(totals.capitalReturnBy)}`
                : "Within ten business days of payoff"}
              {totals.paidOffCount > 1 && ` · across ${totals.paidOffCount} repaid loans`}
            </p>
          </Panel>
        </div>
      )}

      {/* Next payment, summed across everything landing on that date. */}
      {totals.nextPaymentDate && (
        <div className="mb-6">
          <Panel
            title="Next Payment"
            actions={
              <Link
                href="/participant-portal/payments"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-gold-600 hover:text-gold-700"
              >
                Full history <ArrowRight size={13} />
              </Link>
            }
          >
            <p className="text-[26px] leading-none font-bold tabular-nums text-ink">
              {money(totals.nextPaymentAmount)}
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Due {formatDate(totals.nextPaymentDate)}
              {totals.nextPaymentCount > 1 &&
                ` · combined across ${totals.nextPaymentCount} participations`}
            </p>
            {totals.nextPaymentInitiated && (
              <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-sky-700">
                <Send size={13} />
                Payment initiated — on its way to you
              </p>
            )}
          </Panel>
        </div>
      )}

      {/* One row per participation. */}
      <Panel
        title={many ? "Your Participations" : "Your Participation"}
        description={
          many
            ? "Each participation supports its own designated loan. Select one for full detail."
            : undefined
        }
        flush
      >
        <ul className="divide-y divide-slate-100">
          {participations.map(({ view: v }) => {
            const off = isPaidOff(v);
            return (
              <li key={v.participationId}>
                <Link
                  href={`/participant-portal/participation/${encodeURIComponent(v.participationId)}`}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-sm font-bold text-ink tabular-nums">
                        {v.participationId}
                      </span>
                      {v.status && (
                        <StatusPill label={v.status} className={statusStyle(v.status)} />
                      )}
                    </div>
                    <p className="mt-1 text-sm text-slate-600 truncate">
                      {v.property || "Property details pending"}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400 tabular-nums">
                      {v.loanReference ? `Loan ${v.loanReference} · ` : ""}
                      {off
                        ? `Repaid ${formatDate(v.payoffDate)}`
                        : v.maturityDate
                          ? `Matures ${formatDate(v.maturityDate)}`
                          : "Funding date pending"}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <p
                      className={`text-sm font-bold tabular-nums ${off ? "text-slate-400" : "text-ink"}`}
                    >
                      {money(v.monthlyRevenueShare)}
                    </p>
                    <p className="text-xs text-slate-400">
                      {off ? "payments ended" : "per month"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 tabular-nums">
                      {money(v.capitalContributed)} contributed
                    </p>
                  </div>

                  <ChevronRight size={16} className="text-slate-300 shrink-0" />
                </Link>
              </li>
            );
          })}
        </ul>
      </Panel>

      {/* Withdrawal terms live per participation, because each has its own
          funding date and therefore its own six-month period. */}
      <div className="mt-6">
        <Notice title="Withdrawal terms">
          {many ? (
            <>
              Each participation carries its own terms, because each has its own
              funding date. The first six months from a participation&rsquo;s funding
              date are a fixed period during which withdrawal of that contribution is
              not available. After it, withdrawal is available with 30 days written
              notice to{" "}
              <a href="mailto:info@fundedcapital.com" className="underline">
                info@fundedcapital.com
              </a>{" "}
              or by certified mail, subject to a fee equal to 10% of that capital
              contribution. Withdrawals are for a full contribution; partial
              withdrawals are not permitted. Select a participation above to see its
              specific dates.
            </>
          ) : (
            <>
              The first six months from your funding date are a fixed period during
              which withdrawal is not available. After it, withdrawal is available
              with 30 days written notice to{" "}
              <a href="mailto:info@fundedcapital.com" className="underline">
                info@fundedcapital.com
              </a>{" "}
              or by certified mail, subject to a fee equal to 10% of your original
              capital contribution. Select your participation above for its specific
              dates.
            </>
          )}{" "}
          Revenue share already paid to you is yours and is never reclaimed.
        </Notice>
      </div>

      <ProgramDisclaimer />
    </div>
  );
}
