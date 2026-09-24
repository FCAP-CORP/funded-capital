import { Suspense } from "react";
import { notFound } from "next/navigation";
import { isCrmStaff } from "@/lib/crm/access";
import { getPipeline } from "@/lib/db/queries";
import { offBoard, type BoardSource } from "@/lib/crm/board";
import ViewToggle from "../ViewToggle";
import PipelineBoard from "./PipelineBoard";

export const metadata = {
  title: "Pipeline Board | Funded Capital Lending OS",
};

function BoardSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden" aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-96 w-64 shrink-0 animate-pulse rounded-xl bg-slate-100" />
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
        <p className="mt-2 text-xs text-slate-500">
          Not on the board: {parts.join(", ")}. The table view shows them.
        </p>
      )}
    </>
  );
}

export default function BoardPage() {
  return (
    <main className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Pipeline</h1>
          <p className="mt-1 text-sm text-slate-500">
            Drag a deal to change its stage. The history is written with every move.
          </p>
        </div>
        <ViewToggle current="board" />
      </header>

      <Suspense fallback={<BoardSkeleton />}>
        <Board />
      </Suspense>
    </main>
  );
}
