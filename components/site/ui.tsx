import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";

/**
 * Building blocks for the public site ("Ledger"). Server components, zero
 * JavaScript. Pages compose these so spacing, rules and type stay consistent
 * without every page restating them.
 */

export function Eyebrow({ children, onDeep = false }: { children: ReactNode; onDeep?: boolean }) {
  return (
    <p className={`eyebrow ${onDeep ? "eyebrow-on-deep" : ""}`}>
      <span aria-hidden="true" className={`h-px w-8 ${onDeep ? "bg-brass-500" : "bg-brass-700"}`} />
      {children}
    </p>
  );
}

type Tone = "bone" | "linen" | "paper" | "deep" | "deep2";
const TONES: Record<Tone, string> = {
  bone: "bg-bone text-deep",
  linen: "bg-linen text-deep",
  paper: "bg-paper text-deep",
  deep: "bg-deep text-bone on-deep",
  deep2: "bg-deep-2 text-bone on-deep",
};

export function Section({
  children,
  tone = "bone",
  id,
  labelledBy,
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  id?: string;
  labelledBy?: string;
  className?: string;
}) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={`${TONES[tone]} ${className}`}>
      <div className="section-container py-16 lg:py-24">{children}</div>
    </section>
  );
}

export function SectionHead({
  eyebrow,
  title,
  id,
  intro,
  onDeep = false,
  action,
}: {
  eyebrow?: string;
  title: ReactNode;
  id?: string;
  intro?: ReactNode;
  onDeep?: boolean;
  action?: ReactNode;
}) {
  return (
    <div className="mb-10 lg:mb-14 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
      <div className="flex max-w-3xl flex-col gap-4">
        {eyebrow && <Eyebrow onDeep={onDeep}>{eyebrow}</Eyebrow>}
        <h2 id={id} className="text-4xl leading-[1.05] sm:text-5xl lg:text-[56px]">
          {title}
        </h2>
        {intro && (
          <p className={`text-lg leading-relaxed ${onDeep ? "text-[#C9D1DD]" : "text-deep-muted"}`}>{intro}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Ledger({
  rows,
  onDeep = false,
  className = "",
}: {
  rows: { label: string; value: ReactNode }[];
  onDeep?: boolean;
  className?: string;
}) {
  return (
    <dl className={className}>
      {rows.map((r) => (
        <div
          key={r.label}
          className={`flex items-baseline justify-between gap-4 border-b border-dashed py-3.5 last:border-b-0 ${
            onDeep ? "border-bone/20" : "border-rule"
          }`}
        >
          <dt className={`text-[15px] ${onDeep ? "text-[#A9B3C2]" : "text-deep-muted"}`}>{r.label}</dt>
          <dd className="m-0 text-right font-figure text-base">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ArrowLink({ href, children, onDeep = false }: { href: string; children: ReactNode; onDeep?: boolean }) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-2 border-b-2 border-brass-500 pb-1 font-semibold transition-colors ${
        onDeep ? "text-bone hover:text-brass-300" : "text-deep hover:text-brass-700"
      }`}
    >
      {children}
      <ArrowRight size={16} aria-hidden="true" />
    </Link>
  );
}

export function Faq({ items, idPrefix = "faq" }: { items: { q: string; a: string }[]; idPrefix?: string }) {
  return (
    <div className="border-t-2 border-deep">
      {items.map((f, i) => (
        <details key={f.q} className="group border-b border-rule py-5" open={i === 0}>
          <summary
            id={`${idPrefix}-${i}`}
            className="flex cursor-pointer list-none items-start justify-between gap-6 font-headline text-xl font-semibold leading-snug sm:text-2xl [&::-webkit-details-marker]:hidden"
          >
            {f.q}
            <span aria-hidden="true" className="mt-1 font-figure text-lg text-brass-700 group-open:hidden">+</span>
            <span aria-hidden="true" className="mt-1 hidden font-figure text-lg text-brass-700 group-open:inline">−</span>
          </summary>
          <p className="mt-3 max-w-3xl text-[17px] leading-relaxed text-deep-muted">{f.a}</p>
        </details>
      ))}
    </div>
  );
}

/** A closing band for a page: one question, one brass button, the phone. */
export function CtaPanel({ title, body, href = "/apply", label = "Apply now" }: { title: string; body?: string; href?: string; label?: string }) {
  return (
    <section aria-label="Next step" className="bg-deep text-bone on-deep">
      <div className="section-container flex flex-col gap-8 py-16 lg:flex-row lg:items-center lg:justify-between lg:py-20">
        <div className="flex max-w-2xl flex-col gap-3">
          <h2 className="text-4xl leading-tight sm:text-5xl">{title}</h2>
          {body && <p className="text-lg text-[#C9D1DD]">{body}</p>}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link href={href} className="btn-primary text-base">
            {label}
          </Link>
          <Link href="/calculator" className="btn-secondary text-base">
            Price a deal first
          </Link>
        </div>
      </div>
    </section>
  );
}
