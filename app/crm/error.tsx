"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

/**
 * What a Lending OS page shows when something on it fails to load, instead of
 * Next's blank "Application error" screen. The sidebar (the CRM layout) stays,
 * so Luis is never stranded: a plain sentence, Try again, and Reload.
 *
 * The technical detail goes to the browser console and Vercel's logs, never on
 * screen — it means nothing to the reader and can carry query text.
 */
export default function CrmError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[crm] page error", error);
  }, [error]);

  return (
    <div role="alert" className="mx-auto mt-16 max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
      <AlertTriangle className="mx-auto mb-3 text-gold-600" size={28} aria-hidden="true" />
      <h1 className="text-base font-semibold text-navy-900">This page didn&apos;t load</h1>
      <p className="mt-2 text-sm text-slate-600">
        Nothing you saved is lost. This is usually a dropped connection or the site having just been updated.
      </p>
      <div className="mt-5 flex justify-center gap-2">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-navy-900 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-navy-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
        >
          <RotateCw size={14} aria-hidden="true" /> Reload the page
        </button>
      </div>
      {error.digest && <p className="mt-4 text-[11px] text-slate-400">Reference: {error.digest}</p>}
    </div>
  );
}
