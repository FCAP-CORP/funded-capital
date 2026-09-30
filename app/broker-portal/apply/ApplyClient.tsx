"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Check,
  ArrowRight,
  ArrowLeft,
  Building2,
  User,
  Home,
  Upload,
  FileText,
  Trash2,
  Loader2,
  PartyPopper,
  AlertTriangle,
  Save,
} from "lucide-react";
import {
  RATE_CONFIG, fmtUsd, LOAN_PURPOSE_OPTIONS, isRefiPurpose, MAX_PORTFOLIO_PROPERTIES,
  type ProductKey, type LoanPurpose,
} from "@/lib/pricing";
import { docChecklistFor } from "@/lib/portalData";
import { AUTOSAVE_MS, draftHasContent } from "@/lib/broker/drafts";
import { loadDraftAction, saveDraftAction } from "./draftActions";
import {
  FILES_EMAIL, documentsSummaryLines, heldBackNotice, isTooLarge, missingFiles, overflowNotice, perFileLimit, planUploads, submitLabel,
} from "@/lib/broker/applicationParts";

const steps = [
  { id: 1, label: "Program", icon: Building2 },
  { id: 2, label: "Borrower", icon: User },
  { id: 3, label: "Property", icon: Home },
  { id: 4, label: "Documents", icon: Upload },
  { id: 5, label: "Review", icon: Check },
];

type PropertyRow = {
  address: string; value: string; rehabBudget: string; arv: string;
  sunkCosts: string; estimatedPayoff: string; monthlyRent: string;
  annualTaxes: string; annualInsurance: string; annualHoa: string;
};

const blankRow = (): PropertyRow => ({
  address: "", value: "", rehabBudget: "", arv: "",
  sunkCosts: "", estimatedPayoff: "", monthlyRent: "",
  annualTaxes: "", annualInsurance: "", annualHoa: "",
});

const rowHasContent = (r: PropertyRow) => Object.values(r).some((v) => v.trim() !== "");

const products = Object.values(RATE_CONFIG.products);

interface UploadFile {
  name: string;
  mimeType: string;
  data: string; // base64 (no prefix)
  size: number;
}

/**
 * A file too big for the portal is never read into memory: it will be held
 * back (see applicationParts.ts), so only its name and size are kept.
 */
function readFileAsBase64(file: File): Promise<UploadFile> {
  if (isTooLarge(file.size)) {
    return Promise.resolve({ name: file.name, mimeType: file.type || "application/octet-stream", data: "", size: file.size });
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve({
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        data: (result.split(",")[1] ?? ""),
        size: file.size,
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const fmtSize = (b: number) => (b < 1_000_000 ? `${Math.round(b / 1000)} KB` : `${(b / 1_000_000).toFixed(1)} MB`);

export default function ApplyClient() {
  const [step, setStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<UploadFile[]>([]);
  /** What the submit button says while the application and its files travel. */
  const [progress, setProgress] = useState<string | null>(null);
  /** After submitting: how many files arrived, and the names of any that did not. */
  const [outcome, setOutcome] = useState<{ received: number; missing: string[] }>({ received: 0, missing: [] });

  const [form, setForm] = useState({
    product: "dscr" as ProductKey,
    purpose: "purchase" as LoanPurpose,
    borrower: "",
    entity: "",
    email: "",
    phone: "",
    fico: "",
    loanAmount: "",
    notes: "",
  });

  /**
   * Consent is asked ONCE, so the form has to know whether this broker has
   * already given it. `null` means "not yet known" — the checkbox stays hidden
   * until the server answers, rather than flashing in and out.
   *
   * The wording comes from the server too (lib/consent.ts), so what is shown
   * here and what is stored can never drift apart.
   */
  /**
   * The property schedule. One row is an ordinary deal; more than one is a
   * portfolio. Held as strings because that is what the inputs produce — the
   * server parses once, in lib/broker/record.ts, rather than every layer
   * guessing at number formats.
   */
  const [isPortfolio, setIsPortfolio] = useState(false);
  const [schedule, setSchedule] = useState<PropertyRow[]>([blankRow()]);

  const [consentPrompt, setConsentPrompt] = useState<{ text: string } | null>(null);
  const [smsConsent, setSmsConsent] = useState(false);

  /**
   * SAVE AND RESUME (28 Sep 2026). The form saves itself to the broker's own
   * draft a moment after they stop typing, and `?draft=<id>` in the address
   * bar brings it back — from the dashboard, after a refresh, or on another
   * device. Files are never saved with a draft (the portal is a pipe for
   * files); a resumed draft says to attach them again.
   *
   * ONE SAVE AT A TIME. A save that arrives while another is in flight waits
   * and then sends the LATEST form, so two quick saves can never create two
   * drafts or land out of order. The server checks who owns the draft on
   * every call (lib/broker/drafts.server.ts); the id here is only a handle.
   */
  const params = useSearchParams();
  const [loadingDraft, setLoadingDraft] = useState(() => !!params.get("draft"));
  const [resumed, setResumed] = useState(false);
  const [save, setSave] = useState<{ state: "idle" | "saving" | "saved" | "error"; at?: string; msg?: string }>({ state: "idle" });
  const draftRef = useRef<string | null>(null);
  const inFlight = useRef(false);
  const again = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/broker/consent-status")
      .then((r) => r.json())
      .then((d: { consented?: boolean; text?: string | null }) => {
        if (cancelled) return;
        if (d && d.consented === false && d.text) setConsentPrompt({ text: d.text });
      })
      .catch(() => { /* stay hidden — never show a box we cannot record */ });
    return () => { cancelled = true; };
  }, []);

  // Resume a saved draft named in the address bar.
  useEffect(() => {
    const id = params.get("draft");
    if (!id) return;
    let live = true;
    loadDraftAction(id).then((d) => {
      if (!live) return;
      if (d) {
        setForm(d.data.form);
        setSchedule(d.data.schedule);
        setIsPortfolio(d.data.isPortfolio);
        setStep(d.data.step);
        draftRef.current = d.id;
        setResumed(true);
        setSave({ state: "saved", at: d.savedAt ?? undefined });
      } else {
        window.history.replaceState(null, "", "/broker-portal/apply");
        setSave({ state: "error", msg: "That saved application is no longer available — it may have been submitted or discarded. You can start fresh below." });
      }
      setLoadingDraft(false);
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const latest = useRef({ form, isPortfolio, schedule, step });
  latest.current = { form, isPortfolio, schedule, step };

  async function persist() {
    if (inFlight.current) { again.current = true; return; }
    inFlight.current = true;
    setSave((s) => ({ ...s, state: "saving" }));
    try {
      const r = await saveDraftAction(draftRef.current, latest.current);
      if (r.ok) {
        if (draftRef.current !== r.id) {
          draftRef.current = r.id;
          window.history.replaceState(null, "", `/broker-portal/apply?draft=${r.id}`);
        }
        setSave({ state: "saved", at: r.savedAt });
      } else {
        if (r.gone) draftRef.current = null;
        setSave({ state: "error", msg: r.error });
      }
    } finally {
      inFlight.current = false;
      if (again.current) { again.current = false; void persist(); }
    }
  }

  // Save a moment after the broker stops typing, once there is something worth keeping.
  useEffect(() => {
    if (loadingDraft || submitted || submitting) return;
    if (!draftHasContent({ form, isPortfolio, schedule, step })) return;
    const t = setTimeout(() => { void persist(); }, AUTOSAVE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, schedule, isPortfolio, step, loadingDraft, submitted, submitting]);

  /**
   * The same input means two different things, so it is named for what it is.
   * A purchase is measured against PRICE, a refinance against today's VALUE,
   * and the server files the figure under whichever the purpose says. Asking
   * for "property value / purchase price" left that ambiguous and the deal was
   * measured against the wrong denominator.
   */
  const valueLabel = form.purpose === "purchase" ? "Purchase price" : "As-is value";

  /**
   * WHICH FIELDS A PROPERTY NEEDS depends on the product family and the
   * purpose, exactly as the portfolio pricer already decides it. Copying those
   * rules rather than inventing new ones means a broker is asked for the same
   * things here as on the pricing screen — and that what they type can actually
   * be priced.
   */
  const family = RATE_CONFIG.products[form.product].family;
  const isBridgeFamily = family === "bridge";
  const isGU = form.product === "new_construction";
  const isRefi = isRefiPurpose(form.purpose);

  const budgetLabel = isRefi
    ? (isGU ? "Remaining construction" : "Remaining rehab")
    : (isGU ? "Construction budget" : "Rehab budget");

  const perPropertyValueLabel = isGU ? "Land / purchase" : valueLabel;

  const filled = schedule.filter(rowHasContent);
  const scheduleTotal = filled.reduce((sum, r) => sum + (Number(r.value) || 0), 0);

  const updateRow = (i: number, patch: Partial<PropertyRow>) =>
    setSchedule((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () =>
    setSchedule((rows) => (rows.length >= MAX_PORTFOLIO_PROPERTIES ? rows : [...rows, blankRow()]));
  const removeRow = (i: number) =>
    setSchedule((rows) => (rows.length <= 1 ? rows : rows.filter((_, idx) => idx !== i)));

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const canNext =
    (step === 1 && !!form.product) ||
    (step === 2 && !!form.borrower && !!form.email && !!form.fico) ||
    (step === 3 && !!schedule[0]?.address && !!form.loanAmount && !!schedule[0]?.value) ||
    step === 4 ||
    step === 5;

  const addFiles = async (list: FileList | null) => {
    if (!list) return;
    const read = await Promise.all(Array.from(list).map(readFileAsBase64));
    setFiles((prev) => [...prev, ...read].slice(0, 25));
  };

  const removeFile = (i: number) => setFiles((prev) => prev.filter((_, idx) => idx !== i));

  /**
   * FILES IN PARTS. Vercel refuses a request over 4.5 MB, so the files are
   * packed into requests of about 3 MB (lib/broker/applicationParts.ts). The
   * first rides with the application exactly as before; the rest follow one at
   * a time. A file too big to send on its own is held back, and said so here,
   * before the broker submits.
   */
  const plan = planUploads(files);
  const heldBackNames = plan.heldBack.map((f) => f.name);
  const overflowNames = plan.overflow.map((f) => f.name);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    const product = RATE_CONFIG.products[form.product].label;
    const submissionName = `${form.borrower || "Borrower"} - ${schedule[0]?.address || "Property"} - ${new Date().toLocaleDateString()}`
      .replace(/[\\/:*?"<>|]/g, "-")
      .slice(0, 120);
    const summary = [
      `New broker application`,
      ``,
      `Program: ${product}`,
      `Loan purpose: ${LOAN_PURPOSE_OPTIONS.find((o) => o.key === form.purpose)?.label ?? form.purpose}`,
      `Borrower: ${form.borrower}`,
      `Entity: ${form.entity || "—"}`,
      `Email: ${form.email}`,
      `Phone: ${form.phone || "—"}`,
      `Estimated FICO: ${form.fico}`,
      `Deal type: ${isPortfolio ? `Portfolio (${filled.length} properties)` : "Single property"}`,
      `Property: ${schedule[0]?.address ?? ""}`,
      `Requested loan: ${form.loanAmount ? fmtUsd(+form.loanAmount) : "—"}`,
      `${isPortfolio ? "Total " + valueLabel.toLowerCase() : valueLabel}: ${scheduleTotal ? fmtUsd(scheduleTotal) : "—"}`,
      ...(isPortfolio ? filled.map((r, i) => `  ${i + 1}. ${r.address || "(no address)"} — ${r.value ? fmtUsd(+r.value) : "—"}`) : []),
      ...documentsSummaryLines(plan),
      form.notes ? `\nNotes:\n${form.notes}` : "",
    ].join("\n");

    const total = plan.batches.length;
    setProgress(submitLabel(1, total));
    const wire = (batch: UploadFile[]) => batch.map((f) => ({ name: f.name, mimeType: f.mimeType, data: f.data }));

    try {
      const res = await fetch("/api/submit-application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionName,
          summary,
          application: {
            program: product,
            purpose: form.purpose,
            borrower: form.borrower,
            entity: form.entity,
            email: form.email,
            phone: form.phone,
            fico: form.fico,
            propertyAddress: schedule[0]?.address ?? "",
            loanAmount: form.loanAmount,
            propertyValue: isPortfolio ? String(scheduleTotal || "") : (schedule[0]?.value ?? ""),
            notes: form.notes,
          },
          // The broker's OWN consent. Deliberately outside `application`, which
          // is borrower data forwarded to Drive — this is about the broker.
          smsConsent,
          // The schedule the server actually files. `application` above stays a
          // flat summary because that is what Drive receives.
          properties: filled,
          isPortfolio,
          // Only the first batch rides with the application; the rest follow.
          files: wire(plan.batches[0] ?? []),
          totalFiles: plan.sending,
          // The saved draft, closed and wiped by the server once Drive accepts.
          draftId: draftRef.current ?? undefined,
        }),
      });
      let data: { ok?: boolean; error?: string; folder?: string; applicationId?: string };
      try {
        data = await res.json();
      } catch {
        data = { ok: false, error: `non-JSON response (HTTP ${res.status})` };
      }
      if (data.ok) {
        // The application is in, and the server has closed the saved draft.
        draftRef.current = null;
        setResumed(false);
        setSave({ state: "idle" });
        window.history.replaceState(null, "", "/broker-portal/apply");

        // The rest of the files, one request at a time. A part that fails does
        // not undo the application: its files are listed for the broker to
        // email instead. Without an application id there is nothing to attach
        // them to, so they are listed the same way.
        const delivered = plan.batches.map((_, i) => i === 0);
        let stop = !data.applicationId;
        for (let i = 1; i < total && !stop; i++) {
          setProgress(submitLabel(i + 1, total));
          try {
            const r = await fetch("/api/submit-application", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                part: { applicationId: data.applicationId, index: i + 1, total, firstFolder: data.folder ?? null },
                files: wire(plan.batches[i]),
              }),
            });
            const d = (await r.json().catch(() => ({}))) as { ok?: boolean };
            delivered[i] = d.ok === true;
            // Signed out, or the application is no longer ours to add to: the
            // remaining parts would be refused the same way.
            if (r.status === 401 || r.status === 404) stop = true;
          } catch {
            delivered[i] = false;
          }
        }
        setOutcome({
          received: plan.batches.reduce((n, b, i) => n + (delivered[i] ? b.length : 0), 0),
          missing: missingFiles(plan, delivered).map((f) => f.name),
        });
        setSubmitted(true);
      } else {
        const friendly =
          data.error === "intake_not_configured"
            ? "Submissions aren't connected yet — please contact your account manager."
            : data.error === "files_too_large"
            ? "That is too much to send in one go. Try fewer or smaller files, or shorten the notes."
            : null;
        setError(friendly ?? `Couldn't submit (HTTP ${res.status}): ${data.error ?? "unknown error"}`);
      }
    } catch (err) {
      setError("Network error while submitting: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  };

  if (submitted) {
    return (
      <div className="p-5 sm:p-8 max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-10 text-center">
          <div className="mx-auto h-14 w-14 grid place-items-center rounded-full bg-emerald-50 text-emerald-600 mb-4">
            <PartyPopper size={26} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Application submitted</h1>
          <p className="text-slate-500 mb-6">
            We&apos;ve received the deal for <strong>{form.borrower || "your borrower"}</strong>
            {outcome.received > 0 ? ` with ${outcome.received} document${outcome.received === 1 ? "" : "s"}` : ""}. Our team has
            been notified and will follow up with a preliminary term sheet within 24–48 hours.
          </p>
          {outcome.missing.length > 0 && (
            <div role="alert" className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-left text-sm text-amber-900">
              <p className="flex items-start gap-2 font-medium">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
                {outcome.missing.length === 1 ? "This file did not reach us:" : `These ${outcome.missing.length} files did not reach us:`}
              </p>
              <ul className="mt-2 ml-6 list-disc space-y-0.5 break-words">
                {outcome.missing.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
              <p className="mt-2">
                The application itself is in. Please email {outcome.missing.length === 1 ? "it" : "them"} to{" "}
                <a href={`mailto:${FILES_EMAIL}`} className="font-medium underline">{FILES_EMAIL}</a> with the
                borrower&apos;s name in the subject.
              </p>
            </div>
          )}
          <div className="flex justify-center gap-3">
            <Link href="/broker-portal" className="btn-secondary text-sm px-4 py-2.5">
              Back to Dashboard
            </Link>
            <button
              className="btn-primary text-sm px-4 py-2.5"
              onClick={() => {
                setSubmitted(false);
                setStep(1);
                setFiles([]);
                setOutcome({ received: 0, missing: [] });
                setForm({ ...form, purpose: "purchase", borrower: "", entity: "", email: "", phone: "", fico: "", loanAmount: "", notes: "" });
                setSchedule([blankRow()]);
                setIsPortfolio(false);
                draftRef.current = null;
                setResumed(false);
                setSave({ state: "idle" });
              }}
            >
              Submit Another
            </button>
          </div>
        </div>
      </div>
    );
  }

  const checklist = docChecklistFor(form.product);

  return (
    <div className="p-5 sm:p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">New Application</h1>
      <p className="text-slate-500 text-sm">Five quick steps — submit the deal and upload documents in one go.</p>
      <p role="status" aria-live="polite" className={`mt-1 mb-6 min-h-5 text-xs ${save.state === "error" ? "text-amber-700" : "text-slate-500"}`}>
        {loadingDraft && "Opening your saved application…"}
        {!loadingDraft && save.state === "saving" && "Saving…"}
        {!loadingDraft && save.state === "saved" && (
          <span className="inline-flex items-center gap-1">
            <Save size={13} className="text-emerald-600" aria-hidden="true" />
            Saved{save.at ? ` at ${new Date(save.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}. You can close this page and finish later from your dashboard.
          </span>
        )}
        {!loadingDraft && save.state === "error" && save.msg}
        {!loadingDraft && save.state === "idle" && "Your answers save automatically as you go."}
      </p>

      {/* Stepper */}
      <div className="flex items-center mb-8">
        {steps.map((s, i) => (
          <div key={s.id} className="flex items-center flex-1 last:flex-none">
            <div
              className={`h-9 w-9 rounded-full grid place-items-center text-sm font-semibold shrink-0 ${
                step > s.id ? "bg-emerald-500 text-white" : step === s.id ? "bg-gold-500 text-navy-900" : "bg-slate-200 text-slate-500"
              }`}
            >
              {step > s.id ? <Check size={16} /> : s.id}
            </div>
            {i < steps.length - 1 && <div className={`h-0.5 flex-1 mx-2 ${step > s.id ? "bg-emerald-500" : "bg-slate-200"}`} />}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-5 sm:p-6">
        {step === 1 && (
          <div>
            <h2 className="font-semibold text-slate-900 mb-4">Which program?</h2>
            <div className="grid gap-2">
              {products.map((p) => (
                <button
                  key={p.key}
                  onClick={() => set("product", p.key)}
                  className={`text-left px-4 py-3 rounded-xl border transition ${
                    form.product === p.key ? "border-gold-500 bg-gold-500/10" : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <p className="font-medium text-slate-900">{p.label}</p>
                  <p className="text-xs text-slate-400">{p.termLabel}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-slate-900">Borrower details</h2>
            <TextField label="Borrower name" value={form.borrower} onChange={(v) => set("borrower", v)} />
            <TextField label="Entity / LLC (optional)" value={form.entity} onChange={(v) => set("entity", v)} />
            <div className="grid sm:grid-cols-2 gap-4">
              <TextField label="Email" type="email" value={form.email} onChange={(v) => set("email", v)} />
              <TextField label="Phone (optional)" value={form.phone} onChange={(v) => set("phone", v)} />
            </div>
            <TextField label="Estimated FICO" type="number" value={form.fico} onChange={(v) => set("fico", v)} />

            {consentPrompt && (
              <label className="flex gap-3 items-start rounded-lg border border-slate-200 bg-slate-50 p-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={smsConsent}
                  onChange={(e) => setSmsConsent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-gold-500"
                />
                <span className="text-xs leading-relaxed text-slate-600">
                  {consentPrompt.text}
                </span>
              </label>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-slate-900">Property &amp; loan</h2>

            <div>
              <span className="block text-sm font-medium text-slate-700 mb-1.5">Loan purpose</span>
              <div className="grid grid-cols-3 gap-2">
                {LOAN_PURPOSE_OPTIONS.map((o) => (
                  <button
                    key={o.key}
                    type="button"
                    onClick={() => set("purpose", o.key)}
                    className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                      form.purpose === o.key
                        ? "border-gold-500 bg-gold-500/10 text-navy-900 font-medium"
                        : "border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="block text-sm font-medium text-slate-700 mb-1.5">Deal type</span>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: false, label: "Single property" },
                  { key: true, label: `Portfolio (up to ${MAX_PORTFOLIO_PROPERTIES})` },
                ].map((o) => (
                  <button
                    key={String(o.key)}
                    type="button"
                    onClick={() => setIsPortfolio(o.key)}
                    className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                      isPortfolio === o.key
                        ? "border-gold-500 bg-gold-500/10 text-navy-900 font-medium"
                        : "border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            {/* One loan, however many properties secure it. */}
            <TextField label="Requested loan amount" type="number" prefix="$" value={form.loanAmount} onChange={(v) => set("loanAmount", v)} />

            {schedule.map((row, i) => (
              <div
                key={i}
                className={isPortfolio ? "rounded-xl border border-slate-200 p-4 space-y-3" : "space-y-3"}
              >
                {isPortfolio && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Property {i + 1}
                    </span>
                    {schedule.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRow(i)}
                        className="text-slate-400 hover:text-red-600"
                        aria-label={`Remove property ${i + 1}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                )}

                <TextField label="Property address" value={row.address} onChange={(v) => updateRow(i, { address: v })} />

                {/*
                  Which fields appear follows the portfolio pricer exactly:
                  bridge-family products need budget and ARV, DSCR-family need
                  rent and carrying costs, and a refinance needs the payoff.
                  Asking for anything else is noise a broker has to skip past.
                */}
                {isBridgeFamily ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <TextField label={perPropertyValueLabel} type="number" prefix="$" value={row.value} onChange={(v) => updateRow(i, { value: v })} />
                      <TextField label={budgetLabel} type="number" prefix="$" value={row.rehabBudget} onChange={(v) => updateRow(i, { rehabBudget: v })} />
                      <TextField label="ARV" type="number" prefix="$" value={row.arv} onChange={(v) => updateRow(i, { arv: v })} />
                    </div>
                    {isRefi && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <TextField label="Estimated payoff" type="number" prefix="$" value={row.estimatedPayoff} onChange={(v) => updateRow(i, { estimatedPayoff: v })} />
                        <TextField label="Sunk costs (soft + hard)" type="number" prefix="$" value={row.sunkCosts} onChange={(v) => updateRow(i, { sunkCosts: v })} />
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <TextField label={perPropertyValueLabel} type="number" prefix="$" value={row.value} onChange={(v) => updateRow(i, { value: v })} />
                      <TextField label="Monthly rent" type="number" prefix="$" value={row.monthlyRent} onChange={(v) => updateRow(i, { monthlyRent: v })} />
                      <TextField label="Annual taxes" type="number" prefix="$" value={row.annualTaxes} onChange={(v) => updateRow(i, { annualTaxes: v })} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <TextField label="Annual insurance" type="number" prefix="$" value={row.annualInsurance} onChange={(v) => updateRow(i, { annualInsurance: v })} />
                      <TextField label="Annual HOA" type="number" prefix="$" value={row.annualHoa} onChange={(v) => updateRow(i, { annualHoa: v })} />
                      {isRefi && (
                        <TextField label="Estimated payoff" type="number" prefix="$" value={row.estimatedPayoff} onChange={(v) => updateRow(i, { estimatedPayoff: v })} />
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}

            {isPortfolio && (
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={addRow}
                  disabled={schedule.length >= MAX_PORTFOLIO_PROPERTIES}
                  className="text-sm font-medium text-gold-700 hover:text-gold-600 disabled:text-slate-300 disabled:cursor-not-allowed"
                >
                  + Add property
                  {schedule.length >= MAX_PORTFOLIO_PROPERTIES && ` (max ${MAX_PORTFOLIO_PROPERTIES})`}
                </button>
                <span className="text-sm text-slate-500 tabular-nums">
                  {filled.length} propert{filled.length === 1 ? "y" : "ies"} ·{" "}
                  <span className="font-medium text-navy-900">{scheduleTotal ? fmtUsd(scheduleTotal) : "—"}</span>
                </span>
              </div>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-slate-900">Documents</h2>
            <p className="text-sm text-slate-500">
              Upload what you have — you can also send the rest later. Suggested for {RATE_CONFIG.products[form.product].label}:
            </p>
            {resumed && files.length === 0 && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Files aren&apos;t kept with a saved application, so attach them again here before you submit.
              </p>
            )}
            <ul className="text-xs text-slate-500 grid sm:grid-cols-2 gap-x-4 gap-y-1">
              {checklist.map((d) => (
                <li key={d.id} className="flex gap-1.5">
                  <FileText size={13} className="shrink-0 mt-0.5 text-slate-300" />
                  {d.label}
                </li>
              ))}
            </ul>

            <label className="block cursor-pointer rounded-xl border-2 border-dashed border-slate-300 hover:border-gold-400 hover:bg-gold-500/5 transition p-6 text-center">
              <input type="file" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
              <Upload size={22} className="mx-auto text-slate-400 mb-2" />
              <span className="text-sm font-medium text-slate-700">Click to upload documents</span>
              <span className="block text-xs text-slate-400 mt-1">PDF, images, or Office files — up to 25 files, {perFileLimit} each</span>
            </label>

            {files.length > 0 && (
              <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center justify-between px-3 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText size={15} className="text-slate-400 shrink-0" />
                      <span className="text-sm text-slate-700 truncate">{f.name}</span>
                      <span className="text-xs text-slate-400 shrink-0">{fmtSize(f.size)}</span>
                      {isTooLarge(f.size) && <span className="text-xs font-medium text-amber-700 shrink-0">Too large to upload here</span>}
                    </div>
                    <button onClick={() => removeFile(i)} className="text-slate-400 hover:text-red-600 shrink-0" aria-label="Remove">
                      <Trash2 size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <FileNotices heldBack={heldBackNames} overflow={overflowNames} />
            <TextField label="Notes for underwriting (optional)" value={form.notes} onChange={(v) => set("notes", v)} />
          </div>
        )}

        {step === 5 && (
          <div>
            <h2 className="font-semibold text-slate-900 mb-4">Review &amp; submit</h2>
            <dl className="divide-y divide-slate-100 text-sm">
              <Row k="Program" v={RATE_CONFIG.products[form.product].label} />
              <Row k="Loan purpose" v={LOAN_PURPOSE_OPTIONS.find((o) => o.key === form.purpose)?.label ?? form.purpose} />
              <Row k="Borrower" v={form.borrower || "—"} />
              <Row k="Entity" v={form.entity || "—"} />
              <Row k="Email" v={form.email || "—"} />
              <Row k="Phone" v={form.phone || "—"} />
              <Row k="FICO" v={form.fico || "—"} />
              <Row k="Deal type" v={isPortfolio ? `Portfolio — ${filled.length} propert${filled.length === 1 ? "y" : "ies"}` : "Single property"} />
              <Row k="Property" v={schedule[0]?.address || "—"} />
              <Row k="Loan amount" v={form.loanAmount ? fmtUsd(+form.loanAmount) : "—"} />
              <Row k={isPortfolio ? `Total ${valueLabel.toLowerCase()}` : valueLabel} v={scheduleTotal ? fmtUsd(scheduleTotal) : "—"} />
              <Row k="Documents" v={`${plan.sending} to upload${files.length > plan.sending ? ` (${files.length - plan.sending} to email)` : ""}`} />
            </dl>
            <div className="mt-4">
              <FileNotices heldBack={heldBackNames} overflow={overflowNames} />
            </div>
            {error && (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                {error}
              </div>
            )}
          </div>
        )}

        {/* Nav */}
        <div className="flex items-center justify-between mt-6 pt-5 border-t border-slate-100">
          <button
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1 || submitting}
            className="inline-flex items-center gap-1 text-sm text-slate-500 disabled:opacity-40 hover:text-slate-900"
          >
            <ArrowLeft size={16} /> Back
          </button>
          {step < 5 ? (
            <button
              onClick={() => canNext && setStep((s) => s + 1)}
              disabled={!canNext}
              className="btn-primary text-sm px-5 py-2.5 disabled:opacity-40"
            >
              Continue <ArrowRight size={16} />
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={submitting} className="btn-primary text-sm px-5 py-2.5 disabled:opacity-60">
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> {progress ?? "Submitting…"}
                </>
              ) : (
                <>
                  Submit Application <Check size={16} />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  prefix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  prefix?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
      <div className="relative">
        {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{prefix}</span>}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full rounded-xl border border-slate-300 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-gold-500 transition ${
            prefix ? "pl-7 pr-3" : "px-3"
          }`}
        />
      </div>
    </div>
  );
}

/** The files that will not go through the portal, and what to do about them. */
function FileNotices({ heldBack, overflow }: { heldBack: string[]; overflow: string[] }) {
  if (heldBack.length === 0 && overflow.length === 0) return null;
  return (
    <div className="space-y-2">
      {[heldBackNotice(heldBack), overflowNotice(overflow)].filter(Boolean).map((t, i) => (
        <p key={i} className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
          {t}
        </p>
      ))}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between py-2.5">
      <dt className="text-slate-500">{k}</dt>
      <dd className="font-medium text-slate-900">{v}</dd>
    </div>
  );
}
