"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { AlarmClock, Check, Loader2, Mail, MessageSquare, Phone, StickyNote, Undo2, X } from "lucide-react";
import { MAX_NOTE_LENGTH } from "@/lib/crm/followup";
import { LOG_ACTIONS, snoozeOptions, stageOptions, type SnoozeOption } from "@/lib/crm/queueView";
import { clearSnooze, logContact, setSnooze, setStage } from "../actions";

/**
 * Every action on this page refreshes THIS page and no other. See the note on
 * CrmRoute in ../actions.ts — refreshing a different /crm route from here once
 * froze the whole section on its loading shell.
 */
const HERE = "/crm/dashboard" as const;

/**
 * The only JavaScript on the dashboard.
 *
 * The table, the badges, the counts and the put-down list all render on the
 * server. This file is the handful of buttons on each row and the "bring back"
 * button under the list — nothing else ships to the browser.
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

const btn =
  "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 " +
  "hover:border-slate-300 hover:bg-slate-100 hover:text-navy-900 disabled:opacity-50 disabled:pointer-events-none " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500";

const input =
  "rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs placeholder:text-slate-400 " +
  "focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500 disabled:opacity-60";

function Err({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <p role="alert" className="mt-1.5 text-[11px] text-red-600">{msg}</p>;
}

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
  const [panel, setPanel] = useState<null | "note" | "snooze">(null);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [options, setOptions] = useState<SnoozeOption[]>([]);
  const [stageValue, setStageValue] = useState(stage);
  const ids = useId();

  // A revalidation can hand down a newer stage than the one on screen.
  useEffect(() => { setStageValue(stage); }, [stage]);

  // "Recorded" is a moment, not a state.
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

  function toggle(next: "note" | "snooze") {
    setError(null);
    if (panel === next) { setPanel(null); return; }
    // Counted from the moment the panel opens, not from when the page loaded —
    // a tab left open overnight must not offer yesterday's "tomorrow".
    if (next === "snooze") setOptions(snoozeOptions(new Date()));
    setPanel(next);
  }

  const close = () => { setPanel(null); setError(null); };

  return (
    <div
      className="flex flex-col gap-2"
      onKeyDown={(e) => { if (e.key === "Escape" && panel) close(); }}
    >
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
              onClick={() => run(() => logContact(applicationId, a.kind, "", HERE), a.done)}
            >
              <Icon size={12} aria-hidden="true" />
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
          title="Write a note on this deal. Notes do not count as contact."
          onClick={() => toggle("note")}
        >
          <StickyNote size={12} aria-hidden="true" />
          Note
        </button>

        <button
          type="button"
          className={btn}
          disabled={pending}
          aria-expanded={panel === "snooze"}
          aria-controls={`${ids}-snooze`}
          title="Take this off the queue until a date. It comes back early if they write to you."
          onClick={() => toggle("snooze")}
        >
          <AlarmClock size={12} aria-hidden="true" />
          Snooze
        </button>

        <label htmlFor={`${ids}-stage`} className="sr-only">Stage for {name}</label>
        <select
          id={`${ids}-stage`}
          value={stageValue}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.value;
            if (next === stage) { setStageValue(next); return; }
            setStageValue(next);
            // On failure the menu snaps back to what the database actually holds.
            run(() => setStage(applicationId, next, HERE), "Stage changed", undefined, () => setStageValue(stage));
          }}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 disabled:opacity-60 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
        >
          {stageOptions(stage).map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

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
      </div>

      {panel === "note" && (
        <form
          id={`${ids}-note`}
          className="flex flex-wrap items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!note.trim()) return;
            run(() => logContact(applicationId, "note", note, HERE), "Note saved", () => { setNote(""); setPanel(null); });
          }}
        >
          <label htmlFor={`${ids}-note-text`} className="sr-only">Note on {name}</label>
          <input
            id={`${ids}-note-text`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={MAX_NOTE_LENGTH}
            placeholder="What happened, or what to remember"
            disabled={pending}
            autoFocus
            className={`${input} w-72 max-w-full`}
          />
          <button type="submit" className={btn} disabled={pending || !note.trim()}>
            <Check size={12} aria-hidden="true" /> Save note
          </button>
          <button type="button" className={btn} disabled={pending} onClick={close} aria-label="Cancel note">
            <X size={12} aria-hidden="true" />
          </button>
        </form>
      )}

      {panel === "snooze" && (
        <div id={`${ids}-snooze`} role="group" aria-label={`Snooze ${name} until`} className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <label htmlFor={`${ids}-reason`} className="sr-only">Why you are putting this down (optional)</label>
            <input
              id={`${ids}-reason`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={MAX_NOTE_LENGTH}
              placeholder="Why? (optional) — shown when it comes back"
              disabled={pending}
              autoFocus
              className={`${input} w-72 max-w-full`}
            />
            <button type="button" className={btn} disabled={pending} onClick={close} aria-label="Cancel snooze">
              <X size={12} aria-hidden="true" />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {options.map((o) => (
              <button
                key={o.label}
                type="button"
                className={btn}
                disabled={pending}
                onClick={() => run(() => setSnooze(applicationId, o.iso, reason, HERE), `Snoozed to ${o.day}`, () => { setReason(""); setPanel(null); })}
              >
                <span className="text-slate-700">{o.label}</span>
                <span aria-hidden="true" className="text-slate-400">·</span>
                <span className="tabular-nums text-slate-500">{o.day}</span>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-500">Comes back that morning, New York time — or sooner if they write to you.</p>
        </div>
      )}

      <Err msg={error} />
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
        className={btn}
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
      {error && <span role="alert" className="mt-1 max-w-[16rem] text-right text-[11px] text-red-600">{error}</span>}
    </span>
  );
}
