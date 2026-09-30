"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { Check, CircleCheck, FileText, ListChecks, Loader2, Plus, RotateCcw, Trash2, Undo2, X } from "lucide-react";
import { MAX_LABEL, MAX_NOTE, STAFF_STATUS_LABEL, docSummary, type DocStatus } from "@/lib/crm/docRequests";
import { addDocRequest, createDocList, moveDocRequest, type CrmRoute } from "../actions";

/**
 * "Documents needed" on the record card — the list the broker sees on their
 * deal page, from Luis's side.
 *
 * The list starts itself at term sheet; this is where Luis reviews what came
 * in (Accept / Needs another copy / Not needed), adds an item the standard list
 * does not cover, or takes one off. Files themselves stay in Drive: the card
 * shows their names, the broker's upload lands in the intake folder.
 *
 * EVERY CALL PASSES `from` — the page the card is open on (guards.regress.ts §8b).
 */

export type DocRequestView = {
  id: string;
  label: string;
  hint: string | null;
  note: string | null;
  status: string;
  reviewNote: string | null;
  received: string | null;
  files: string[];
};

const TONE: Record<DocStatus, string> = {
  requested: "bg-amber-50 text-amber-800 ring-amber-200",
  received: "bg-blue-50 text-blue-800 ring-blue-200",
  accepted: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  waived: "bg-slate-100 text-slate-600 ring-slate-200",
  removed: "bg-slate-100 text-slate-500 ring-slate-200",
};

const small =
  "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold ring-1 ring-inset " +
  "disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500";
const primary =
  "inline-flex items-center gap-1.5 rounded-lg bg-navy-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy-800 " +
  "disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500";
const input =
  "rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm placeholder:text-slate-400 " +
  "focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500 disabled:opacity-60";

type Result = { ok: true } | { ok: false; error: string };

function useRun() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(null), 2500);
    return () => clearTimeout(t);
  }, [done]);
  function run(call: () => Promise<Result>, ok: string, after?: () => void) {
    setError(null);
    setDone(null);
    start(async () => {
      const res = await call();
      if (res.ok) { setDone(ok); after?.(); } else setError(res.error);
    });
  }
  return { pending, error, done, run };
}

export function DocRequestsPanel({
  applicationId, items, hasList, from,
}: {
  applicationId: string;
  items: DocRequestView[];
  /** False when this deal has never had a list (not even removed items). */
  hasList: boolean;
  from: CrmRoute;
}) {
  const { pending, error, done, run } = useRun();
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const ids = useId();
  const sum = docSummary(items);

  if (!hasList) {
    return (
      <div>
        <p className="text-sm text-slate-600">
          No list yet. It starts itself when the deal reaches term sheet, with the standard documents for its loan type.
        </p>
        <div className="mt-2 flex items-center gap-2">
          <button type="button" className={primary} disabled={pending} onClick={() => run(() => createDocList(applicationId, from), "List created")}>
            <ListChecks size={13} aria-hidden="true" /> Create the list now
          </button>
          <StatusLine pending={pending} done={done} />
        </div>
        {error && <p role="alert" className="mt-1.5 text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <p className="text-[13px] text-slate-600" aria-live="polite">
        {sum.total === 0 ? "Nothing on the list." : (
          <>
            <strong className="font-semibold text-navy-900">{sum.done} of {sum.total}</strong> done
            {sum.review > 0 && <> · <strong className="font-semibold text-blue-800">{sum.review} to review</strong></>}
            {sum.needed > 0 && <> · {sum.needed} still needed from the broker</>}
          </>
        )}
      </p>

      <ul className="mt-2 divide-y divide-slate-100">
        {items.map((it) => <DocRow key={it.id} it={it} from={from} />)}
      </ul>

      {adding ? (
        <form
          className="mt-3 flex flex-col gap-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => addDocRequest(applicationId, label, note, from), "Added", () => { setLabel(""); setNote(""); setAdding(false); });
          }}
        >
          <label htmlFor={`${ids}-l`} className="text-[11px] font-semibold text-slate-700">Document</label>
          <input id={`${ids}-l`} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={MAX_LABEL} placeholder="e.g. HOA estoppel letter" disabled={pending} className={input} autoFocus />
          <label htmlFor={`${ids}-n`} className="text-[11px] font-semibold text-slate-700">Note for the broker (optional)</label>
          <input id={`${ids}-n`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={MAX_NOTE} placeholder="What exactly you need" disabled={pending} className={input} />
          <div className="mt-1 flex gap-2">
            <button type="submit" className={primary} disabled={pending || label.trim().length < 2}><Plus size={13} aria-hidden="true" /> Add to the list</button>
            <button type="button" className={`${small} bg-white text-slate-700 ring-slate-300 hover:bg-slate-100`} onClick={() => setAdding(false)} disabled={pending}>Cancel</button>
          </div>
        </form>
      ) : (
        <button type="button" className={`${small} mt-3 bg-white text-navy-900 ring-slate-300 hover:bg-slate-50`} onClick={() => setAdding(true)}>
          <Plus size={12} aria-hidden="true" /> Add a document
        </button>
      )}
      <span className="ml-2"><StatusLine pending={pending} done={done} /></span>
      {error && <p role="alert" className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function DocRow({ it, from }: { it: DocRequestView; from: CrmRoute }) {
  const { pending, error, done, run } = useRun();
  const [asking, setAsking] = useState(false);
  const [why, setWhy] = useState("");
  const ids = useId();
  const status = (it.status in TONE ? it.status : "requested") as DocStatus;
  const go = (move: string, ok: string, note = "") => run(() => moveDocRequest(it.id, move, note, from), ok, () => { setAsking(false); setWhy(""); });

  return (
    <li className="py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={`text-sm font-medium ${status === "waived" ? "text-slate-400 line-through" : "text-navy-900"}`}>{it.label}</p>
          {it.note && <p className="text-[12px] text-slate-600">{it.note}</p>}
          {status === "requested" && it.reviewNote && (
            <p className="text-[12px] text-amber-800">Asked again: {it.reviewNote}</p>
          )}
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${TONE[status]}`}>
          {STAFF_STATUS_LABEL[status]}
        </span>
      </div>

      {it.files.length > 0 && (
        <ul className="mt-1 space-y-0.5" aria-label={`Files for ${it.label}`}>
          {it.files.map((f, i) => (
            <li key={`${f}-${i}`} className="flex items-center gap-1.5 text-[12px] text-slate-600">
              <FileText size={12} className="shrink-0 text-slate-400" aria-hidden="true" />
              <span className="truncate" title={f}>{f}</span>
            </li>
          ))}
          {it.received && <li className="text-[11px] text-slate-500">Uploaded {it.received} · in the Drive intake folder</li>}
        </ul>
      )}

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {status === "received" && (
          <button type="button" className={`${small} bg-emerald-50 text-emerald-800 ring-emerald-200 hover:bg-emerald-100`} disabled={pending} onClick={() => go("accept", "Accepted")}>
            <Check size={12} aria-hidden="true" /> Accept
          </button>
        )}
        {(status === "received" || status === "accepted") && !asking && (
          <button type="button" className={`${small} bg-white text-amber-800 ring-amber-200 hover:bg-amber-50`} disabled={pending} onClick={() => setAsking(true)}>
            <RotateCcw size={12} aria-hidden="true" /> Needs another copy
          </button>
        )}
        {(status === "requested" || status === "received") && (
          <button type="button" className={`${small} bg-white text-slate-700 ring-slate-300 hover:bg-slate-50`} disabled={pending} onClick={() => go("waive", "Marked not needed")}>
            <X size={12} aria-hidden="true" /> Not needed
          </button>
        )}
        {status === "waived" && (
          <button type="button" className={`${small} bg-white text-navy-900 ring-slate-300 hover:bg-slate-50`} disabled={pending} onClick={() => go("reopen", "Back on the list")}>
            <Undo2 size={12} aria-hidden="true" /> Put back
          </button>
        )}
        <button
          type="button"
          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 disabled:opacity-50"
          aria-label={`Take off the list: ${it.label}`}
          title="Take off the list"
          disabled={pending}
          onClick={() => go("remove", "Removed")}
        >
          <Trash2 size={13} aria-hidden="true" />
        </button>
        <StatusLine pending={pending} done={done} />
      </div>

      {asking && (
        <form
          className="mt-2 flex flex-col gap-1.5"
          onSubmit={(e) => { e.preventDefault(); go("again", "Asked again", why); }}
        >
          <label htmlFor={`${ids}-why`} className="text-[11px] font-semibold text-slate-700">What is wrong with it? The broker sees this.</label>
          <input id={`${ids}-why`} value={why} onChange={(e) => setWhy(e.target.value)} maxLength={MAX_NOTE} placeholder="e.g. Page 3 of 4 is missing" disabled={pending} className={input} autoFocus />
          <div className="flex gap-2">
            <button type="submit" className={primary} disabled={pending || !why.trim()}>Ask for another copy</button>
            <button type="button" className={`${small} bg-white text-slate-700 ring-slate-300 hover:bg-slate-100`} onClick={() => setAsking(false)} disabled={pending}>Cancel</button>
          </div>
        </form>
      )}
      {error && <p role="alert" className="mt-1 text-xs text-red-600">{error}</p>}
    </li>
  );
}

function StatusLine({ pending, done }: { pending: boolean; done: string | null }) {
  return (
    <span aria-live="polite" className="inline-flex items-center gap-1 text-[11px]">
      {pending && <span className="inline-flex items-center gap-1 text-slate-500"><Loader2 size={12} className="animate-spin" aria-hidden="true" /> Saving…</span>}
      {!pending && done && <span className="inline-flex items-center gap-1 text-emerald-700"><CircleCheck size={12} aria-hidden="true" /> {done}</span>}
    </span>
  );
}
