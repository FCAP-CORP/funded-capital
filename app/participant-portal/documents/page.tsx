import { ExternalLink, FileText, Mail } from "lucide-react";
import { getMyParticipation } from "@/lib/revenueShare.server";
import {
  allPayments,
  formatDate,
  formatDateLong,
  money,
  moneyExact,
  todayIso,
} from "@/lib/revenueShare";
import { PacketUnavailable, PageHeader, Panel, ProgramDisclaimer } from "../ui";
import PrintButton from "./PrintButton";

export const metadata = {
  title: "Documents | Participant Portal",
  robots: { index: false, follow: false, nocache: true },
};

export default async function DocumentsPage() {
  const result = await getMyParticipation();

  if (!result.ok) {
    return <PacketUnavailable reason={result.reason} subject="your documents" />;
  }

  const { holder, participations, totals } = result.data;
  const today = todayIso();
  const year = today.slice(0, 4);
  const many = participations.length > 1;

  // The statement covers the current calendar year across every participation —
  // which is what a holder needs at tax time and what "year to date" means.
  const ytd = allPayments(participations).filter(
    (r) => String(r.paymentPeriod || r.dateSent).slice(0, 4) === year
  );
  const ytdTotal = ytd.reduce((n, r) => n + (r.amountSent || 0), 0);

  // Folder links live per participation; dedupe so one folder shared across
  // several participations is offered once.
  const folders = Array.from(
    new Map(
      participations
        .filter((p) => p.view.documentsFolder)
        .map((p) => [p.view.documentsFolder, p.view])
    ).values()
  );

  return (
    <div className="p-5 sm:p-8 lg:p-10 max-w-5xl mx-auto">
      <div className="pp-no-print">
        <PageHeader
          eyebrow="Revenue Share Participation"
          title="Documents & Statements"
          meta={
            many
              ? `${participations.length} participations`
              : `Participation ${participations[0].view.participationId}`
          }
          actions={<PrintButton />}
        />

        <div className="mb-6">
          <Panel
            title="Program Documents"
            description="Your executed agreements and deposit forms"
          >
            {folders.length > 0 ? (
              <ul className="space-y-2">
                {folders.map((v) => (
                  <li key={v.documentsFolder}>
                    <a
                      href={v.documentsFolder}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between gap-4 p-4 rounded-md border border-slate-200 hover:border-gold-500 hover:bg-slate-50 transition-colors"
                    >
                      <span className="flex items-center gap-3 min-w-0">
                        <span className="h-9 w-9 shrink-0 grid place-items-center rounded-md bg-slate-100 text-slate-500">
                          <FileText size={17} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-ink">
                            {many ? `Participation ${v.participationId}` : "Your participation documents"}
                          </span>
                          <span className="block text-xs text-slate-500 truncate">
                            {v.property || "Agreement, deposit form and related records"}
                          </span>
                        </span>
                      </span>
                      <ExternalLink size={15} className="text-slate-400 shrink-0" />
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex items-start gap-3 p-4 rounded-md border border-slate-200 bg-slate-50">
                <span className="mt-0.5 h-9 w-9 shrink-0 grid place-items-center rounded-md bg-white border border-slate-200 text-slate-400">
                  <Mail size={16} />
                </span>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Copies of your executed participation {many ? "agreements" : "agreement"} and
                  deposit {many ? "forms" : "form"} are available on request. Email{" "}
                  <a href="mailto:info@fundedcapital.com" className="text-gold-600 underline">
                    info@fundedcapital.com
                  </a>{" "}
                  and we will send them to the address on file.
                </p>
              </div>
            )}
          </Panel>
        </div>
      </div>

      {/* The statement. Everything above is hidden when this page prints. */}
      <section className="pp-statement bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="px-6 sm:px-8 py-6 bg-ink">
          <div className="flex items-start justify-between gap-6">
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/LogoWhite.png" alt="Funded Capital" style={{ height: "34px", width: "auto" }} />
              <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-gold-500">
                Revenue Share Participation Statement
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                Statement Date
              </p>
              <p className="mt-1 text-sm font-semibold text-white tabular-nums">
                {formatDateLong(today)}
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 sm:px-8 py-6">
          <div className="pb-6 border-b border-slate-200">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              Participant
            </p>
            <p className="mt-1 text-sm font-semibold text-ink">{holder.displayName}</p>
            <p className="text-xs text-slate-500">
              {participations.length} participation{participations.length === 1 ? "" : "s"} on file
              {totals.activeCount !== totals.participationCount && ` · ${totals.activeCount} active`}
            </p>
          </div>

          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-5 py-6 border-b border-slate-200">
            {[
              { label: "Total Capital Contributed", value: money(totals.capitalContributed) },
              { label: "Combined Monthly Share", value: money(totals.monthlyRevenueShare) },
              { label: `Received in ${year}`, value: money(ytdTotal) },
              { label: "Received to Date", value: money(totals.totalPaidToDate) },
            ].map(({ label, value }) => (
              <div key={label}>
                <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  {label}
                </dt>
                <dd className="mt-1.5 text-lg font-bold text-ink tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>

          {/* Schedule of participations — the heart of a multi-participation statement. */}
          <div className="py-6 border-b border-slate-200">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 mb-3">
              Schedule of Participations
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-slate-200">
                    {["ID", "Designated Loan", "Funded", "Matures", "Capital", "Monthly"].map((h) => (
                      <th
                        key={h}
                        scope="col"
                        className={`py-2 font-semibold text-[10px] uppercase tracking-[0.1em] text-slate-400 ${["Capital", "Monthly"].includes(h) ? "text-right" : ""}`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {participations.map(({ view: v }) => (
                    <tr key={v.participationId} className="border-b border-slate-100 last:border-0">
                      <td className="py-2.5 font-semibold text-ink tabular-nums">{v.participationId}</td>
                      <td className="py-2.5 text-slate-600">
                        {v.property || "—"}
                        {v.loanReference && (
                          <span className="block text-[11px] text-slate-400 tabular-nums">
                            Loan {v.loanReference}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 text-slate-600 tabular-nums">{formatDate(v.fundingDate)}</td>
                      <td className="py-2.5 text-slate-600 tabular-nums">{formatDate(v.maturityDate)}</td>
                      <td className="py-2.5 text-right text-slate-600 tabular-nums">{money(v.capitalContributed)}</td>
                      <td className="py-2.5 text-right font-semibold text-ink tabular-nums">{money(v.monthlyRevenueShare)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={4} className="pt-3 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                      Total
                    </td>
                    <td className="pt-3 text-right font-bold text-ink tabular-nums">
                      {money(totals.capitalContributed)}
                    </td>
                    <td className="pt-3 text-right font-bold text-ink tabular-nums">
                      {money(totals.monthlyRevenueShare)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="py-6 border-b border-slate-200">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 mb-3">
              Payments Received in {year}
            </p>
            {ytd.length === 0 ? (
              <p className="text-sm text-slate-500">No payments have been recorded in {year}.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b border-slate-200">
                      {["Period", ...(many ? ["Participation"] : []), "Date Sent", "Method", "Amount"].map((h) => (
                        <th
                          key={h}
                          scope="col"
                          className={`py-2 font-semibold text-[10px] uppercase tracking-[0.1em] text-slate-400 ${h === "Amount" ? "text-right" : ""}`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ytd.map((row, i) => (
                      <tr key={`${row.participationId}-${i}`} className="border-b border-slate-100 last:border-0">
                        <td className="py-2.5 text-slate-600 tabular-nums">{formatDate(row.paymentPeriod)}</td>
                        {many && <td className="py-2.5 text-slate-500 tabular-nums">{row.participationId}</td>}
                        <td className="py-2.5 text-slate-600 tabular-nums">{formatDate(row.dateSent)}</td>
                        <td className="py-2.5 text-slate-600">{row.method || "—"}</td>
                        <td className="py-2.5 text-right font-semibold text-ink tabular-nums">{moneyExact(row.amountSent)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={many ? 4 : 3} className="pt-3 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                        Total
                      </td>
                      <td className="pt-3 text-right text-base font-bold text-ink tabular-nums">
                        {moneyExact(ytdTotal)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p className="pt-5 text-[10px] leading-relaxed text-slate-400">
            Funded Capital, LLC · Miami, Florida ·{" "}
            <a href="mailto:info@fundedcapital.com" className="underline">
              info@fundedcapital.com
            </a>
            <br />
            Confidential. Prepared for the named participant. This statement summarises
            activity under your Revenue Share Participation Agreement{many ? "s" : ""} and does
            not modify {many ? "them" : "it"}. Contributed capital is returned in full at the
            maturity of each designated loan. This is not a securities offering.
          </p>
        </div>
      </section>

      <div className="pp-no-print">
        <ProgramDisclaimer />
      </div>
    </div>
  );
}
