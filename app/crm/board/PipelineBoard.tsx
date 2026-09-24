"use client";

import { useEffect, useId, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { AlertTriangle, CircleCheck, CircleX, Clock, Loader2, X } from "lucide-react";
import {
  LOST_REASONS,
  MAX_LOST_NOTE,
  applyMove,
  buildBoard,
  dropIntent,
  type BoardCard,
  type BoardSource,
} from "@/lib/crm/board";
import { PRODUCT_LABEL, STAGE_LABEL, money } from "@/lib/crm/view";
import { markLost, setStage } from "../actions";
import { useRecordCard } from "../_record/RecordCardProvider";

/**
 * Every action on this page refreshes THIS page and no other. See CrmRoute in
 * ../actions.ts: refreshing a different /crm route from an action once froze the
 * whole section on its loading shell.
 */
const HERE = "/crm/board" as const;

/**
 * The pipeline as a board. Drag a deal to a new column to change its stage.
 *
 * WHAT HAPPENS ON A DROP. The card moves at once (useOptimistic), the server
 * writes the stage change and its history row, and the fresh board arrives in
 * the same response. If the server refuses, the optimistic move is discarded
 * when the transition ends and the card goes back where it was — nothing to
 * undo by hand — and the reason is shown above the board.
 *
 * Two drops are not plain moves: Funded asks first, because it changes the
 * month's numbers on the dashboard; Closed – Lost asks why, because a lost deal
 * with no reason teaches nothing. Those rules live in lib/crm/board.ts.
 *
 * KEYBOARD: focus a card, press Space to pick it up, arrow keys to move between
 * columns, Space to drop, Escape to cancel. Enter opens the card's full record.
 *
 * CLICK OPENS, DRAG DRAGS. The mouse sensor only starts a drag after 6px of
 * movement and the touch sensor after a 200ms press, so a plain click or tap
 * never becomes a drag. The reverse — a drag ending with a click on the card it
 * started from — is suppressed for a moment after every drag, so dropping a
 * card back where it was does not also open it.
 */

type Result = { ok: true } | { ok: false; error: string };
type Move = { id: string; to: string };
type Pending =
  | { kind: "funded"; card: BoardCard }
  | { kind: "lost"; card: BoardCard };

/** Pointer lands inside a column; keyboard has no pointer, so fall back to overlap. */
const collision: CollisionDetection = (args) => {
  const hit = pointerWithin(args);
  return hit.length ? hit : rectIntersection(args);
};

const stageName = (id: unknown) => STAGE_LABEL[String(id)] ?? String(id);

export default function PipelineBoard({ rows }: { rows: BoardSource[] }) {
  const [optimisticRows, addMove] = useOptimistic(rows, (state: BoardSource[], m: Move) =>
    applyMove(state, m.id, m.to),
  );
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [asking, setAsking] = useState<Pending | null>(null);
  const record = useRecordCard();
  /** When the last drag ended. A click within the next moment belongs to the drag. */
  const lastDragEnd = useRef(0);

  function openRecord(id: string) {
    if (Date.now() - lastDragEnd.current < 250) return;
    record?.open(id);
  }

  const columns = useMemo(() => buildBoard(optimisticRows), [optimisticRows]);
  const byId = useMemo(() => {
    const m = new Map<string, BoardCard>();
    for (const c of columns) for (const card of c.cards) m.set(card.id, card);
    return m;
  }, [columns]);
  const active = activeId ? byId.get(activeId) ?? null : null;

  const sensors = useSensors(
    // A small movement before a drag starts, so a click is still a click.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // On a phone, a short press — otherwise every attempt to scroll the board sideways picks up a card.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    // Space picks up and drops. Enter is left free to OPEN the card (dnd-kit's
    // default would also start a drag on Enter).
    useSensor(KeyboardSensor, { keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] } }),
  );

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${byId.get(String(active.id))?.name ?? "deal"}.`,
    onDragOver: ({ active, over }) =>
      over ? `${byId.get(String(active.id))?.name ?? "Deal"} is over ${stageName(over.id)}.` : "Not over a column.",
    onDragEnd: ({ active, over }) =>
      over ? `${byId.get(String(active.id))?.name ?? "Deal"} dropped on ${stageName(over.id)}.` : "Dropped outside the board. Nothing changed.",
    onDragCancel: ({ active }) => `Cancelled. ${byId.get(String(active.id))?.name ?? "The deal"} did not move.`,
  };

  function commit(card: BoardCard, to: string, call: () => Promise<Result>) {
    setError(null);
    start(async () => {
      addMove({ id: card.id, to });
      const res = await call();
      if (!res.ok) setError(`${card.name} was not moved: ${res.error}`);
    });
  }

  function onDragStart(e: DragStartEvent) {
    setError(null);
    setActiveId(String(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    lastDragEnd.current = Date.now();
    const card = byId.get(String(e.active.id));
    if (!card || !e.over) return;
    const to = String(e.over.id);
    const intent = dropIntent(card.stage, to);
    switch (intent.kind) {
      case "move":
        commit(card, intent.to, () => setStage(card.id, intent.to, HERE));
        return;
      case "confirm_funded":
        setAsking({ kind: "funded", card });
        return;
      case "needs_reason":
        setAsking({ kind: "lost", card });
        return;
      default:
        return; // noop or not a drop target
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => { setActiveId(null); lastDragEnd.current = Date.now(); }}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            "To move a deal, press Space to pick it up, use the arrow keys to move it to another stage, and press Space again to drop it. Press Escape to cancel. Press Enter to open the deal's full record.",
        },
      }}
    >
      {/* Outcomes sit above the board so they are always in reach — at the far
          right of ten columns they would be off-screen during a drag. */}
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <OutcomeZone
          id="funded"
          label="Funded"
          hint="Drop here to mark a deal funded. You'll be asked to confirm."
          tone="won"
          dragging={active !== null}
        />
        <OutcomeZone
          id="closed_lost"
          label="Closed – Lost"
          hint="Drop here to close a deal. You'll be asked why."
          tone="lost"
          dragging={active !== null}
        />
      </div>

      <div className="mb-2 flex min-h-[1.5rem] items-center gap-2 text-xs" aria-live="polite">
        {pending && (
          <span className="inline-flex items-center gap-1.5 text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Saving…
          </span>
        )}
        {error && (
          <span role="alert" className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-2.5 py-1 text-red-700">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> {error}
            <button
              type="button"
              onClick={() => setError(null)}
              className="ml-1 rounded p-0.5 hover:bg-red-100"
              aria-label="Dismiss"
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          </span>
        )}
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4" role="list" aria-label="Pipeline stages">
        {columns.map((col) => (
          <Column key={col.stage} stage={col.stage} label={col.label} count={col.count} requested={col.requested}>
            {col.cards.map((card) => (
              <DraggableCard key={card.id} card={card} onOpen={openRecord} />
            ))}
          </Column>
        ))}
      </div>

      <DragOverlay dropAnimation={null}>
        {active ? <CardBody card={active} lifted /> : null}
      </DragOverlay>

      {asking?.kind === "funded" && (
        <ConfirmFunded
          card={asking.card}
          onCancel={() => setAsking(null)}
          onConfirm={() => {
            const card = asking.card;
            setAsking(null);
            commit(card, "funded", () => setStage(card.id, "funded", HERE));
          }}
        />
      )}
      {asking?.kind === "lost" && (
        <LostReason
          card={asking.card}
          onCancel={() => setAsking(null)}
          onConfirm={(choice, note) => {
            const card = asking.card;
            setAsking(null);
            commit(card, "closed_lost", () => markLost(card.id, choice, note, HERE));
          }}
        />
      )}
    </DndContext>
  );
}

/* ---------------------------------------------------------------- columns */

function Column({
  stage, label, count, requested, children,
}: {
  stage: string; label: string; count: number; requested: number; children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <section
      ref={setNodeRef}
      role="listitem"
      aria-label={`${label}, ${count} deal${count === 1 ? "" : "s"}`}
      className={`flex w-64 shrink-0 flex-col rounded-xl border bg-slate-50 transition-colors ${
        isOver ? "border-gold-500 bg-gold-400/10" : "border-slate-200"
      }`}
    >
      <header className="border-b border-slate-200 px-3 py-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="truncate text-xs font-semibold uppercase tracking-wide text-navy-900">{label}</h2>
          <span className="rounded-full bg-white px-1.5 text-[11px] font-semibold tabular-nums text-slate-600">{count}</span>
        </div>
        <p className="mt-0.5 text-[11px] tabular-nums text-slate-500">{requested > 0 ? money(requested) : "—"}</p>
      </header>
      <div className="flex max-h-[65vh] min-h-[6rem] flex-col gap-2 overflow-y-auto p-2">
        {count === 0 ? <p className="px-1 py-4 text-center text-[11px] text-slate-400">Nothing here</p> : children}
      </div>
    </section>
  );
}

function OutcomeZone({
  id, label, hint, tone, dragging,
}: {
  id: string; label: string; hint: string; tone: "won" | "lost"; dragging: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const Icon = tone === "won" ? CircleCheck : CircleX;
  const colours =
    tone === "won"
      ? isOver ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-emerald-200 text-emerald-700"
      : isOver ? "border-red-400 bg-red-50 text-red-800" : "border-red-200 text-red-700";
  return (
    <div
      ref={setNodeRef}
      className={`flex items-center gap-3 rounded-xl border-2 border-dashed px-4 py-3 transition-all ${colours} ${
        dragging ? "opacity-100" : "opacity-60"
      }`}
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden />
      <div>
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-[11px] opacity-80">{hint}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ cards */

function DraggableCard({ card, onOpen }: { card: BoardCard; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    data: { stage: card.stage },
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      {...listeners}
      {...attributes}
      onClick={() => onOpen(card.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onOpen(card.id);
          return;
        }
        listeners?.onKeyDown?.(e);
      }}
      aria-haspopup="dialog"
      aria-roledescription="draggable deal"
      aria-label={`${card.name}, ${money(card.amount)}, ${stageName(card.stage)}. Enter to open, Space to move.`}
      className={`cursor-grab touch-manipulation rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 active:cursor-grabbing ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <CardBody card={card} />
    </div>
  );
}

function CardBody({ card, lifted = false }: { card: BoardCard; lifted?: boolean }) {
  const contact =
    card.daysSinceContact === null
      ? { text: "Never contacted", warn: true }
      : { text: card.daysSinceContact <= 0 ? "Contacted today" : `Contacted ${card.daysSinceContact}d ago`, warn: false };
  return (
    <article
      className={`rounded-lg border bg-white p-2.5 text-left ${
        lifted ? "rotate-1 border-gold-500 shadow-lg" : "border-slate-200 shadow-sm hover:border-slate-300"
      }`}
    >
      <p className="truncate text-sm font-semibold text-navy-900">{card.name}</p>
      <div className="mt-1 flex items-center justify-between gap-2 text-xs">
        <span className="tabular-nums font-medium text-slate-700">{card.amount > 0 ? money(card.amount) : "—"}</span>
        <span className="truncate text-slate-500">{PRODUCT_LABEL[card.product] ?? card.product}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 ${
            card.stale ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"
          }`}
          title="Days in this stage"
        >
          <Clock className="h-3 w-3" aria-hidden />
          {card.daysInStage === null ? "—" : `${card.daysInStage}d`}
        </span>
        <span className={contact.warn ? "text-amber-700" : "text-slate-500"}>{contact.text}</span>
      </div>
    </article>
  );
}

/* ---------------------------------------------------------------- dialogs */

function Dialog({
  title, onCancel, children,
}: {
  title: string; onCancel: () => void; children: React.ReactNode;
}) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const cancel = useRef(onCancel);
  cancel.current = onCancel;
  // Focus ONCE, when the dialog opens. Re-running this on every render would
  // pull the cursor out of the note field whenever the board behind it updates.
  useEffect(() => {
    box.current?.querySelector<HTMLElement>("[data-autofocus], select, textarea")?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") cancel.current(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-4" onClick={onCancel}>
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
      >
        <h2 id={id} className="text-base font-semibold text-navy-900">{title}</h2>
        {children}
      </div>
    </div>
  );
}

const primary =
  "rounded-lg bg-navy-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-navy-800 " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 disabled:opacity-50";
const secondary =
  "rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500";

function ConfirmFunded({ card, onCancel, onConfirm }: { card: BoardCard; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Dialog title={`Mark ${card.name} as funded?`} onCancel={onCancel}>
      <p className="mt-2 text-sm text-slate-600">
        {card.amount > 0 ? `${money(card.amount)} requested. ` : ""}
        This counts toward Funded on the dashboard from today, and the deal leaves the board.
      </p>
      <div className="mt-5 flex justify-end gap-2">
        {/* Cancel has focus: a mis-drop followed by a reflex Enter must not book revenue. */}
        <button type="button" data-autofocus className={secondary} onClick={onCancel}>Cancel</button>
        <button type="button" className={primary} onClick={onConfirm}>Mark funded</button>
      </div>
    </Dialog>
  );
}

function LostReason({
  card, onCancel, onConfirm,
}: {
  card: BoardCard; onCancel: () => void; onConfirm: (choice: string, note: string) => void;
}) {
  const [choice, setChoice] = useState("");
  const [note, setNote] = useState("");
  const needsNote = choice === "Other";
  const ready = choice !== "" && (!needsNote || note.trim() !== "") && note.length <= MAX_LOST_NOTE;
  const ids = useId();
  return (
    <Dialog title={`Why was ${card.name} lost?`} onCancel={onCancel}>
      <p className="mt-1 text-sm text-slate-600">It's saved on the deal and in its history, so the reasons can be counted later.</p>
      <label htmlFor={`${ids}-r`} className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500">Reason</label>
      <select
        id={`${ids}-r`}
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
      >
        <option value="" disabled>Pick one…</option>
        {LOST_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
      <label htmlFor={`${ids}-n`} className="mt-3 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        Detail {needsNote ? "(required)" : "(optional)"}
      </label>
      <textarea
        id={`${ids}-n`}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={MAX_LOST_NOTE}
        rows={3}
        placeholder={needsNote ? "What happened?" : "e.g. which lender, what rate"}
        className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm placeholder:text-slate-400 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
      />
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className={secondary} onClick={onCancel}>Cancel</button>
        <button type="button" className={primary} disabled={!ready} onClick={() => onConfirm(choice, note)}>
          Close as lost
        </button>
      </div>
    </Dialog>
  );
}
