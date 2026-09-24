"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import type { CrmRoute } from "../actions";

/**
 * Opening and closing the record card, for one page.
 *
 * THE CARD IS A URL. `?open=<applicationId>` on the page you are already on —
 * so a card can be linked, survives a refresh, and the browser's Back button
 * closes it. The card itself is rendered on the server by RecordCardSlot,
 * inside that page's own <Suspense>; this file only moves the address.
 *
 * WHY THERE IS A SKELETON HERE. Changing the address makes the server render
 * the page again, and React keeps the old screen up until the new one is ready
 * (a transition never hides content that is already showing). Without this, a
 * click would look like nothing happened for a few hundred milliseconds. So the
 * click paints an empty drawer at once, from the browser, and the real card
 * replaces it the moment it arrives.
 *
 * CLOSING. If this page pushed the card onto history, close goes BACK — so
 * Back and the close button do the same thing and history does not fill up
 * with open/close pairs. A card that arrived by link (nothing to go back to
 * inside this page) closes by replacing the address instead.
 */

type Ctx = {
  here: CrmRoute;
  href: (applicationId: string) => string;
  open: (applicationId: string) => void;
  close: () => void;
  /** The drawer reports in, so focus can go back where it came from on close. */
  returnFocus: () => void;
};

const RecordCardContext = createContext<Ctx | null>(null);

export function useRecordCard(): Ctx | null {
  return useContext(RecordCardContext);
}

export function RecordCardProvider({ here, children }: { here: CrmRoute; children: React.ReactNode }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const pushed = useRef(false);
  const opener = useRef<HTMLElement | null>(null);

  const href = useCallback((id: string) => `${here}?open=${encodeURIComponent(id)}`, [here]);

  const open = useCallback(
    (id: string) => {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setPendingId(id);
      start(() => {
        pushed.current = true;
        router.push(href(id), { scroll: false });
      });
    },
    [router, href],
  );

  const close = useCallback(() => {
    if (pushed.current) {
      pushed.current = false;
      router.back();
    } else {
      router.replace(here, { scroll: false });
    }
  }, [router, here]);

  const returnFocus = useCallback(() => {
    const el = opener.current;
    opener.current = null;
    // The opener may have been re-rendered away (a board card that moved
    // column); only return focus to something still on the page.
    if (el && el.isConnected) el.focus({ preventScroll: true });
  }, []);

  const value = useMemo(() => ({ here, href, open, close, returnFocus }), [here, href, open, close, returnFocus]);

  return (
    <RecordCardContext.Provider value={value}>
      {children}
      {pending && pendingId && <DrawerSkeleton />}
    </RecordCardContext.Provider>
  );
}

/**
 * A link to a record card. A real <a href>, so middle-click and "open in new
 * tab" work and it still works before JavaScript has loaded; a plain click is
 * intercepted and opens the card in place without a full page load.
 */
export function RecordLink({
  applicationId, className, children, label,
}: {
  applicationId: string;
  className?: string;
  children: React.ReactNode;
  /** Accessible name when the visible text alone is ambiguous. */
  label?: string;
}) {
  const ctx = useRecordCard();
  const target = ctx ? ctx.href(applicationId) : `?open=${encodeURIComponent(applicationId)}`;
  return (
    <a
      href={target}
      aria-label={label}
      aria-haspopup="dialog"
      className={className}
      onClick={(e) => {
        if (!ctx) return;
        // Let the browser handle new-tab and new-window clicks as normal links.
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        ctx.open(applicationId);
      }}
    >
      {children}
    </a>
  );
}

/** The shape of the drawer, painted instantly while the real one loads. */
function DrawerSkeleton() {
  return (
    <div className="fixed inset-0 z-50" aria-hidden="true">
      <div className="absolute inset-0 bg-navy-950/40" />
      <div className="absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-2xl sm:w-[520px]">
        <div className="border-b border-slate-200 bg-navy-900 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="h-6 w-48 animate-pulse rounded bg-navy-700" />
            <X className="h-5 w-5 text-slate-400" />
          </div>
          <div className="mt-3 flex gap-2">
            <div className="h-5 w-24 animate-pulse rounded-full bg-navy-700" />
            <div className="h-5 w-20 animate-pulse rounded-full bg-navy-700" />
          </div>
        </div>
        <div className="space-y-5 p-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
              <div className="h-16 w-full animate-pulse rounded-lg bg-slate-50" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
