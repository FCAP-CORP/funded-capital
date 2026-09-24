"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { Check, Loader2, AlertCircle } from "lucide-react";
import { STAGE_ORDER, STAGE_LABEL, GATE_STAGES } from "@/lib/crm/view";

/**
 * The two in-place editors the grid uses.
 *
 * Both are optimistic with an honest failure: the new value shows immediately,
 * and if the write is rejected the field snaps back to what the database
 * actually holds and says so. A CRM that silently keeps a failed edit on screen
 * is worse than one that never had inline editing, because the operator walks
 * away believing the deal moved.
 */

type Result = { ok: true } | { ok: false; error: string };

function useSaver<T>(initial: T, save: (v: T) => Promise<Result>) {
  const [value, setValue] = useState<T>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const committed = useRef<T>(initial);

  // A server revalidation can hand down a newer value than the one we hold.
  useEffect(() => {
    committed.current = initial;
    setValue(initial);
  }, [initial]);

  function commit(next: T) {
    if (next === committed.current) return;
    setValue(next);
    setError(null);
    start(async () => {
      const res = await save(next);
      if (res.ok) {
        committed.current = next;
        setSaved(true);
        setTimeout(() => setSaved(false), 1600);
      } else {
        setValue(committed.current); // snap back to the truth
        setError(res.error);
      }
    });
  }

  return { value, setValue, commit, pending, saved, error };
}

function Status({ pending, saved, error }: { pending: boolean; saved: boolean; error: string | null }) {
  if (pending) return <Loader2 size={13} className="animate-spin text-slate-400 shrink-0" aria-label="Saving" />;
  if (error) return <AlertCircle size={13} className="text-red-500 shrink-0" aria-label={error} />;
  if (saved) return <Check size={13} className="text-emerald-600 shrink-0" aria-label="Saved" />;
  return null;
}

/* ------------------------------------------------------------ stage select */

export function StageSelect({
  applicationId, stage, onSave,
}: {
  applicationId: string;
  stage: string;
  onSave: (id: string, stage: string) => Promise<Result>;
}) {
  const s = useSaver(stage, (v) => onSave(applicationId, v));

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={s.value}
        onChange={(e) => s.commit(e.target.value)}
        disabled={s.pending}
        aria-label="Stage"
        className={`w-full max-w-[13rem] rounded-lg border px-2 py-1 text-xs font-medium bg-white disabled:opacity-60 ${
          s.error
            ? "border-red-300 text-red-700"
            : GATE_STAGES.has(s.value)
              ? "border-gold-500 text-navy-900"
              : s.value === "closed_lost"
                ? "border-slate-200 text-slate-400"
                : "border-slate-200 text-slate-700"
        }`}
      >
        {STAGE_ORDER.map((st) => (
          <option key={st} value={st}>{STAGE_LABEL[st]}</option>
        ))}
        {/* A stage the database holds but the label map doesn't know must still
            be selectable, or opening this dropdown silently rewrites it. */}
        {!STAGE_ORDER.includes(s.value) && <option value={s.value}>{s.value}</option>}
      </select>
      <Status pending={s.pending} saved={s.saved} error={s.error} />
      {s.error && <span className="sr-only">{s.error}</span>}
    </div>
  );
}

/* ------------------------------------------------------------- inline text */

/**
 * One editable field. Commits on blur or Enter; Escape restores the stored value.
 *
 * Two literal elements rather than one dynamic tag: a `<Tag>` chosen at runtime
 * forces a cast that switches off exactly the prop checking that catches a typo
 * in a handler, which is not a trade worth making to save eight lines.
 */
export function InlineText({
  id, field, initial, placeholder, onSave, multiline = false, compact = false,
}: {
  id: string;
  field?: string;
  initial: string | null;
  placeholder: string;
  onSave: (id: string, field: string, value: string) => Promise<Result>;
  multiline?: boolean;
  /**
   * One line tall until focused, then it opens up to edit. For table cells:
   * a two-row textarea in every row made the Pipeline rows ~107px tall, six
   * deals to a screen. Still a textarea, so a note's line breaks survive an
   * edit made from the table.
   */
  compact?: boolean;
}) {
  const s = useSaver(initial ?? "", (v) => onSave(id, field ?? "", v));

  const shared = {
    value: s.value,
    placeholder,
    "aria-label": placeholder,
    disabled: s.pending,
    onBlur: () => s.commit(s.value),
    className: `w-full min-w-[8rem] rounded-lg border px-2 py-1 text-xs bg-white placeholder:text-slate-300 disabled:opacity-60 focus:outline-none focus:ring-1 focus:ring-gold-500 ${
      s.error ? "border-red-300" : "border-transparent hover:border-slate-200 focus:border-gold-500"
    }`,
  };

  return (
    <div className="flex items-start gap-1.5">
      {multiline ? (
        <textarea
          {...shared}
          rows={compact ? 1 : 2}
          className={compact ? `${shared.className} h-7 resize-none overflow-hidden focus:h-24 focus:overflow-auto` : shared.className}
          onChange={(e) => s.setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") s.setValue(initial ?? ""); }}
        />
      ) : (
        <input
          {...shared}
          type="text"
          onChange={(e) => s.setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") s.setValue(initial ?? "");
          }}
        />
      )}
      <span className="pt-1.5"><Status pending={s.pending} saved={s.saved} error={s.error} /></span>
    </div>
  );
}
