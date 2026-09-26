import { Suspense } from "react";
import { PageHeader } from "@/components/ui/page-header";
import NurtureContent from "./NurtureContent";

/**
 * Nurture — Klaviyo email programmes for leads who went quiet.
 *
 * STAFF ONLY: NurtureContent checks isCrmStaff before it reads anything, the
 * layout checks too, and every function in lib/nurture/nurture.server.ts
 * asserts staff a third time.
 *
 * NO `export const dynamic`; `searchParams` (which programme, which tab) is
 * awaited only inside the <Suspense> boundary, in NurtureContent — the PPR
 * rule every /crm page follows (CLAUDE.md, guard §8b).
 *
 * PERFORMANCE: one database round trip (the book and the enrolments in one
 * db.batch). The page is server-rendered; the only client JavaScript is the
 * selection list with its Enrol button and the Stop / Try again buttons.
 * Klaviyo is never called while the page renders.
 *
 * CONVERSION — the internal kind: each card leads with how many people are
 * ready right now, and the button enrols them in two clicks. The results line
 * (replied, new deal) is on the card so the programmes prove themselves.
 */

export const metadata = {
  title: "Nurture | Funded Capital Lending OS",
};

function NurtureSkeleton() {
  const block = "rounded-2xl border border-slate-200 bg-white";
  return (
    <div className="flex flex-col gap-5" role="status" aria-label="Loading nurture programmes">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className={`${block} h-56`} />)}
      </div>
      <div className={`${block} h-96`} />
    </div>
  );
}

export default function NurturePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <main className="mx-auto flex max-w-[1400px] flex-col px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        title="Nurture"
        description="Klaviyo email programmes for leads who went quiet. You choose who goes in; a reply, a new deal or an unsubscribe takes them out on its own."
      />
      <Suspense fallback={<NurtureSkeleton />}>
        <NurtureContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
