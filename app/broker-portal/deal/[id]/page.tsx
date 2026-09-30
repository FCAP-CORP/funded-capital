import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Eye } from "lucide-react";
import { getBrokerDeal } from "@/lib/broker/docRequests.server";
import { brokerStage } from "@/lib/broker/stageView";
import { PRODUCT_LABEL, label, money } from "@/lib/crm/view";
import { docSummary } from "@/lib/crm/docRequests";
import DealDocuments from "./DealDocuments";

export const metadata = {
  title: "Deal",
  robots: { index: false, follow: false },
};

/**
 * One deal, from the broker's side: where it stands and the documents Funded
 * Capital still needs, with an upload for each.
 *
 * Static shell + Suspense: `params` is awaited INSIDE the boundary (CLAUDE.md,
 * cacheComponents). Who may see the deal is decided in
 * lib/broker/docRequests.server.ts from the session through scope.ts; a deal
 * this person may not see is a 404, identical to one that does not exist.
 *
 * CONVERSION — the broker's kind: a checklist with one upload button per line
 * turns "what else do you need?" emails into a two-minute task, and the deal
 * stops waiting on paperwork nobody knew was missing.
 */
export default function DealPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/broker-portal" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-navy-900">
        <ArrowLeft size={14} aria-hidden="true" /> Dashboard
      </Link>
      <Suspense fallback={<DealSkeleton />}>
        <Deal params={params} />
      </Suspense>
    </div>
  );
}

async function Deal({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deal = await getBrokerDeal(id);
  if (!deal) notFound();
  const stage = brokerStage(deal.stage);
  const sum = docSummary(deal.requests);

  return (
    <>
      {deal.staffPreview && (
        <p className="mt-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-700">
          <Eye size={14} aria-hidden="true" /> You are seeing the broker&rsquo;s view. Uploads are switched off for staff — review files from the record card in Lending OS.
        </p>
      )}
      <header className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-gold-600">{label(PRODUCT_LABEL, deal.product)}</p>
        <h1 className="mt-1 text-2xl font-bold text-navy-900 sm:text-3xl">{deal.borrower ?? "Your deal"}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {deal.property ?? "Property to be confirmed"}
          {deal.loanAmount ? ` · ${money(deal.loanAmount)} requested` : ""}
        </p>
        <p className="mt-3 inline-flex items-center gap-2">
          <span className="rounded-full bg-navy-900 px-2.5 py-1 text-xs font-semibold text-white">{stage.label}</span>
          {sum.needed > 0 && <span className="text-sm font-semibold text-amber-800">{sum.needed} {sum.needed === 1 ? "document" : "documents"} needed from you</span>}
        </p>
      </header>

      <section aria-labelledby="docs-h" className="mt-6">
        <h2 id="docs-h" className="sr-only">Documents</h2>
        {deal.requests.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
            <p className="font-semibold text-navy-900">No documents requested yet.</p>
            <p className="mt-1">When the term sheet goes out, the list of documents we need appears here with an upload button for each. You will not need to email anything.</p>
          </div>
        ) : (
          <DealDocuments applicationId={deal.applicationId} requests={deal.requests} canUpload={deal.canUpload} />
        )}
      </section>
    </>
  );
}

function DealSkeleton() {
  return (
    <div className="mt-4 animate-pulse" aria-hidden="true">
      <div className="h-3 w-24 rounded bg-slate-200" />
      <div className="mt-2 h-7 w-64 rounded bg-slate-200" />
      <div className="mt-2 h-4 w-80 rounded bg-slate-100" />
      <div className="mt-6 h-64 rounded-2xl bg-slate-100" />
    </div>
  );
}
