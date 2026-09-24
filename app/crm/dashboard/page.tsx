import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { isCrmStaff, signedInUser } from "@/lib/crm/access";
import { getDashboardData } from "@/lib/crm/dashboard.server";
import { buildDashboardModel, dateLine, greeting } from "@/lib/crm/dashboardView";
import { DashboardBody } from "./DashboardView";
import { RecordCardProvider } from "../_record/RecordCardProvider";
import RecordCardSlot from "../_record/RecordCardSlot";

/** The route every action on this page refreshes — the record card's included. */
const HERE = "/crm/dashboard" as const;

/**
 * Dashboard — who is waiting, then the numbers, then the work.
 *
 * ORDER IS THE ARGUMENT. The first thing under the greeting is the one fact
 * that cannot wait — how many borrowers wrote and have not heard back, and a
 * button that opens the longest-waiting one. Then four numbers for context,
 * then the work queue as the body of the page, with today's tasks, the
 * pipeline's shape and where leads came from beside it, and the weekly trend
 * last. A number saying "84 stalled" changes nothing about today; a list
 * saying "these people are waiting, longest first" is a morning.
 *
 * NO `export const dynamic` — same rule as every other /crm page. Next 16 with
 * `cacheComponents: true` rejects route segment config outright, so the page is
 * a static shell (the "New application" button, the frame) and everything
 * touching Clerk, the clock or the database sits inside <Suspense>. The
 * greeting has its own small boundary so it paints as soon as Clerk answers,
 * without waiting for the database.
 *
 * PERFORMANCE: one database round trip (lib/crm/dashboard.server.ts batches
 * the book and today's tasks into a single request) and no second Clerk call —
 * the greeting reuses the lookup the staff check already made
 * (`signedInUser`, cached per request). Every number is computed on the
 * server by lib/crm/dashboardView.ts; the charts are divs with percentage
 * sizes, no chart library, zero client JavaScript. The browser receives the
 * tab switcher, the row buttons and menus, the task checkboxes and the record
 * card's small shell — React and a few icons, nothing else.
 *
 * CONVERSION — the internal kind: the gap between noticing that someone has
 * waited twenty days and actually replying is where this kind of screen dies.
 * So the strip at the top opens that borrower's whole record in one click, and
 * every row carries "Log call" in plain sight, with email, text, note, snooze
 * and stage one click further in "More". Work that has to be written down
 * somewhere else afterwards mostly is not, and then the queue keeps nagging
 * about a borrower who was phoned this morning.
 */

export const metadata = {
  title: "Dashboard | Funded Capital Lending OS",
};

/** "Good morning, Luis" and the date — New York time for both. */
async function Greeting() {
  const user = await signedInUser();
  const now = new Date();
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[13px] text-slate-500">{dateLine(now)}</p>
      <h1 className="text-2xl font-extrabold tracking-tight text-navy-900 sm:text-[28px] sm:leading-9">
        {greeting(now, user?.firstName)}
      </h1>
    </div>
  );
}

function GreetingFallback() {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="sr-only">Dashboard</h1>
      <div aria-hidden="true" className="h-4 w-44 rounded bg-slate-200/70" />
      <div aria-hidden="true" className="h-8 w-64 rounded bg-slate-200/70" />
    </div>
  );
}

/** The shape of the page, so nothing jumps when the data arrives. */
function DashboardSkeleton() {
  const block = "rounded-2xl border border-slate-200 bg-white";
  return (
    <div className="flex flex-col gap-6" role="status" aria-label="Loading the dashboard">
      <div className="h-[88px] rounded-2xl bg-slate-200/60" />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className={`${block} h-[124px]`} />)}
      </div>
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className={`${block} h-[520px]`} />
        <div className="flex flex-col gap-5">
          <div className={`${block} h-40`} />
          <div className={`${block} h-60`} />
          <div className={`${block} h-44`} />
        </div>
      </div>
    </div>
  );
}

async function Dashboard() {
  // Checked here as well as in the layout: a layout and its page render
  // concurrently, so this is what keeps the query from running for a non-staff
  // user. getDashboardData asserts staff a third time, for itself.
  if (!(await isCrmStaff())) notFound();

  // One clock for every decision on the page, so the queue, the put-down list,
  // the numbers and the charts cannot disagree about what "now" is.
  const now = new Date();
  const { apps, tasks } = await getDashboardData(now);
  const model = buildDashboardModel(apps, tasks, now);

  return <DashboardBody model={model} now={now} />;
}

/** `searchParams` is awaited only inside the record card's <Suspense>. See app/crm/page.tsx. */
export default function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <RecordCardProvider here={HERE}>
      <main className="mx-auto flex max-w-[1400px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <Suspense fallback={<GreetingFallback />}>
            <Greeting />
          </Suspense>
          <Link
            href="/broker-portal/apply"
            className="inline-flex h-11 items-center gap-2 self-start rounded-xl bg-navy-900 px-[18px] text-sm font-semibold text-white hover:bg-navy-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2 sm:self-auto"
          >
            <Plus size={16} strokeWidth={2.4} className="text-gold-400" aria-hidden="true" />
            New application
          </Link>
        </header>

        <Suspense fallback={<DashboardSkeleton />}>
          <Dashboard />
        </Suspense>

        <Suspense fallback={null}>
          <RecordCardSlot searchParams={searchParams} from={HERE} />
        </Suspense>
      </main>
    </RecordCardProvider>
  );
}
