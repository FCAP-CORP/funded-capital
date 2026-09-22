"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
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
} from "lucide-react";
import {
  RATE_CONFIG, fmtUsd, LOAN_PURPOSE_OPTIONS, isRefiPurpose, MAX_PORTFOLIO_PROPERTIES,
  type ProductKey, type LoanPurpose,
} from "@/lib/pricing";
import { docChecklistFor } from "@/lib/portalData";

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

function readFileAsBase64(file: File): Promise<UploadFile> {
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
      `Documents attached: ${files.length}`,
      form.notes ? `\nNotes:\n${form.notes}` : "",
    ].join("\n");

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
          files: files.map((f) => ({ name: f.name, mimeType: f.mimeType, data: f.data })),
        }),
      });
      let data: { ok?: boolean; error?: string };
      try {
        data = await res.json();
      } catch {
        data = { ok: false, error: `non-JSON response (HTTP ${res.status})` };
      }
      if (data.ok) {
        setSubmitted(true);
      } else {
        const friendly =
          data.error === "intake_not_configured"
            ? "Submissions aren't connected yet — please contact your account manager."
            : data.error === "files_too_large"
            ? "Those files are too large to send at once. Try fewer or smaller files."
            : null;
        setError(friendly ?? `Couldn't submit (HTTP ${res.status}): ${data.error ?? "unknown error"}`);
      }
    } catch (err) {
      setError("Network error while submitting: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSubmitting(false);
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
            {files.length > 0 ? ` with ${files.length} document${files.length === 1 ? "" : "s"}` : ""}. Our team has
            been notified and will follow up with a preliminary term sheet within 24–48 hours.
          </p>
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
                setForm({ ...form, purpose: "purchase", borrower: "", entity: "", email: "", phone: "", fico: "", loanAmount: "", notes: "" });
                setSchedule([blankRow()]);
                setIsPortfolio(false);
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
      <p className="text-slate-500 text-sm mb-6">Five quick steps — submit the deal and upload documents in one go.</p>

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
              <span className="block text-xs text-slate-400 mt-1">PDF, images, or Office files — up to 25 files</span>
            </label>

            {files.length > 0 && (
              <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center justify-between px-3 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText size={15} className="text-slate-400 shrink-0" />
                      <span className="text-sm text-slate-700 truncate">{f.name}</span>
                      <span className="text-xs text-slate-400 shrink-0">{fmtSize(f.size)}</span>
                    </div>
                    <button onClick={() => removeFile(i)} className="text-slate-400 hover:text-red-600 shrink-0" aria-label="Remove">
                      <Trash2 size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
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
              <Row k="Documents" v={`${files.length} attached`} />
            </dl>
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
                  <Loader2 size={16} className="animate-spin" /> Submitting…
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

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between py-2.5">
      <dt className="text-slate-500">{k}</dt>
      <dd className="font-medium text-slate-900">{v}</dd>
    </div>
  );
}
