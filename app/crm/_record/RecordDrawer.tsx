"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { useRecordCard } from "./RecordCardProvider";

/**
 * The drawer the record card lives in: the only part of the card that has to
 * run in the browser for its own sake.
 *
 * Everything inside it is server-rendered HTML passed in as children. This
 * component adds what a dialog needs and HTML alone cannot do:
 *
 * - focus moves to the card's heading when it opens, and goes back to the row
 *   that opened it when it closes;
 * - Tab and Shift+Tab stay inside the card while it is open;
 * - Escape closes it — unless something inside (an open note form) has already
 *   used that Escape, which it signals with preventDefault, or the cursor is in
 *   a text field, where Escape means "undo this edit";
 * - the page behind stops scrolling, so a scroll inside a long card does not
 *   drag the pipeline along underneath it.
 *
 * Full screen on a phone, 520px from the right on anything wider.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function RecordDrawer({
  title, badges, contactLine, children,
}: {
  title: string;
  /** Stage, amount, age — rendered on the server. */
  badges?: React.ReactNode;
  /** Email and phone links under the name. */
  contactLine?: React.ReactNode;
  children: React.ReactNode;
}) {
  const ctx = useRecordCard();
  const headingId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const closeRef = useRef(ctx?.close);
  closeRef.current = ctx?.close;
  const returnRef = useRef(ctx?.returnFocus);
  returnRef.current = ctx?.returnFocus;

  // Once per open: focus in, lock scroll, listen for Escape. Re-running on
  // every server refresh would yank the cursor out of a field mid-sentence.
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });

    const body = document.body;
    const previous = body.style.overflow;
    body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      // Escape inside a text field belongs to the field: the notes editor uses
      // it to throw away an edit, and closing the card on the same keystroke
      // would lose the moment to notice. Leave the field, then Escape closes.
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "TEXTAREA" || (t.tagName === "INPUT" && !["checkbox", "radio", "button", "submit"].includes((t as HTMLInputElement).type)))) return;
      e.preventDefault();
      closeRef.current?.();
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      body.style.overflow = previous;
      returnRef.current?.();
    };
  }, []);

  function trapTab(e: React.KeyboardEvent) {
    if (e.key !== "Tab" || !panel.current) return;
    const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null || el === document.activeElement,
    );
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === heading.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      {/* The backdrop is a mouse convenience; keyboard users have Escape and the button. */}
      <div className="absolute inset-0 bg-navy-950/40" aria-hidden="true" onClick={() => ctx?.close()} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        onKeyDown={trapTab}
        className="absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-2xl sm:w-[520px]"
      >
        <header className="shrink-0 bg-navy-900 px-5 pb-4 pt-4 text-white">
          <div className="flex items-start justify-between gap-3">
            <h2
              id={headingId}
              ref={heading}
              tabIndex={-1}
              className="min-w-0 break-words text-xl font-bold leading-tight focus:outline-none"
            >
              {title}
            </h2>
            <button
              type="button"
              onClick={() => ctx?.close()}
              className="-mr-1 shrink-0 rounded-lg p-1.5 text-slate-300 hover:bg-navy-800 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
              aria-label="Close record"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          {contactLine && <div className="mt-1 text-sm text-slate-300">{contactLine}</div>}
          {badges && <div className="mt-3 flex flex-wrap items-center gap-1.5">{badges}</div>}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>
  );
}
