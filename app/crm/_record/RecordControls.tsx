"use client";

import { useEffect, useId, useOptimistic, useState, useTransition } from "react";
import {
  AlarmClock, Check, CircleCheck, Loader2, Mail, MessageSquare, Phone, Plus, StickyNote, Trash2, Undo2,
} from "lucide-react";
import { MAX_NOTE_LENGTH } from "@/lib/crm/followup";
import { LOG_ACTIONS, snoozeOptions, stageOptions, type SnoozeOption } from "@/lib/crm/queueView";
import { LOST_REASONS, MAX_LOST_NOTE } from "@/lib/crm/board";
import { MAX_TASK_TITLE, type TaskState } from "@/lib/crm/tasks";
import { InlineText } from "../Editable";
import {
  addTask,
  clearSnooze,
  deleteTask,
  logContact,
  markLost,
  setApplicationNotes,
  setContactField,
  setSnooze,
  setStage,
  toggleTask,
  type CrmRoute,
} from "../actions";

/**
 * The interactive parts of the record card. Everything else on the card is
 * server-rendered HTML.
 *
 * EVERY ACTION HERE REFRESHES THE PAGE THE CARD IS OPEN ON, AND NO OTHER. The
 * card opens over /crm, /crm/board and /crm/dashboard, so unlike the dashboard's
 * row buttons these components cannot hard-code a HERE. Each takes `from` — the
 * opening page's own route, handed down by RecordCardSlot from that page's HERE
 * — and passes it as the last argument of every call. guards.regress.ts §8
 * fails the build if a call here stops doing that. See CrmRoute in ../actions.ts
 * for what happens when an action refreshes a different /crm route.
 *
 * Refreshing that page re-renders the card with it (the card is part of the
 * page), so nothing here keeps its own copy of the data.
 */

type Result = { ok: true } | { ok: false; error: string };

const LOG_ICON = { call: Phone, email_out: Mail, sms_out: MessageSquare } as const;

const btn =
  "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 " +
  "hover:border-slate-300 hover:bg-slate-100 hover:text-navy-900 disabled:opacity-50 disabled:pointer-events-none " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500";

const primary =
  "inline-flex items-center gap-1.5 rounded-lg bg-navy-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy-800 " +
  "disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500";

const input =
  "rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm placeholder:text-slate-400 " +
  "focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500 disabled:opacity-60";

/** One in-flight request per control group, a "done" flash, and an error line. */
function useRun() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(null), 2500);
    return () => clearTimeout(t);
  }, [done]);

  function run(call: () => Promise<Result>, ok: string, after?: () => void, onFail?: () => void) {
    setError(null);
    setDone(null);
    start(async () => {
      const res = await call();
      if (res.ok) {
        setDone(ok);
        after?.();
      } else {
        setError(res.error);
        onFail?.();
      }
    });
  }

  return { pending, error, setError, done, run };
}

function Status({ pending, done, error }: { pending: boolean; done: string | null; error: string | null }) {
  return (
    <>
      <span aria-live="polite" className="inline-flex items-center gap-1 text-[11px]">
        {pending && (
          <span className="inline-flex items-center gap-1 text-slate-500">
            <Loader2 size={12} className="animate-spin" aria-hidden="true" /> Saving…
          </span>
        )}
        {!pending && done && (
          <span className="inline-flex items-center gap-1 text-emerald-700">
            <Check size={12} aria-hidden="true" /> {done}
          </span>
        )}
      </span>
      {error && <p role="alert" className="mt-1.5 w-full text-xs text-red-600">{error}</p>}
    </>
  );
}

/** Escape inside a sub-form closes the sub-form, not the whole card. */
function escapeCloses(onClose: () => void) {
  return (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };
}

/* ------------------------------------------------------------ quick actions */

/**
 * Log call / Log email / Log text / Note, and the stage.
 *
 * RECORD ONLY. Every label starts with "Log" and every tooltip says it does not
 * place a call or send anything — the same wording the dashboard uses, from the
 * same LOG_ACTIONS list, so the two screens cannot drift.
 *
 * The stage menu asks before two moves, exactly as the board does: Funded,
 * because it books the deal into the month's numbers, and Closed – Lost,
 * because a lost deal with no reason teaches nothing.
 */
export function QuickActions({
  applicationId, name, stage, from,
}: {
  applicationId: string;
  name: string;
  stage: string;
  from: CrmRoute;
}) {
  const { pending, error, setError, done, run } = useRun();
  const [panel, setPanel] = useState<null | "note" | "funded" | "lost">(null);
  const [note, setNote] = useState("");
  const [stageValue, setStageValue] = useState(stage);
  const [lostChoice, setLostChoice] = useState("");
  const [lostNote, setLostNote] = useState("");
  const ids = useId();

  useEffect(() => { setStageValue(stage); }, [stage]);

  const closePanel = () => {
    setPanel(null);
    setError(null);
    setStageValue(stage);
  };

  const lostReady =
    lostChoice !== "" && (lostChoice !== "Other" || lostNote.trim() !== "") && lostNote.length <= MAX_LOST_NOTE;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {LOG_ACTIONS.map((a) => {
          const Icon = LOG_ICON[a.kind];
          return (
            <button
              key={a.kind}
              type="button"
              className={btn}
              disabled={pending}
              title={a.hint}
              aria-label={`${a.label} with ${name}. ${a.hint}`}
              onClick={() => run(() => logContact(applicationId, a.kind, "", from), a.done)}
            >
              <Icon size={13} aria-hidden="true" />
              {a.label}
            </button>
          );
        })}
        <button
          type="button"
          className={btn}
          disabled={pending}
          aria-expanded={panel === "note"}
          aria-controls={`${ids}-note`}
          title="Add a note to the timeline. Notes do not count as contact."
          onClick={() => { setError(null); setPanel(panel === "note" ? null : "note"); }}
        >
          <StickyNote size={13} aria-hidden="true" />
          Note
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`${ids}-stage`} className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
          Stage
        </label>
        <select
          id={`${ids}-stage`}
          value={stageValue}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.value;
            setStageValue(next);
            setError(null);
            if (next === stage) { setPanel(null); return; }
            if (next === "funded") { setPanel("funded"); return; }
            if (next === "closed_lost") { setLostChoice(""); setLostNote(""); setPanel("lost"); return; }
            setPanel(null);
            run(() => setStage(applicationId, next, from), "Stage changed", undefined, () => setStageValue(stage));
          }}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-medium text-navy-900 disabled:opacity-60 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
        >
          {stageOptions(stage).map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <Status pending={pending} done={done} error={null} />
      </div>

      {panel === "note" && (
        <form
          id={`${ids}-note`}
          className="flex flex-col gap-1.5"
          onKeyDown={escapeCloses(closePanel)}
          onSubmit={(e) => {
            e.preventDefault();
            if (!note.trim()) return;
            run(() => logContact(applicationId, "note", note, from), "Note saved", () => { setNote(""); setPanel(null); });
          }}
        >
          <label htmlFor={`${ids}-note-text`} className="sr-only">Note on {name}</label>
          <textarea
            id={`${ids}-note-text`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={MAX_NOTE_LENGTH}
            rows={2}
            placeholder="What happened, or what to remember"
            disabled={pending}
            autoFocus
            className={`${input} w-full`}
          />
          <div className="flex gap-1.5">
            <button type="submit" className={primary} disabled={pending || !note.trim()}>
              <Check size={13} aria-hidden="true" /> Save note
            </button>
            <button type="button" className={btn} disabled={pending} onClick={closePanel}>Cancel</button>
          </div>
        </form>
      )}

      {panel === "funded" && (
        <div role="group" aria-label={`Confirm ${name} funded`} className="rounded-lg border border-emerald-200 bg-emerald-50 p-3" onKeyDown={escapeCloses(closePanel)}>
          <p className="text-sm text-emerald-900">
            Mark {name} as funded? This counts toward Funded on the dashboard from today.
          </p>
          <div className="mt-2 flex gap-1.5">
            {/* Cancel first and focused: a reflex Enter must not book revenue. */}
            <button type="button" className={btn} autoFocus onClick={closePanel}>Cancel</button>
            <button
              type="button"
              className={primary}
              disabled={pending}
              onClick={() => run(() => setStage(applicationId, "funded", from), "Marked funded", () => setPanel(null), () => setStageValue(stage))}
            >
              Mark funded
            </button>
          </div>
        </div>
      )}

      {panel === "lost" && (
        <div role="group" aria-label={`Why was ${name} lost`} className="rounded-lg border border-slate-200 bg-slate-50 p-3" onKeyDown={escapeCloses(closePanel)}>
          <label htmlFor={`${ids}-lost`} className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Why was it lost?
          </label>
          <select
            id={`${ids}-lost`}
            value={lostChoice}
            autoFocus
            onChange={(e) => setLostChoice(e.target.value)}
            className={`${input} mt-1 w-full`}
          >
            <option value="" disabled>Pick one…</option>
            {LOST_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <label htmlFor={`${ids}-lost-note`} className="mt-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Detail {lostChoice === "Other" ? "(required)" : "(optional)"}
          </label>
          <input
            id={`${ids}-lost-note`}
            value={lostNote}
            onChange={(e) => setLostNote(e.target.value)}
            maxLength={MAX_LOST_NOTE}
            placeholder="e.g. which lender, what rate"
            className={`${input} mt-1 w-full`}
          />
          <div className="mt-2 flex gap-1.5">
            <button type="button" className={btn} onClick={closePanel}>Cancel</button>
            <button
              type="button"
              className={primary}
              disabled={pending || !lostReady}
              onClick={() => run(() => markLost(applicationId, lostChoice, lostNote, from), "Closed as lost", () => setPanel(null), () => setStageValue(stage))}
            >
              Close as lost
            </button>
          </div>
        </div>
      )}

      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

/* ---------------------------------------------------------------- follow-up */

/**
 * The deal's next follow-up — the dashboard's snooze, seen from the deal.
 *
 * Same presets, counted on the New York calendar at the moment the menu opens
 * (not when the page loaded, so a tab left open overnight does not offer
 * yesterday's "tomorrow"), and the same "bring back now".
 */
export function FollowUp({
  applicationId, name, hasFollowUp, from,
}: {
  applicationId: string;
  name: string;
  hasFollowUp: boolean;
  from: CrmRoute;
}) {
  const { pending, error, setError, done, run } = useRun();
  const [openMenu, setOpenMenu] = useState(false);
  const [reason, setReason] = useState("");
  const [options, setOptions] = useState<SnoozeOption[]>([]);
  const ids = useId();

  const close = () => { setOpenMenu(false); setError(null); };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          className={btn}
          disabled={pending}
          aria-expanded={openMenu}
          aria-controls={`${ids}-menu`}
          onClick={() => {
            setError(null);
            if (openMenu) { setOpenMenu(false); return; }
            setOptions(snoozeOptions(new Date()));
            setOpenMenu(true);
          }}
        >
          <AlarmClock size={13} aria-hidden="true" />
          {hasFollowUp ? "Change date" : "Set a follow-up"}
        </button>
        {hasFollowUp && (
          <button
            type="button"
            className={btn}
            disabled={pending}
            aria-label={`Clear the follow-up on ${name} and bring it back to the queue now`}
            onClick={() => run(() => clearSnooze(applicationId, from), "Follow-up cleared")}
          >
            <Undo2 size={13} aria-hidden="true" />
            Clear
          </button>
        )}
        <Status pending={pending} done={done} error={null} />
      </div>

      {openMenu && (
        <div id={`${ids}-menu`} role="group" aria-label={`Follow up with ${name} on`} className="flex flex-col gap-1.5" onKeyDown={escapeCloses(close)}>
          <label htmlFor={`${ids}-why`} className="sr-only">Why (optional)</label>
          <input
            id={`${ids}-why`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={MAX_NOTE_LENGTH}
            placeholder="Why? (optional) — shown when it comes back"
            disabled={pending}
            autoFocus
            className={`${input} w-full`}
          />
          <div className="flex flex-wrap gap-1.5">
            {options.map((o) => (
              <button
                key={o.label}
                type="button"
                className={btn}
                disabled={pending}
                onClick={() => run(() => setSnooze(applicationId, o.iso, reason, from), `Follow-up ${o.day}`, () => { setReason(""); setOpenMenu(false); })}
              >
                <span>{o.label}</span>
                <span aria-hidden="true" className="text-slate-400">·</span>
                <span className="tabular-nums text-slate-500">{o.day}</span>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-500">
            Off the dashboard queue until that morning, New York time — or sooner if they write to you.
          </p>
        </div>
      )}
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------- tasks */

export type TaskView = {
  id: string;
  title: string;
  /** "Today", "Thu 1 Oct", "No date" — computed on the server's clock. */
  due: string;
  state: TaskState;
};

const STATE_TONE: Record<TaskState, string> = {
  overdue: "bg-red-50 text-red-700 ring-red-600/20",
  due_today: "bg-amber-50 text-amber-800 ring-amber-600/20",
  upcoming: "bg-slate-100 text-slate-600 ring-slate-500/10",
  no_date: "bg-slate-50 text-slate-400 ring-slate-500/10",
  done: "bg-slate-50 text-slate-400 ring-slate-500/10",
};

/**
 * Tasks on this deal. Ticking is optimistic — the box ticks at once and snaps
 * back with a reason if the server refuses — because a checkbox that lags feels
 * broken even when it is not.
 */
export function TaskPanel({
  applicationId, open, done, hiddenDone, today, from,
}: {
  applicationId: string;
  open: TaskView[];
  done: TaskView[];
  hiddenDone: number;
  /** New York today, "YYYY-MM-DD" — the earliest due date the picker offers. */
  today: string;
  from: CrmRoute;
}) {
  const { pending, error, setError, done: flash, run } = useRun();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [ticks, setTick] = useOptimistic<Record<string, boolean>, { id: string; on: boolean }>(
    {},
    (state, t) => ({ ...state, [t.id]: t.on }),
  );
  const [, startTick] = useTransition();
  const ids = useId();

  function tick(task: TaskView, on: boolean) {
    setError(null);
    startTick(async () => {
      setTick({ id: task.id, on });
      const res = await toggleTask(task.id, on, from);
      if (!res.ok) setError(`"${task.title}" was not updated: ${res.error}`);
    });
  }

  const row = (t: TaskView, isDone: boolean) => {
    const checked = ticks[t.id] ?? isDone;
    return (
      <li key={t.id} className="group flex items-start gap-2.5 py-2">
        <input
          id={`${ids}-${t.id}`}
          type="checkbox"
          checked={checked}
          onChange={(e) => tick(t, e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-navy-900 accent-navy-900 focus:ring-gold-500"
        />
        <label htmlFor={`${ids}-${t.id}`} className="min-w-0 flex-1 cursor-pointer">
          <span className={`block break-words text-sm ${checked ? "text-slate-400 line-through" : "text-navy-900"}`}>
            {t.title}
          </span>
          {!isDone && (
            <span className={`mt-0.5 inline-flex rounded-full px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${STATE_TONE[t.state]}`}>
              {t.state === "overdue" ? `Overdue · ${t.due}` : t.state === "no_date" ? "No due date" : `Due ${t.due}`}
            </span>
          )}
        </label>
        <button
          type="button"
          className="shrink-0 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
          aria-label={`Remove task: ${t.title}`}
          title="Remove task"
          disabled={pending}
          onClick={() => run(() => deleteTask(t.id, from), "Task removed")}
        >
          <Trash2 size={14} aria-hidden="true" />
        </button>
      </li>
    );
  };

  return (
    <div>
      <form
        className="flex flex-wrap items-end gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          run(() => addTask(applicationId, title, due, from), "Task added", () => { setTitle(""); setDue(""); });
        }}
      >
        <div className="min-w-[12rem] flex-1">
          <label htmlFor={`${ids}-title`} className="sr-only">New task</label>
          <input
            id={`${ids}-title`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={MAX_TASK_TITLE}
            placeholder="Add a task — e.g. order the appraisal"
            disabled={pending}
            className={`${input} w-full`}
          />
        </div>
        <div>
          <label htmlFor={`${ids}-due`} className="sr-only">Due date (optional)</label>
          <input
            id={`${ids}-due`}
            type="date"
            value={due}
            min={today}
            onChange={(e) => setDue(e.target.value)}
            disabled={pending}
            className={`${input} w-[9.5rem]`}
          />
        </div>
        <button type="submit" className={primary} disabled={pending || !title.trim()}>
          <Plus size={13} aria-hidden="true" /> Add
        </button>
        <span className="basis-full"><Status pending={pending} done={flash} error={null} /></span>
      </form>

      {open.length === 0 && done.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No tasks on this deal yet.</p>
      ) : (
        <>
          {open.length > 0 ? (
            <ul className="mt-2 divide-y divide-slate-100" aria-label="Open tasks">
              {open.map((t) => row(t, false))}
            </ul>
          ) : (
            <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-emerald-700">
              <CircleCheck size={14} aria-hidden="true" /> Nothing open.
            </p>
          )}
          {done.length > 0 && (
            <>
              <h4 className="mt-3 text-[11px] font-semibold uppercase tracking-widest text-slate-400">Recently done</h4>
              <ul className="divide-y divide-slate-100" aria-label="Recently completed tasks">
                {done.map((t) => row(t, true))}
              </ul>
              {hiddenDone > 0 && (
                <p className="text-[11px] text-slate-400">and {hiddenDone} older completed {hiddenDone === 1 ? "task" : "tasks"}</p>
              )}
            </>
          )}
        </>
      )}
      {error && <p role="alert" className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------- fields */

/** The deal's notes field — the same editor the Pipeline grid uses. */
export function DealNotes({ applicationId, initial, from }: { applicationId: string; initial: string | null; from: CrmRoute }) {
  return (
    <InlineText
      id={applicationId}
      initial={initial}
      placeholder="Add notes on this deal…"
      multiline
      onSave={(id, _field, value) => setApplicationNotes(id, value, from)}
    />
  );
}

/**
 * One editable contact field — the Contacts grid's editor, and the same
 * whitelist: target market, credit band, owner and notes. Email, phone and
 * consent are NOT editable here, for the reasons on setContactField.
 */
export function ContactField({
  contactId, field, initial, placeholder, multiline = false, from,
}: {
  contactId: string;
  field: "targetMarket" | "creditBand" | "ownerName" | "notes";
  initial: string | null;
  placeholder: string;
  multiline?: boolean;
  from: CrmRoute;
}) {
  return (
    <InlineText
      id={contactId}
      field={field}
      initial={initial}
      placeholder={placeholder}
      multiline={multiline}
      onSave={(id, f, value) => setContactField(id, f, value, from)}
    />
  );
}
