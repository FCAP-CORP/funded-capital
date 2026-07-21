"use client";

import { useState } from "react";
import { FileText, Check, UploadCloud, ShieldCheck, Loader2 } from "lucide-react";
import type { RequiredDoc } from "@/lib/portalData";

/**
 * Document checklist + upload UI.
 * The "upload" is simulated for the prototype. When Supabase Storage is wired
 * in, replace `simulateUpload` with a signed-URL upload to the per-deal bucket.
 */
export default function DealDocuments({ initial }: { initial: RequiredDoc[] }) {
  const [docs, setDocs] = useState<RequiredDoc[]>(initial);
  const [uploading, setUploading] = useState<string | null>(null);

  const received = docs.filter((d) => d.received).length;
  const pct = Math.round((received / docs.length) * 100);

  const simulateUpload = (id: string) => {
    setUploading(id);
    setTimeout(() => {
      setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, received: true } : d)));
      setUploading(null);
    }, 900);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-slate-900">Document Checklist</h2>
          <span className="text-sm text-slate-500">
            {received}/{docs.length} received
          </span>
        </div>
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full bg-gold-500 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <ul className="divide-y divide-slate-100">
        {docs.map((d) => (
          <li key={d.id} className="flex items-center justify-between px-5 py-4">
            <div className="flex items-center gap-3 min-w-0">
              <span
                className={`h-9 w-9 grid place-items-center rounded-lg shrink-0 ${
                  d.received ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"
                }`}
              >
                {d.received ? <Check size={17} /> : <FileText size={17} />}
              </span>
              <div className="min-w-0">
                <p className="font-medium text-slate-900 truncate">{d.label}</p>
                <p className="text-xs text-slate-400">
                  {d.received ? "Received · encrypted" : "Awaiting upload"}
                </p>
              </div>
            </div>

            {d.received ? (
              <span className="text-xs font-semibold text-emerald-600 shrink-0">Done</span>
            ) : uploading === d.id ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 shrink-0">
                <Loader2 size={14} className="animate-spin" /> Uploading…
              </span>
            ) : (
              <button
                onClick={() => simulateUpload(d.id)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-navy-900 border border-slate-300 rounded-lg px-3 py-1.5 hover:border-gold-500 hover:bg-gold-500/10 transition shrink-0"
              >
                <UploadCloud size={14} /> Upload
              </button>
            )}
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-2 px-5 py-3 bg-slate-50 border-t border-slate-100 text-xs text-slate-500">
        <ShieldCheck size={14} className="text-emerald-600" />
        Files are stored encrypted with per-broker access. Only your team and Funded Capital can view them.
      </div>
    </div>
  );
}
