import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, ChevronRight, CircleAlert, MailCheck, Users } from "lucide-react";
import { isCrmStaff } from "@/lib/crm/access";
import { listBrokers, listFirms } from "@/lib/broker/admin.server";
import { listInvites } from "@/lib/broker/invites.server";
import { INVITE_STATUS_LABEL, inviteAgeDays, inviteStatus } from "@/lib/broker/invites";
import { dealCountLabel, firmLabel } from "@/lib/broker/admin";
import { BROKER_ROLE_LABEL, BROKER_STATUS_LABEL, label, money, shortDate } from "@/lib/crm/view";
import { GridSkeleton } from "../Skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FOCUS_RING } from "@/components/ui/focus";
import { InviteForm, NewFirmForm, RevokeInviteButton, StatusToggle } from "./Controls";

/**
 * Brokers — firms, and the queue of people waiting to be put in one.
 *
 * NO `export const dynamic` here. Same rule as app/crm/page.tsx: this project
 * runs Next 16 with `cacheComponents: true`, so the page is a static shell and
 * everything that reads the database sits inside a <Suspense> boundary.
 *
 * PERFORMANCE: the heading and the empty frame paint from the prerendered
 * shell; the two tables stream in behind them. The only client JavaScript on
 * the screen is the small form and toggle in Controls.tsx.
 *
 * CONVERSION — the internal kind: the unassigned queue is pinned to the top and
 * counted in the heading, because an unassigned broker is a person who has
 * signed up, seen an empty dashboard, and is deciding right now whether this
 * portal is worth using. That queue is the only thing on this page with a
 * deadline attached to it.
 */

export const metadata = {
  title: "Brokers | Funded Capital Lending OS",
};

async function Brokers() {
  // Checked here as well as in the layout — a layout and its page render
  // concurrently, so this is what keeps the query from running for a non-staff
  // user. See the same note in app/crm/page.tsx.
  if (!(await isCrmStaff())) notFound();

  const [firms, brokers, invites] = await Promise.all([listFirms(), listBrokers(), listInvites()]);

  const pendingInvites = invites.filter((i) => inviteStatus(i) === "pending");

  const unassigned = brokers.filter((b) => b.firmId === null);

  return (
    <>
      {pendingInvites.length > 0 && (
        <p className="mb-4 text-sm text-slate-600">
          {pendingInvites.length} {pendingInvites.length === 1 ? "invitation is" : "invitations are"}{" "}
          waiting to be used.
        </p>
      )}

      {unassigned.length > 0 && (
        <div role="status" className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <CircleAlert size={18} className="mt-0.5 shrink-0 text-amber-700" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-amber-900">
              {unassigned.length} {unassigned.length === 1 ? "broker is" : "brokers are"} waiting to be
              linked to a firm
            </p>
            <p className="mt-0.5 text-xs text-amber-800">
              Until you link them they see only the deals they filed themselves, and their colleagues
              see nothing. That is correct, but it is not useful — and they are looking at an empty
              dashboard while they wait.
            </p>
          </div>
        </div>
      )}

      <div className="mb-6">
        <NewFirmForm />
      </div>

      <div className="mb-8">
        <InviteForm firms={firms.map((f) => ({ id: f.id, name: f.name }))} />
      </div>

      {/* ------------------------------------------------------- invitations */}
      {invites.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-1 text-lg font-bold text-navy-900">Invitations</h2>
          <p className="mb-3 max-w-3xl text-[13px] text-slate-600">
            Nobody reaches the portal without one. Revoking blocks a future sign-in &mdash; it does
            NOT remove access from someone who has already signed in. Suspend them on their broker
            page for that.
          </p>

          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-widest text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold">Firm</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Invited</th>
                  <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invites.map((i) => {
                  const status = inviteStatus(i);
                  const age = inviteAgeDays(i.invitedAt);
                  return (
                    <tr key={i.id} className={status === "revoked" ? "bg-slate-50/60" : undefined}>
                      <td className="px-4 py-3 font-medium text-navy-900">
                        {i.email}
                        {i.note && <p className="mt-0.5 text-xs font-normal text-slate-500">{i.note}</p>}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{firmLabel(i.firmName)}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {label(BROKER_ROLE_LABEL, i.role)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={status === "accepted" ? "success" : status === "revoked" ? "muted" : "warning"}>
                          {status === "accepted" && <MailCheck size={12} aria-hidden="true" />}
                          {INVITE_STATUS_LABEL[status]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {shortDate(i.invitedAt)}
                        {status === "pending" && age !== null && age >= 7 && (
                          <span className="ml-1 font-semibold text-amber-700">&middot; {age}d</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {status !== "revoked" && (
                          <RevokeInviteButton inviteId={i.id} accepted={status === "accepted"} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </section>
      )}

      {/* ------------------------------------------------------------ firms */}
      <section className="mb-10">
        <h2 className="mb-3 text-lg font-bold text-navy-900">Firms</h2>

        {firms.length === 0 ? (
          <Card className="border-dashed">
            <EmptyState
              icon={Building2}
              title="No firms yet"
              description="Add the first one above — Legacy HML is the obvious starting point, with four people and four deals already in the pipeline."
            />
          </Card>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-widest text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Firm</th>
                  <th className="px-4 py-3 font-semibold">People</th>
                  <th className="px-4 py-3 font-semibold">Deals</th>
                  <th className="px-4 py-3 font-semibold text-right">Requested</th>
                  <th className="px-4 py-3 font-semibold text-right">Access</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {firms.map((f) => (
                  <tr key={f.id} className={f.status === "suspended" ? "bg-slate-50/60" : undefined}>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2 font-medium text-navy-900">
                        <Building2 size={15} className="text-slate-500" aria-hidden="true" />
                        {f.name}
                        {f.status === "suspended" && (
                          <Badge tone="muted" size="xs">{label(BROKER_STATUS_LABEL, f.status)}</Badge>
                        )}
                      </span>
                      {f.notes && <p className="mt-0.5 text-xs text-slate-500">{f.notes}</p>}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">{f.brokers}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">{f.deals}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {money(f.requested)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <StatusToggle id={f.id} kind="firm" status={f.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      {/* ---------------------------------------------------------- brokers */}
      <section>
        <h2 className="mb-3 text-lg font-bold text-navy-900">People</h2>

        {brokers.length === 0 ? (
          <Card className="border-dashed">
            <EmptyState
              icon={Users}
              title="Nobody has signed into the broker portal yet"
              description="Send an invitation above. An invited broker lands inside their firm on first sign-in."
            />
          </Card>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-widest text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Broker</th>
                  <th className="px-4 py-3 font-semibold">Firm</th>
                  <th className="px-4 py-3 font-semibold">Sees</th>
                  <th className="px-4 py-3 font-semibold">Deals</th>
                  <th className="px-4 py-3 font-semibold">First seen</th>
                  <th className="px-4 py-3"><span className="sr-only">Open</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {brokers.map((b) => {
                  const waiting = b.firmId === null;
                  return (
                    <tr key={b.id} className={waiting ? "bg-amber-50/50" : undefined}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-navy-900">{b.name || b.email}</p>
                        {b.name && <p className="text-xs text-slate-500">{b.email}</p>}
                      </td>
                      <td className="px-4 py-3">
                        {waiting ? (
                          <Badge tone="warning">{firmLabel(null)}</Badge>
                        ) : (
                          <span className="text-slate-700">{firmLabel(b.firmName)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {waiting ? "Own deals only" : label(BROKER_ROLE_LABEL, b.role)}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-700">
                        {dealCountLabel(b.deals)}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{shortDate(b.firstSeenAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/crm/brokers/${b.id}`}
                          aria-label={`${waiting ? "Link" : "Open"} ${b.name || b.email}`}
                          className={`inline-flex items-center gap-1 rounded-sm text-[13px] font-semibold text-navy-900 underline decoration-gold-500 decoration-2 underline-offset-4 hover:decoration-navy-900 ${FOCUS_RING}`}
                        >
                          {waiting ? "Link them" : "Open"}
                          <ChevronRight size={14} aria-hidden="true" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </section>
    </>
  );
}

export default function BrokersPage() {
  return (
    <main className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
      <PageHeader
        title="Brokers"
        description={<>Who is at which firm, and what each of them can see. Linking someone to a firm is what
          lets their colleagues see their deals — and what lets them see their colleagues&rsquo;.</>}
      />

      <Suspense fallback={<GridSkeleton />}>
        <Brokers />
      </Suspense>
    </main>
  );
}
