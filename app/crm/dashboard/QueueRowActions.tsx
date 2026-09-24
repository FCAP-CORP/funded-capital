"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import {
  AlarmClock, Check, Loader2, Mail, MessageSquare, MoreHorizontal, Phone, StickyNote, Undo2,
} from "lucide-react";
import { MAX_NOTE_LENGTH } from "@/lib/crm/followup";
import { LOG_ACTIONS, snoozeOptions, stageOptions, type SnoozeOption } from "@/lib/crm/queueView";
import { clearSnooze, logContact, markLost, setSnooze, setStage } from "../actions";
import { ConfirmFundedDialog, LostReasonDialog } from "../StageDialogs";

/**
 * Every action on this page refreshes THIS page and no other. See the note on
 * CrmRoute in ../actions.ts — refreshing a different /crm route from here once
 * froze the whole section on its loading shell. guards.regress.ts §8 fails the
 * build if a call below stops passing HERE.
 */
const HERE = "/crm/dashboard" as const;

/**
 * The buttons on a work-queue row, and "bring back" under the put-down list.
 *
 * ONE VISIBLE BUTTON. "Log call" is the thing done most often from this list,
 * so it is the only control on the row. Everything else — log an email or a
 * text, a note, a snooze, a stage — sits in a "More" menu. The menu is a native
 * <details>: it opens with Enter or Space on its summary, it is announced as
 * expandable by every screen reader, and it needs no script to exist. The
 * script here only closes it (Escape, a click elsewhere, or a finished action)
 * and fills in the snooze dates when it opens.
 *
 * ONE REQUEST PER ROW AT A TIME. Every control on a row shares one transition,
 * so while a click is in flight the whole row is disabled. Two quick clicks —
 * "Log call" then "Snooze" — cannot race each other into an order nobody chose.
 *
 * On success there is nothing to update by hand: each action revalidates the
 * dashboard and the fresh list arrives in the same response. A row that has
 * just been snoozed or moved on disappearing from the queue is that working.
 */

type Result = { ok: true } | { ok: false; error: string };

const LOG_ICON = { call: Phone, email_out: Mail, sms_out: MessageSquare } as const;

const CALL = LOG_ACTIONS.find((a) => a.kind === "call")!;
const OTHER_LOGS = LOG_ACTIONS.filter((a) => a.kind !== "call");

const btn =
  "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-semibold text-navy-900 " +
  "hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 disabled:pointer-events-none " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-1";

const menuItem =
  "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-navy-900 hover:bg-slate-100 " +
  "disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500";

const chip =
  "inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 " +
  "hover:border-slate-300 hover:bg-slate-100 hover:text-navy-900 disabled:opacity-50 disabled:pointer-events-none " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500";

const input =
  "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm placeholder:text-slate-500 " +
  "focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500 disabled:opacity-60";

const heading = "px-2.5 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-widest text-slate-500";

export function QueueRowActions({
  applicationId, name, stage,
}: {
  applicationId: string;
  name: string;
  stage: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [options, setOptions] = useState<SnoozeOption[]>([]);
  const [stageValue, setStageValue] = useState(stage);
  // Funded and Closed – Lost ask first, exactly as the table, board and record
  // card do. Until 24 Sep this menu moved them without a question.
  const [ask, setAsk] = useState<null | "funded" | "lost">(null);
  // The menu's contents exist only while it is open: ninety rows each carrying
  // a closed menu with a sixteen-option stage list is weight nobody sees.
  const [menuOpen, setMenuOpen] = useState(false);
  const menu = useRef<HTMLDetailsElement>(null);
  const ids = useId();

  // A revalidation can hand down a newer stage than the one on screen.
  useEffect(() => { setStageValue(stage); }, [stage]);

  // "Recorded" is a moment, not a state.
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(null), 2500);
    return () => clearTimeout(t);
  }, [done]);

  // A click anywhere outside an open menu closes it, as every menu does.
  useEffect(() => {
    function onDown(e: PointerEvent) {
      const el = menu.current;
      if (el?.open && e.target instanceof Node && !el.contains(e.target)) el.open = false;
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  function closeMenu(focusSummary = false) {
    const el = menu.current;
    if (!el) return;
    el.open = false;
    setNoteOpen(false);
    if (focusSummary) el.querySelector("summary")?.focus();
  }

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

  const CallIcon = LOG_ICON.call;

  return (
    <div className="relative flex flex-col items-end">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className={btn}
          disabled={pending}
          title={CALL.hint}
          aria-label={`${CALL.label} with ${name}. ${CALL.hint}`}
          onClick={() => run(() => logContact(applicationId, "call", "", HERE), CALL.done)}
        >
          {pending ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <CallIcon size={14} aria-hidden="true" />}
          {CALL.label}
        </button>

        <details
          ref={menu}
          className="group relative"
          onToggle={(e) => {
            // Counted from the moment the menu opens, not from when the page
            // loaded — a tab left open overnight must not offer yesterday's
            // "tomorrow".
            const open = e.currentTarget.open;
            setMenuOpen(open);
            if (open) { setOptions(snoozeOptions(new Date())); setError(null); }
            else setNoteOpen(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" && menu.current?.open) { e.preventDefault(); closeMenu(true); }
          }}
        >
          <summary
            aria-label={`More actions for ${name}`}
            title="More actions"
            className={`${btn} w-9 cursor-pointer list-none justify-center px-0 group-open:border-navy-900 [&::-webkit-details-marker]:hidden`}
          >
            <MoreHorizontal size={16} aria-hidden="true" />
          </summary>

          {menuOpen && <div
            className="absolute right-0 top-full z-30 mt-1.5 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-1.5 text-left shadow-card-hover"
          >
            <p className={heading}>Record</p>
            {OTHER_LOGS.map((a) => {
              const Icon = LOG_ICON[a.kind];
              return (
                <button
                  key={a.kind}
                  type="button"
                  className={menuItem}
                  disabled={pending}
                  title={a.hint}
                  aria-label={`${a.label} with ${name}. ${a.hint}`}
                  onClick={() => run(() => logContact(applicationId, a.kind, "", HERE), a.done, () => closeMenu())}
                >
                  <Icon size={14} className="text-slate-500" aria-hidden="true" />
                  {a.label}
                </button>
              );
            })}
            <button
              type="button"
              className={menuItem}
              disabled={pending}
              aria-expanded={noteOpen}
              aria-controls={`${ids}-note`}
              title="Write a note on this deal. Notes do not count as contact."
              onClick={() => { setError(null); setNoteOpen(!noteOpen); }}
            >
              <StickyNote size={14} className="text-slate-500" aria-hidden="true" />
              Note
            </button>
            {noteOpen && (
              <form
                id={`${ids}-note`}
                className="flex flex-col gap-1.5 px-2.5 pb-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!note.trim()) return;
                  run(() => logContact(applicationId, "note", note, HERE), "Note saved", () => { setNote(""); closeMenu(); });
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
                  className={input}
                />
                <button type="submit" className={`${chip} self-start`} disabled={pending || !note.trim()}>
                  <Check size={12} aria-hidden="true" /> Save note
                </button>
              </form>
            )}

            <div className="my-1 border-t border-slate-100" />
            <div role="group" aria-labelledby={`${ids}-snooze`}>
              <p id={`${ids}-snooze`} className={`${heading} flex items-center gap-1.5`}>
                <AlarmClock size={12} aria-hidden="true" /> Snooze until
              </p>
              <div className="px-2.5 pb-2">
                <label htmlFor={`${ids}-reason`} className="sr-only">Why you are putting this down (optional)</label>
                <input
                  id={`${ids}-reason`}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={MAX_NOTE_LENGTH}
                  placeholder="Why? (optional)"
                  disabled={pending}
                  className={input}
                />
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {options.map((o) => (
                    <button
                      key={o.label}
                      type="button"
                      className={chip}
                      disabled={pending}
                      aria-label={`Snooze ${name} until ${o.day}`}
                      onClick={() => run(() => setSnooze(applicationId, o.iso, reason, HERE), `Snoozed to ${o.day}`, () => { setReason(""); closeMenu(); })}
                    >
                      {o.label}
                      <span aria-hidden="true" className="text-slate-400">·</span>
                      <span className="tabular-nums text-slate-500">{o.day}</span>
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500">Back that morning, New York time, or sooner if they write.</p>
              </div>
            </div>

            <div className="my-1 border-t border-slate-100" />
            <div className="px-2.5 pb-2">
              <label htmlFor={`${ids}-stage`} className={`${heading} block px-0`}>Stage</label>
              <select
                id={`${ids}-stage`}
                value={stageValue}
                disabled={pending}
                onChange={(e) => {
                  const next = e.target.value;
                  if (next === stage) { setStageValue(next); return; }
                  setStageValue(next);
                  if (next === "funded" || next === "closed_lost") {
                    closeMenu();
                    setAsk(next === "funded" ? "funded" : "lost");
                    return;
                  }
                  // On failure the menu snaps back to what the database actually holds.
                  run(() => setStage(applicationId, next, HERE), "Stage changed", () => closeMenu(), () => setStageValue(stage));
                }}
                className={input}
              >
                {stageOptions(stage).map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>}
        </details>
      </div>

      {/* Out of the flow, so an idle row is no taller than its buttons. */}
      <span aria-live="polite" className="pointer-events-none absolute right-0 top-full mt-0.5 whitespace-nowrap text-[11px]">
        {pending && <span className="text-slate-500">Saving…</span>}
        {!pending && done && (
          <span className="inline-flex items-center gap-1 text-emerald-700">
            <Check size={12} aria-hidden="true" /> {done}
          </span>
        )}
      </span>
      {error && <p role="alert" className="mt-4 max-w-[16rem] text-right text-[11px] text-red-700">{error}</p>}

      {ask === "funded" && (
        <ConfirmFundedDialog
          open
          names={[name]}
          onCancel={() => { setAsk(null); setStageValue(stage); }}
          onConfirm={() => {
            setAsk(null);
            run(() => setStage(applicationId, "funded", HERE), "Marked funded", undefined, () => setStageValue(stage));
          }}
        />
      )}
      {ask === "lost" && (
        <LostReasonDialog
          open
          names={[name]}
          onCancel={() => { setAsk(null); setStageValue(stage); }}
          onConfirm={(choice, note) => {
            setAsk(null);
            run(() => markLost(applicationId, choice, note, HERE), "Marked lost", undefined, () => setStageValue(stage));
          }}
        />
      )}
    </div>
  );
}

/** "Bring back now" on a put-down deal. */
export function BringBackButton({ applicationId, name }: { applicationId: string; name: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        className={chip}
        disabled={pending}
        aria-label={`Bring ${name} back to the queue now`}
        onClick={() => {
          setError(null);
          start(async () => {
            const res: Result = await clearSnooze(applicationId, HERE);
            if (!res.ok) setError(res.error);
          });
        }}
      >
        {pending ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : <Undo2 size={12} aria-hidden="true" />}
        Bring back now
      </button>
      {error && <span role="alert" className="mt-1 max-w-[16rem] text-right text-[11px] text-red-700">{error}</span>}
    </span>
  );
}
