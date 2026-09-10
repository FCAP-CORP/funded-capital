"use client";

import { Printer } from "lucide-react";

/**
 * The only interactive element on the documents page.
 * Isolated into its own client component so the statement itself stays a
 * server component and ships no JavaScript.
 */
export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-colors"
    >
      <Printer size={14} />
      Print statement
    </button>
  );
}
