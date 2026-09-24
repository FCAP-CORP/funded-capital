"use client";

import { useId, useRef, useState } from "react";

/**
 * The reason tabs over the work queue.
 *
 * NO FETCHING. Every panel is rendered on the server and arrives in the page;
 * this only decides which one is visible. Switching tabs is instant and costs
 * no request, and the rows inside keep their own state (an open menu, a
 * half-typed note) while hidden.
 *
 * ARIA tabs pattern: role="tab" buttons with aria-selected and aria-controls,
 * one tab in the Tab order (roving tabindex), Left/Right/Home/End move between
 * tabs. On a phone the row scrolls sideways inside itself (the page never
 * does) rather than stacking five pills into five lines above the list.
 * The active tab is tracked by its KEY, not its position, so when a
 * revalidation empties a tab and it disappears, the selection does not jump to
 * whichever tab slid into that slot.
 */
export function QueueTabs({
  tabs,
  panels,
  label,
}: {
  tabs: { key: string; label: string; count: number }[];
  panels: React.ReactNode[];
  label: string;
}) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();

  const found = tabs.findIndex((t) => t.key === activeKey);
  const active = found >= 0 ? found : 0;

  function focusTab(i: number) {
    const n = tabs.length;
    const next = ((i % n) + n) % n;
    setActiveKey(tabs[next].key);
    refs.current[next]?.focus();
  }

  return (
    <>
      <div
        role="tablist"
        aria-label={label}
        className="flex gap-2 overflow-x-auto border-b border-slate-100 px-4 pb-4 pt-1 [scrollbar-width:thin] sm:flex-wrap sm:overflow-visible sm:px-5"
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") { e.preventDefault(); focusTab(active + 1); }
          else if (e.key === "ArrowLeft") { e.preventDefault(); focusTab(active - 1); }
          else if (e.key === "Home") { e.preventDefault(); focusTab(0); }
          else if (e.key === "End") { e.preventDefault(); focusTab(tabs.length - 1); }
        }}
      >
        {tabs.map((t, i) => {
          const on = i === active;
          return (
            <button
              key={t.key}
              ref={(el) => { refs.current[i] = el; }}
              type="button"
              role="tab"
              id={`${id}-tab-${i}`}
              aria-selected={on}
              aria-controls={`${id}-panel-${i}`}
              tabIndex={on ? 0 : -1}
              onClick={() => setActiveKey(t.key)}
              className={
                "inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3.5 text-[13px] font-semibold " +
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2 " +
                (on
                  ? "border-navy-900 bg-navy-900 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50")
              }
            >
              {t.label}
              <span
                className={
                  "rounded-full px-2 py-px text-xs font-bold tabular-nums " +
                  (on ? "bg-gold-500 text-navy-950" : "bg-slate-100 text-slate-700")
                }
              >
                {t.count}
              </span>
            </button>
          );
        })}
      </div>
      {panels.map((p, i) => (
        <div
          key={tabs[i]?.key ?? i}
          role="tabpanel"
          id={`${id}-panel-${i}`}
          aria-labelledby={`${id}-tab-${i}`}
          hidden={i !== active}
        >
          {p}
        </div>
      ))}
    </>
  );
}
