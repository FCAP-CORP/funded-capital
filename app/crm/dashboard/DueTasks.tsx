"use client";

import { useOptimistic, useState, useTransition } from "react";
import { toggleTask } from "../actions";
import { RecordLink } from "../_record/RecordCardProvider";

/**
 * Every action on this page refreshes THIS page and no other — same rule and
 * same guard (guards.regress.ts §8) as QueueRowActions.tsx.
 */
const HERE = "/crm/dashboard" as const;

export type DueTaskItem = {
  id: string;
  title: string;
  applicationId: string;
  borrower: string;
  /** "due today", "overdue 2 days" — decided on the server, New York calendar. */
  when: string;
  overdue: boolean;
};

/**
 * Tasks due today or late, each with a checkbox.
 *
 * Ticking is optimistic, the same way the record card's TaskPanel does it: the
 * box ticks at once and the title strikes through, the server confirms, and
 * the refreshed page drops the finished task from the list. If the server
 * refuses, the box snaps back and says why. A checkbox that lags feels broken
 * even when it is not.
 *
 * The borrower's name opens their record card, like every name on this page.
 */
export function DueTasks({ items }: { items: DueTaskItem[] }) {
  const [ticks, setTick] = useOptimistic<Record<string, boolean>, { id: string; on: boolean }>(
    {},
    (state, t) => ({ ...state, [t.id]: t.on }),
  );
  const [, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function tick(task: DueTaskItem, on: boolean) {
    setError(null);
    start(async () => {
      setTick({ id: task.id, on });
      const res = await toggleTask(task.id, on, HERE);
      if (!res.ok) setError(`"${task.title}" was not updated: ${res.error}`);
    });
  }

  return (
    <>
      <ul className="flex flex-col gap-3" aria-label="Tasks due today or overdue">
        {items.map((t) => {
          const checked = ticks[t.id] ?? false;
          const box = `due-${t.id}`;
          return (
            <li key={t.id} className="flex items-start gap-3">
              <input
                id={box}
                type="checkbox"
                checked={checked}
                onChange={(e) => tick(t, e.target.checked)}
                className="mt-0.5 h-[18px] w-[18px] shrink-0 cursor-pointer rounded border-slate-300 accent-navy-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-1"
              />
              <div className="min-w-0 flex-1">
                <label
                  htmlFor={box}
                  className={`block cursor-pointer break-words text-sm font-semibold ${checked ? "text-slate-500 line-through" : "text-navy-900"}`}
                >
                  {t.title}
                </label>
                <p className="mt-0.5 text-xs text-slate-600">
                  <RecordLink
                    applicationId={t.applicationId}
                    label={`Open the full record for ${t.borrower}`}
                    className="rounded-sm underline decoration-slate-300 underline-offset-2 hover:decoration-gold-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
                  >
                    {t.borrower}
                  </RecordLink>
                  <span aria-hidden="true"> · </span>
                  <span className="sr-only">, </span>
                  <span className={t.overdue ? "font-semibold text-red-700" : "text-slate-600"}>{t.when}</span>
                </p>
              </div>
            </li>
          );
        })}
      </ul>
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    </>
  );
}
