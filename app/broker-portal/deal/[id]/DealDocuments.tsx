"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, CircleCheck, FileText, Loader2, ShieldCheck, UploadCloud } from "lucide-react";
import {
  BROKER_STATUS_LABEL, MAX_FILE_BYTES, canUploadTo, docSummary, packUploads, type DocStatus,
} from "@/lib/crm/docRequests";

/**
 * The broker's document checklist, one upload per item.
 *
 * Files go browser → /api/broker/documents → Drive intake. Nothing is kept
 * here or in the database except each file's name. Vercel caps a request at
 * 4.5 MB, so a broker's files are packed into as many requests as it takes
 * (packUploads); a single file too big for one request is held back with a
 * plain way round it rather than failing after a long wait.
 */

export type DealRequest = {
  id: string;
  label: string;
  hint: string | null;
  note: string | null;
  status: string;
  reviewNote: string | null;
  receivedAt: string | null;
  files: string[];
};

const TONE: Record<DocStatus, string> = {
  requested: "bg-amber-50 text-amber-800 ring-amber-200",
  received: "bg-blue-50 text-blue-800 ring-blue-200",
  accepted: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  waived: "bg-slate-100 text-slate-600 ring-slate-200",
  removed: "bg-slate-100 text-slate-500 ring-slate-200",
};

const ERRORS: Record<string, string> = {
  not_found: "This deal or item is no longer available to you. Refresh the page.",
  closed: "Funded Capital has just updated this item. Refresh the page to see where it stands.",
  intake_failed: "The upload did not reach us, so nothing was saved. Please try again in a minute.",
  intake_not_configured: "Uploads are unavailable right now. Please email the documents to info@fundedcapital.com.",
  files_too_large: "Those files are too large to send together. Try fewer at a time.",
  too_many_files: "Too many files at once. Try ten or fewer.",
  no_files: "Choose at least one file.",
  unauthorized: "Your session has ended. Sign in again, then retry.",
};

const mb = (b: number) => `${(b / 1_000_000).toFixed(1)} MB`;

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",", 2)[1] ?? "");
    r.onerror = () => reject(r.error ?? new Error("read failed"));
    r.readAsDataURL(file);
  });
}

export default function DealDocuments({
  applicationId, requests, canUpload,
}: {
  applicationId: string;
  requests: DealRequest[];
  canUpload: boolean;
}) {
  const sum = docSummary(requests);
  const pct = sum.total === 0 ? 0 : Math.round((sum.done / sum.total) * 100);

  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-semibold text-navy-900">Documents we need</p>
          <p className="text-sm text-slate-600">
            {sum.done} of {sum.total} complete{sum.review > 0 ? ` · ${sum.review} with us for review` : ""}
          </p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Documents complete">
          <div className="h-full rounded-full bg-gold-500" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
          <ShieldCheck size={13} className="text-emerald-600" aria-hidden="true" />
          Files go straight to Funded Capital&rsquo;s secure intake. This portal does not keep copies.
        </p>
      </div>
      <ul className="divide-y divide-slate-100">
        {requests.map((r) => <Item key={r.id} applicationId={applicationId} r={r} canUpload={canUpload} />)}
      </ul>
    </div>
  );
}

function Item({ applicationId, r, canUpload }: { applicationId: string; r: DealRequest; canUpload: boolean }) {
  const router = useRouter();
  const ids = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [chosen, setChosen] = useState<File[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const status = (r.status in TONE ? r.status : "requested") as DocStatus;
  const open = canUpload && canUploadTo(status);
  const { batches, tooBig } = packUploads(chosen);

  const upload = () =>
    start(async () => {
      setMessage(null);
      let sent = 0;
      const total = batches.reduce((n, b) => n + b.length, 0);
      for (const batch of batches) {
        setProgress(`Uploading ${sent + 1}${batch.length > 1 ? `–${sent + batch.length}` : ""} of ${total}…`);
        let error = "intake_failed";
        try {
          const files = await Promise.all(batch.map(async (f) => ({ name: f.name, mimeType: f.type || "application/octet-stream", data: await toBase64(f) })));
          const res = await fetch("/api/broker/documents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ applicationId, requestId: r.id, files }),
          });
          const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
          if (res.ok && data.ok) {
            sent += batch.length;
            continue;
          }
          error = data.error ?? (res.status === 413 ? "files_too_large" : "intake_failed");
        } catch {
          error = "intake_failed";
        }
        setProgress(null);
        setMessage({ ok: false, text: `${sent > 0 ? `${sent} of ${total} files uploaded. ` : ""}${ERRORS[error] ?? ERRORS.intake_failed}` });
        if (sent > 0) router.refresh();
        return;
      }
      setProgress(null);
      setChosen([]);
      if (inputRef.current) inputRef.current.value = "";
      setMessage({ ok: true, text: `Received — ${sent} ${sent === 1 ? "file" : "files"}. We will review and let you know if anything else is needed.` });
      router.refresh();
    });

  return (
    <li className="px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${status === "accepted" || status === "waived" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
            {status === "accepted" || status === "waived" ? <Check size={14} aria-hidden="true" /> : <FileText size={13} aria-hidden="true" />}
          </span>
          <div className="min-w-0">
            <p className={`text-sm font-semibold ${status === "waived" ? "text-slate-400 line-through" : "text-navy-900"}`}>{r.label}</p>
            {r.hint && status !== "waived" && <p className="mt-0.5 text-[13px] text-slate-600">{r.hint}</p>}
            {r.note && <p className="mt-0.5 text-[13px] text-slate-700">{r.note}</p>}
            {r.reviewNote && (
              <p className="mt-1 flex items-start gap-1.5 text-[13px] font-medium text-amber-800">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" /> Needs another copy: {r.reviewNote}
              </p>
            )}
            {r.files.length > 0 && (
              <p className="mt-1 text-xs text-slate-500">
                Sent: {r.files.join(", ")}
              </p>
            )}
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${TONE[status]}`}>
          {BROKER_STATUS_LABEL[status]}
        </span>
      </div>

      {open && (
        <div className="mt-3 pl-9">
          <label htmlFor={`${ids}-f`} className="sr-only">Choose files for {r.label}</label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              id={`${ids}-f`}
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.heic,.doc,.docx,.xls,.xlsx,.csv"
              disabled={pending}
              onChange={(e) => { setMessage(null); setChosen(Array.from(e.target.files ?? [])); }}
              className="block w-full min-w-0 text-sm text-slate-600 sm:w-auto file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-navy-900 hover:file:bg-slate-200"
            />
            <button
              type="button"
              onClick={upload}
              disabled={pending || batches.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40"
            >
              {pending ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <UploadCloud size={15} aria-hidden="true" />}
              {status === "received" ? "Add more" : "Upload"}
            </button>
          </div>
          {tooBig.length > 0 && (
            <p className="mt-2 text-[13px] text-amber-800" role="alert">
              {tooBig.map((f) => `${f.name} (${mb(f.size)})`).join(", ")} {tooBig.length === 1 ? "is" : "are"} over the {mb(MAX_FILE_BYTES)} limit for one file here.
              {" "}Split or compress {tooBig.length === 1 ? "it" : "them"}, or email {tooBig.length === 1 ? "it" : "them"} to info@fundedcapital.com with the borrower&rsquo;s name in the subject.
            </p>
          )}
          <p aria-live="polite" className="mt-2 text-[13px]">
            {progress && <span className="text-slate-600">{progress}</span>}
            {!progress && message && (
              <span className={`inline-flex items-start gap-1.5 ${message.ok ? "text-emerald-700" : "text-red-700"}`}>
                {message.ok ? <CircleCheck size={14} className="mt-0.5 shrink-0" aria-hidden="true" /> : <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />}
                {message.text}
              </span>
            )}
          </p>
        </div>
      )}
    </li>
  );
}
