"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants, type ButtonSize, type ButtonVariant } from "./button";
import { FOCUS_RING } from "./focus";

/**
 * DropdownMenu — a small menu on a native <details>, the same pattern as the
 * work queue's "More" menu (app/crm/dashboard/QueueRowActions.tsx).
 *
 * <details> opens with Enter or Space on its summary, is announced as
 * expandable by every screen reader, and needs no script to exist. The script
 * here only closes it — Escape (focus goes back to the trigger), a click
 * outside, or choosing an item — and renders the contents only while open, so
 * a table of rows each carrying a menu does not carry every menu's markup.
 *
 * Items are real <button>s and checkboxes are real <input type=checkbox>, in
 * the Tab order. That is deliberately NOT the full ARIA `menu` role with
 * arrow-key roving: role=menu promises keyboard behaviour that is easy to get
 * subtly wrong, and plain buttons in a disclosure are what the WAI authoring
 * guide recommends for a site menu like this.
 */

const Ctx = createContext<{ close: (focusTrigger?: boolean) => void } | null>(null);

export function DropdownMenu({
  trigger, label, variant = "secondary", size = "sm", align = "end", className, contentClassName, children,
}: {
  /** The summary's visible content (an icon, a word, or both). */
  trigger: React.ReactNode;
  /** Accessible name when the trigger is an icon, or needs more context. */
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  align?: "start" | "end";
  className?: string;
  contentClassName?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      const el = ref.current;
      if (el?.open && e.target instanceof Node && !el.contains(e.target)) el.open = false;
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  function close(focusTrigger = false) {
    const el = ref.current;
    if (!el) return;
    el.open = false;
    if (focusTrigger) el.querySelector("summary")?.focus();
  }

  return (
    <details
      ref={ref}
      className={cn("group relative inline-block", className)}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      onKeyDown={(e) => {
        if (e.key === "Escape" && ref.current?.open) { e.preventDefault(); e.stopPropagation(); close(true); }
      }}
    >
      <summary
        aria-label={label}
        className={cn(
          buttonVariants({ variant, size }),
          "cursor-pointer list-none group-open:border-navy-900 [&::-webkit-details-marker]:hidden",
        )}
      >
        {trigger}
      </summary>
      {open && (
        <div
          className={cn(
            "absolute top-full z-40 mt-1.5 min-w-[14rem] max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-1.5 text-left shadow-card-hover",
            align === "end" ? "right-0" : "left-0",
            contentClassName,
          )}
        >
          <Ctx.Provider value={{ close }}>{children}</Ctx.Provider>
        </div>
      )}
    </details>
  );
}

const ITEM =
  "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-navy-900 hover:bg-slate-100 " +
  "disabled:pointer-events-none disabled:opacity-50 " +
  FOCUS_RING.replace("focus-visible:ring-offset-2", "focus-visible:ring-offset-0");

export function DropdownMenuItem({
  onSelect, keepOpen = false, className, children, ...props
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onSelect"> & { onSelect?: () => void; keepOpen?: boolean }) {
  const ctx = useContext(Ctx);
  return (
    <button
      type="button"
      className={cn(ITEM, className)}
      onClick={() => { onSelect?.(); if (!keepOpen) ctx?.close(true); }}
      {...props}
    >
      {children}
    </button>
  );
}

/** A toggle that stays open while you tick several (column visibility). */
export function DropdownMenuCheckboxItem({
  checked, onCheckedChange, disabled, children,
}: { checked: boolean; onCheckedChange: (next: boolean) => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <label className={cn(ITEM, "cursor-pointer select-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-gold-700", disabled && "cursor-not-allowed opacity-50")}>
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onCheckedChange(e.target.checked)}
      />
      <span
        aria-hidden="true"
        className={cn(
          "grid h-4 w-4 shrink-0 place-items-center rounded border",
          checked ? "border-navy-900 bg-navy-900 text-white" : "border-slate-400 bg-white",
        )}
      >
        {checked && <Check size={11} strokeWidth={3} />}
      </span>
      {children}
    </label>
  );
}

export function DropdownMenuLabel({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-widest text-slate-500", className)}
      {...props}
    />
  );
}

export function DropdownMenuSeparator() {
  return <div role="separator" className="my-1 border-t border-slate-100" />;
}
