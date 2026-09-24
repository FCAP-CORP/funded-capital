import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileSearch, Mail, Phone, ShieldCheck } from "lucide-react";
import { isCrmStaff } from "@/lib/crm/access";
import { findClaimableDeals, getBroker, listFirms } from "@/lib/broker/admin.server";
import { canClaimDeal, dealCountLabel } from "@/lib/broker/admin";
import {
  BROKER_ROLE_LABEL,
  BROKER_STATUS_LABEL,
  PRODUCT_LABEL,
  label,
  money,
  shortDate,
} from "@/lib/crm/view";
import { GridSkeleton } from "../../Skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { StageBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { FOCUS_RING } from "@/components/ui/focus";
import { AssignControl, ClaimButton, NotesBox, StatusToggle } from "../Controls";

/**
 * One broker: which firm they are in, what that lets them see, and the historic
 * deals that carry their email but belong to nobody yet.
 *
 * THIS IS THE SCREEN THAT GRANTS SIGHT OF BORROWER DATA. Two controls on it
 * change what a person outside this company can read: the firm picker, and the
 * Attach button beside each deal. Both are deliberate, single, reversible-only-
 * by-design-decision actions, and neither has a bulk form.
 *
 * No `export const dynamic` — static shell, Suspense boundary. See
 * app/crm/page.tsx for why.
 */

export const metadata = {
  title: "Broker | Funded Capital Lending OS",
};

function Field({ label: name, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-600">{name}</p>
      <p className="mt-0.5 text-sm text-navy-900">{value}</p>
    </div>
  );
}

/**
 * `params` is AWAITED IN HERE, not in the page component.
 *
 * Under `cacheComponents: true`, touching params outside a <Suspense> boundary
 * is a build error — "Next.js encountered uncached or runtime data during
 * prerendering" — because it makes the whole route unprerenderable. Passing the
 * promise down and unwrapping it inside the boundary keeps the header and the
 * back link static, which is also simply better: they paint immediately.
 */
async function BrokerDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!(await isCrmStaff())) notFound();

  const broker = await getBroker(id);
  if (!broker) notFound();

  const [firms, candidates] = await Promise.all([
    listFirms(),
    findClaimableDeals(broker.email),
  ]);

  /**
   * The same rule the write uses, asked once per row so the button can explain
   * itself before it is pressed rather than failing afterwards. The server
   * re-reads and re-checks regardless — this is the label, not the gate.
   */
  const claimingBroker = {
    id: broker.id,
    clerkUserId: broker.clerkUserId,
    email: broker.email,
    firmId: broker.firmId,
    status: broker.status,
  };

  return (
    <>
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-navy-900">{broker.name || broker.email}</h2>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
                <Mail size={14} aria-hidden="true" /> {broker.email}
              </p>
              {broker.phone && (
                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-600">
                  <Phone size={14} aria-hidden="true" /> {broker.phone}
                </p>
              )}
            </div>
            <StatusToggle id={broker.id} kind="broker" status={broker.status} />
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label="Firm" value={broker.firmName ?? "Unassigned"} />
            <Field label="Role" value={label(BROKER_ROLE_LABEL, broker.role)} />
            <Field label="Status" value={label(BROKER_STATUS_LABEL, broker.status)} />
            <Field label="Deals filed" value={dealCountLabel(broker.deals)} />
          </div>

          <div className="mt-5 border-t border-slate-100 pt-5">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-600">
              Firm and access
            </p>
            <AssignControl
              brokerUserId={broker.id}
              firms={firms.map((f) => ({ id: f.id, name: f.name }))}
              currentFirmId={broker.firmId}
              currentRole={broker.role}
            />
          </div>
        </Card>

        <Card className="p-5">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-600">
            Your notes
          </p>
          <NotesBox brokerUserId={broker.id} initial={broker.notes ?? ""} />

          <div className="mt-5 border-t border-slate-100 pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-600">
              SMS consent
            </p>
            {broker.smsConsentAt ? (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-emerald-700">
                <ShieldCheck size={14} aria-hidden="true" />
                {shortDate(broker.smsConsentAt)}
                {broker.smsConsentVersion && (
                  <span className="text-xs text-slate-500">({broker.smsConsentVersion})</span>
                )}
              </p>
            ) : (
              <p className="mt-1 text-sm text-slate-600">
                Not given. Do not text this broker.
              </p>
            )}
            <p className="mt-1 text-xs text-slate-500">
              Consent is captured in the portal and mirrored inbound only. It is never set here.
            </p>
          </div>

          <p className="mt-4 text-xs text-slate-500">
            First seen {shortDate(broker.firstSeenAt)}
          </p>
        </Card>
      </div>

      {/* ------------------------------------------------- claimable deals */}
      <section>
        <h2 className="mb-1 text-lg font-bold text-navy-900">Deals filed under this email</h2>
        <p className="mb-3 max-w-3xl text-[13px] text-slate-600">
          These came in before the portal recorded who filed them — from the broker sheet. Attaching
          one puts it on this broker&rsquo;s dashboard and, through their firm, on their
          colleagues&rsquo;. Only deals with a broker on them can appear here; a borrower who came to
          Funded Capital directly can never be attached to anyone.
        </p>

        {candidates.length === 0 ? (
          <Card className="border-dashed">
            <EmptyState icon={FileSearch} title="Nothing unattached carries this email" compact />
          </Card>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-widest text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Borrower</th>
                  <th className="px-4 py-3 font-semibold">Property</th>
                  <th className="px-4 py-3 font-semibold">Program</th>
                  <th className="px-4 py-3 font-semibold">Stage</th>
                  <th className="px-4 py-3 font-semibold text-right">Amount</th>
                  <th className="px-4 py-3 font-semibold">Filed</th>
                  <th className="px-4 py-3"><span className="sr-only">Attach</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {candidates.map((d) => {
                  const verdict = canClaimDeal(claimingBroker, d);
                  return (
                    <tr key={d.applicationId}>
                      <td className="px-4 py-3 font-medium text-navy-900">
                        {d.borrower ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{d.property ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {label(PRODUCT_LABEL, d.product)}
                      </td>
                      <td className="px-4 py-3"><StageBadge stage={d.stage} /></td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                        {money(d.requestedAmount)}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{shortDate(d.submittedAt)}</td>
                      <td className="px-4 py-3">
                        <ClaimButton
                          applicationId={d.applicationId}
                          brokerUserId={broker.id}
                          disabledReason={verdict.ok ? null : verdict.reason}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}

        {!broker.firmId && candidates.length > 0 && (
          <p role="note" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            Assign a firm above before attaching anything. A deal attached to a broker who has no
            firm is stamped with no firm — permanently — so their colleagues would never see it,
            even after you link them later.
          </p>
        )}
      </section>
    </>
  );
}

export default function BrokerPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
      <PageHeader
        eyebrow={
          <Link
            href="/crm/brokers"
            className={`inline-flex items-center gap-1 rounded-sm text-xs font-semibold text-slate-600 hover:text-navy-900 ${FOCUS_RING}`}
          >
            <ArrowLeft size={14} aria-hidden="true" /> All brokers
          </Link>
        }
        title="Broker"
        description="Which firm they are in, what that lets them see, and the older deals that carry their email."
      />

      <Suspense fallback={<GridSkeleton />}>
        <BrokerDetail params={params} />
      </Suspense>
    </main>
  );
}
