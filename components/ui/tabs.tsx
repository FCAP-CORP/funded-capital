"use client";

import { useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "./focus";

/**
 * Tabs — the ARIA tabs pattern, the same one the dashboard's work queue uses
 * (app/crm/dashboard/QueueTabs.tsx), generalised.
 *
 * CLIENT COMPONENT: it holds which tab is showing. Every panel is rendered on
 * the server and arrives in the page; switching is instant, costs no request,
 * and a hidden panel keeps its own state (a half-typed note).
 *
 * Keyboard: one tab in the Tab order (roving tabindex); Left/Right/Home/End
 * move between tabs and select them. The active tab is tracked by KEY, not
 * position, so a tab disappearing after a refresh does not move the selection
 * onto whichever tab slid into its slot.
 */

export type TabItem = { key: string; label: React.ReactNode; count?: number; content: React.ReactNode };

export function Tabs({
  items, label, defaultKey, variant = "pill", className, onChange,
}: {
  items: TabItem[];
  /** Accessible name for the tab list. */
  label: string;
  defaultKey?: string;
  variant?: "pill" | "underline";
  className?: string;
  onChange?: (key: string) => void;
}) {
  const [activeKey, setActiveKey] = useState<string | null>(defaultKey ?? null);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();

  const found = items.findIndex((t) => t.key === activeKey);
  const active = found >= 0 ? found : 0;

  function select(i: number, focus: boolean) {
    const n = items.length;
    if (n === 0) return;
    const next = ((i % n) + n) % n;
    setActiveKey(items[next].key);
    onChange?.(items[next].key);
    if (focus) refs.current[next]?.focus();
  }

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label={label}
        className={cn(
          "flex gap-2 overflow-x-auto [scrollbar-width:thin]",
          variant === "underline" && "gap-5 border-b border-slate-200",
        )}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") { e.preventDefault(); select(active + 1, true); }
          else if (e.key === "ArrowLeft") { e.preventDefault(); select(active - 1, true); }
          else if (e.key === "Home") { e.preventDefault(); select(0, true); }
          else if (e.key === "End") { e.preventDefault(); select(items.length - 1, true); }
        }}
      >
        {items.map((t, i) => {
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
              onClick={() => select(i, false)}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-[13px] font-semibold",
                FOCUS_RING,
                variant === "pill"
                  ? cn(
                      "h-9 rounded-full border px-3.5",
                      on ? "border-navy-900 bg-navy-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
                    )
                  : cn(
                      "-mb-px h-10 border-b-2 px-0.5",
                      on ? "border-gold-500 text-navy-900" : "border-transparent text-slate-600 hover:text-navy-900",
                    ),
              )}
            >
              {t.label}
              {t.count !== undefined && (
                <span
                  className={cn(
                    "rounded-full px-2 py-px text-xs font-bold tabular-nums",
                    on && variant === "pill" ? "bg-gold-500 text-navy-950" : "bg-slate-100 text-slate-700",
                  )}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {items.map((t, i) => (
        <div
          key={t.key}
          role="tabpanel"
          id={`${id}-panel-${i}`}
          aria-labelledby={`${id}-tab-${i}`}
          hidden={i !== active}
          tabIndex={0}
          className={cn("focus:outline-none", FOCUS_RING)}
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}
