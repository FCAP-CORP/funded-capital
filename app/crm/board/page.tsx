import { Suspense } from "react";
import { notFound } from "next/navigation";
import { isCrmStaff } from "@/lib/crm/access";
import { getPipeline } from "@/lib/db/queries";
import { offBoard, type BoardSource } from "@/lib/crm/board";
import ViewToggle from "../ViewToggle";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import PipelineBoard from "./PipelineBoard";
import { RecordCardProvider } from "../_record/RecordCardProvider";
import RecordCardSlot from "../_record/RecordCardSlot";

/** The route every action on this page refreshes — the record card's included. */
const HERE = "/crm/board" as const;

export const metadata = {
  title: "Pipeline Board | Funded Capital Lending OS",
};

function BoardSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden" role="status" aria-label="Loading the board">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-96 w-64 shrink-0 rounded-xl" />
      ))}
    </div>
  );
}

async function Board() {
  // Checked here as well as in the layout: a layout and its page render
  // concurrently, so this is what guarantees the query never runs for someone
  // who is not staff.
  if (!(await isCrmStaff())) notFound();

  const rows = await getPipeline();

  // Only what a card shows crosses to the browser. Emails, phone numbers, notes
  // and borrower messages stay on the server — the board does not display them,
  // so it has no reason to ship them.
  const cards: BoardSource[] = rows.map((r) => ({
    id: r.id,
    stage: r.stage,
    name: r.name,
    product: r.product,
    requestedAmount: r.requestedAmount,
    stageEnteredAt: r.stageEnteredAt,
    lastContactAt: r.lastContactAt,
  }));
  const off = offBoard(cards);
  const parts = [
    off.funded ? `${off.funded} funded` : null,
    off.servicing ? `${off.servicing} in servicing` : null,
    off.lost ? `${off.lost} closed – lost` : null,
  ].filter(Boolean);

  return (
    <>
      <PipelineBoard rows={cards} />
      {parts.length > 0 && (
        <p className="mt-2 text-xs text-slate-600">
          Not on the board: {parts.join(", ")}. The table view shows them.
        </p>
      )}
    </>
  );
}

/** `searchParams` is awaited only inside the record card's <Suspense>. See app/crm/page.tsx. */
export default function BoardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <RecordCardProvider here={HERE}>
      <main className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        <PageHeader
          title="Pipeline"
          description="Drag a deal to change its stage, or click it to open the full record. The history is written with every move."
          actions={<ViewToggle current="board" />}
          className="mb-5"
        />

        <Suspense fallback={<BoardSkeleton />}>
          <Board />
        </Suspense>

        <Suspense fallback={null}>
          <RecordCardSlot searchParams={searchParams} from={HERE} />
        </Suspense>
      </main>
    </RecordCardProvider>
  );
}
