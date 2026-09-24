"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "./focus";

/**
 * Dialog — a modal built on the browser's own <dialog> element.
 *
 * WHY NATIVE. `showModal()` gives, for free and correctly, the three things a
 * hand-built modal usually gets wrong: everything behind it becomes inert (a
 * real focus trap — Tab cannot reach the page underneath, and neither can a
 * screen reader's virtual cursor), Escape closes it, and it sits in the top
 * layer above every z-index on the page. No focus-trap library, no portal.
 *
 * This component adds what the platform does not guarantee everywhere:
 *   - FOCUS ON OPEN goes to the element marked `data-autofocus`, else the
 *     first field, else the first button. Put `data-autofocus` on Cancel for a
 *     consequential action — a reflex Enter must not book revenue (the board's
 *     Funded confirmation has always worked this way).
 *   - FOCUS ON CLOSE returns to whatever opened it, if it is still on the page.
 *   - A click on the backdrop closes it, like every modal people have used.
 *
 * Rendered only while open: a closed dialog is not in the DOM at all.
 * Respects reduced motion (the fade is `motion-safe` only).
 */

export type DialogProps = {
  open: boolean;
  onClose: () => void;
  /** The visible heading, and the dialog's accessible name. */
  title: React.ReactNode;
  /** Keep the title for screen readers but do not draw it (the ⌘K palette). */
  hideTitle?: boolean;
  description?: React.ReactNode;
  children?: React.ReactNode;
  /** Buttons, right-aligned. */
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  /** Show the × in the corner. */
  showClose?: boolean;
  className?: string;
  /** Where on screen: centred, or near the top (search palettes). */
  position?: "center" | "top";
};

export function Dialog(props: DialogProps) {
  if (!props.open) return null;
  return <OpenDialog {...props} />;
}

const WIDTH = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl" } as const;

function OpenDialog({
  onClose, title, hideTitle, description, children, footer, size = "sm", showClose = true, className, position = "center",
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();
  const close = useRef(onClose);
  close.current = onClose;

  // Open ONCE, on mount. Re-running on every render would yank the cursor out
  // of a text field whenever the page behind the dialog refreshes.
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dlg.open) {
      try { dlg.showModal(); } catch { dlg.setAttribute("open", ""); }
    }
    const target =
      dlg.querySelector<HTMLElement>("[data-autofocus]") ??
      dlg.querySelector<HTMLElement>("input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])") ??
      dlg.querySelector<HTMLElement>("button:not([disabled])");
    target?.focus();
    // The page behind must not scroll while the dialog is up (iOS especially).
    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prevOverflow;
      if (dlg.open) dlg.close();
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      // Escape: the browser fires `cancel`. We close through React state so the
      // parent stays the single source of truth for whether this is open.
      onCancel={(e) => { e.preventDefault(); close.current(); }}
      onClick={(e) => { if (e.target === e.currentTarget) close.current(); }}
      className={cn(
        "m-0 max-h-none max-w-none bg-transparent p-4 text-left backdrop:bg-navy-950/50",
        "fixed inset-0 h-full w-full",
        position === "top" ? "flex items-start justify-center pt-[12vh]" : "flex items-center justify-center",
        "motion-safe:backdrop:animate-[fcFade_120ms_ease-out]",
      )}
    >
      <div
        className={cn(
          "relative w-full rounded-2xl bg-white p-5 shadow-2xl",
          WIDTH[size],
          "motion-safe:animate-[fcRise_140ms_ease-out]",
          className,
        )}
      >
        <h2 id={titleId} className={hideTitle ? "sr-only" : "pr-8 text-base font-bold text-navy-900"}>{title}</h2>
        {description && (
          <p id={descId} className="mt-1.5 text-sm text-slate-600">{description}</p>
        )}
        {children}
        {footer && <div className="mt-5 flex flex-wrap justify-end gap-2">{footer}</div>}
        {showClose && (
          <button
            type="button"
            onClick={() => close.current()}
            aria-label="Close"
            className={cn("absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-navy-900", FOCUS_RING)}
          >
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      <style>{`@keyframes fcFade{from{opacity:0}to{opacity:1}}@keyframes fcRise{from{opacity:0;transform:translateY(6px) scale(.985)}to{opacity:1;transform:none}}`}</style>
    </dialog>
  );
}
