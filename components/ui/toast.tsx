"use client";

import { useEffect, useSyncExternalStore } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
// clsx, not cn(): this file is in every signed-in page's first load, and cn()
// brings tailwind-merge (~7 KB gzipped) with it. Nothing here needs merging —
// no caller passes classes in to override ours.
import { clsx as cn } from "clsx";
import { FOCUS_RING } from "./focus";

/**
 * Toasts — "Moved 6 deals to Underwriting", "2 were not moved: …".
 *
 * OUR OWN, ~1 KB, NOT `sonner` (~5 KB gzipped). Sonner's extras — swipe to
 * dismiss, stacking animations, promise toasts, theming — are for consumer
 * apps; this portal needs a line of feedback after a bulk action. The store is
 * a module-level array and a Set of listeners read through
 * useSyncExternalStore, so `toast.success()` can be called from any client
 * code, including after an await, with no provider to thread through.
 *
 * ACCESSIBLE: the region is a polite live region, so a confirmation is read
 * out without interrupting; an error is `role="alert"` and interrupts, because
 * a failed write the person does not hear about is a deal they believe moved.
 * Errors stay until dismissed (or 10 s); confirmations leave after 5 s.
 * Nothing animates under `prefers-reduced-motion`.
 *
 * Mounted once, in components/workspace/WorkspaceShell.tsx.
 */

export type ToastTone = "success" | "error" | "info";
type ToastItem = { id: number; tone: ToastTone; title: string; description?: string };

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const EMPTY: ToastItem[] = [];

function emit() { for (const l of listeners) l(); }

function push(tone: ToastTone, title: string, description?: string): number {
  const id = nextId++;
  // Newest first, and never more than four on screen.
  items = [{ id, tone, title, description }, ...items].slice(0, 4);
  emit();
  return id;
}

export const toast = {
  success: (title: string, description?: string) => push("success", title, description),
  error: (title: string, description?: string) => push("error", title, description),
  info: (title: string, description?: string) => push("info", title, description),
  dismiss(id: number) {
    items = items.filter((t) => t.id !== id);
    emit();
  },
};

function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

const ICON = { success: CheckCircle2, error: AlertTriangle, info: Info } as const;
const TONE = {
  success: "text-emerald-700",
  error: "text-red-700",
  info: "text-navy-900",
} as const;

export function Toaster() {
  const list = useSyncExternalStore(subscribe, () => items, () => EMPTY);
  return (
    <>
    {/* Outside the live region, so a screen reader's view of it is only the messages. */}
    <style>{`@keyframes fcToastIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>
    <div
      aria-live="polite"
      aria-relevant="additions"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:items-end"
    >
      {list.map((t) => <ToastCard key={t.id} t={t} />)}
    </div>
    </>
  );
}

function ToastCard({ t }: { t: ToastItem }) {
  useEffect(() => {
    const ms = t.tone === "error" ? 10_000 : 5_000;
    const timer = setTimeout(() => toast.dismiss(t.id), ms);
    return () => clearTimeout(timer);
  }, [t.id, t.tone]);
  const Icon = ICON[t.tone];
  return (
    <div
      role={t.tone === "error" ? "alert" : "status"}
      className={cn(
        "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-card-hover",
        "motion-safe:animate-[fcToastIn_160ms_ease-out]",
        t.tone === "error" && "border-red-200",
      )}
    >
      <Icon size={18} className={cn("mt-0.5 shrink-0", TONE[t.tone])} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-navy-900">{t.title}</p>
        {t.description && <p className="mt-0.5 whitespace-pre-line break-words text-[13px] text-slate-600">{t.description}</p>}
      </div>
      <button
        type="button"
        onClick={() => toast.dismiss(t.id)}
        aria-label="Dismiss"
        className={cn("-m-1 grid h-7 w-7 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-navy-900", FOCUS_RING)}
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
