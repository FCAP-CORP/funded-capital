import type { ReactNode } from "react";

/**
 * Shared presentation primitives for the participant portal.
 *
 * The visual language is deliberately more restrained than the broker portal:
 * hairline rules instead of drop shadows, tighter radii, uppercase tracked
 * micro-labels, and tabular figures throughout so columns of money align.
 * All server components — none of this ships JavaScript.
 */

export function PageHeader({
  eyebrow,
  title,
  meta,
  actions,
}: {
  eyebrow?: string;
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="border-b border-slate-200 pb-6 mb-8">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          {eyebrow && (
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-600 mb-2">
              {eyebrow}
            </p>
          )}
          <h1 className="text-2xl sm:text-[28px] font-bold tracking-tight text-ink">{title}</h1>
          {meta && <div className="mt-2 text-sm text-slate-500">{meta}</div>}
        </div>
        {actions && <div className="flex items-center gap-3 shrink-0">{actions}</div>}
      </div>
    </header>
  );
}

/** A headline figure. `emphasis` renders it on the document navy. */
export function Figure({
  label,
  value,
  note,
  emphasis = false,
}: {
  label: string;
  value: string;
  note?: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-5 ${
        emphasis ? "bg-ink border-ink text-white" : "bg-white border-slate-200"
      }`}
    >
      <p
        className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
          emphasis ? "text-gold-500" : "text-slate-500"
        }`}
      >
        {label}
      </p>
      <p
        className={`mt-2 text-[26px] leading-none font-bold tabular-nums tracking-tight ${
          emphasis ? "text-white" : "text-ink"
        }`}
      >
        {value}
      </p>
      {note && (
        <p className={`mt-2 text-xs ${emphasis ? "text-slate-400" : "text-slate-500"}`}>{note}</p>
      )}
    </div>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  flush = false,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  /** Set when the body is a full-bleed table that supplies its own padding. */
  flush?: boolean;
}) {
  return (
    <section className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-100">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-ink">{title}</h2>
          {description && <p className="mt-1 text-xs text-slate-500">{description}</p>}
        </div>
        {actions}
      </div>
      <div className={flush ? "" : "px-5 py-4"}>{children}</div>
    </section>
  );
}

/** Label/value pair for definition-style detail blocks. */
export function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-3 border-b border-slate-100 last:border-0">
      <dt className="text-sm text-slate-500 shrink-0">{label}</dt>
      <dd
        className={`text-sm font-semibold text-ink text-right ${
          mono ? "tabular-nums" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

export function StatusPill({ label, className }: { label: string; className: string }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold ring-1 ring-inset ${className}`}
    >
      {label}
    </span>
  );
}

/** Horizontal meter for term progress. Presentational only. */
export function Meter({ fraction, label }: { fraction: number; label: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
  return (
    <div>
      <div
        className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden"
        role="img"
        aria-label={`${label}: ${pct}% elapsed`}
      >
        <div className="h-full rounded-full bg-gold-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Notice({
  tone = "neutral",
  title,
  children,
}: {
  tone?: "neutral" | "warning";
  title: string;
  children: ReactNode;
}) {
  const tones = {
    neutral: "bg-slate-50 border-slate-200 text-slate-600",
    warning: "bg-amber-50 border-amber-200 text-amber-800",
  } as const;
  return (
    <div className={`rounded-lg border p-5 ${tones[tone]}`}>
      <p className="text-sm font-bold text-ink mb-1">{title}</p>
      <div className="text-sm leading-relaxed">{children}</div>
    </div>
  );
}

/**
 * The standing disclaimer. Program rules require it on participant-facing
 * material, and the wording avoids every prohibited term.
 */
export function ProgramDisclaimer() {
  return (
    <p className="mt-10 pt-6 border-t border-slate-200 text-[11px] leading-relaxed text-slate-400">
      This portal reflects the terms of your Revenue Share Participation Agreement with
      Funded Capital, LLC. It is provided for your reference only and does not modify that
      agreement, which governs in the event of any discrepancy. This is not a securities
      offering. Figures shown reflect amounts recorded as of the last update to program
      records. Questions:{" "}
      <a href="mailto:info@fundedcapital.com" className="text-slate-500 hover:text-gold-600 underline">
        info@fundedcapital.com
      </a>
      .
    </p>
  );
}

/**
 * Shown when a signed-in user has no matching participation record, or when
 * program records cannot be reached. Deliberately never says whether the
 * email exists in the sheet.
 */
export function PortalMessage({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="p-5 sm:p-10 max-w-2xl mx-auto">
      <div className="bg-white rounded-lg border border-slate-200 p-8 text-center">
        <h1 className="text-lg font-bold text-ink">{title}</h1>
        <div className="mt-3 text-sm text-slate-500 leading-relaxed">{children}</div>
      </div>
    </div>
  );
}
