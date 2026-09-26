import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { COMPLIANCE, PROGRAMS } from "@/lib/site/facts";
import { ArrowLink, Eyebrow, Ledger } from "@/components/site/ui";

/**
 * Shared parts for the four loan-program pages and the compare-all page
 * ("Ledger", 25 Sep 2026). Server components, zero client JavaScript.
 */

type Crumb = { label: string; href?: string };

export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="font-figure text-[13px] text-[#A9B3C2]">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {items.map((c, i) => (
          <li key={c.label} className="flex items-center gap-2">
            {i > 0 && <span aria-hidden="true">/</span>}
            {c.href ? (
              <Link href={c.href} className="underline-offset-4 hover:text-bone hover:underline">
                {c.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-brass-300">
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Dark hero for a program page: breadcrumb, h1, tagline, lead, CTAs and a "Program terms" ledger. */
export function ProgramHero({
  crumb,
  eyebrow,
  title,
  tagline,
  lead,
  terms,
  secondary,
}: {
  crumb: string;
  eyebrow: string;
  title: ReactNode;
  tagline?: string;
  lead: ReactNode;
  terms: { label: string; value: ReactNode }[];
  secondary: { href: string; label: string };
}) {
  return (
    <section aria-labelledby="hero-heading" className="bg-deep text-bone on-deep">
      <div className="section-container grid gap-12 py-14 lg:grid-cols-12 lg:gap-6 lg:py-24">
        <div className="flex flex-col gap-6 lg:col-span-7">
          <Breadcrumb
            items={[
              { label: "Home", href: "/" },
              { label: "Loan programs", href: "/loan-programs" },
              { label: crumb },
            ]}
          />
          <Eyebrow onDeep>{eyebrow}</Eyebrow>
          <h1 id="hero-heading" className="text-5xl leading-[0.98] sm:text-6xl lg:text-[80px] lg:tracking-[-0.03em]">
            {title}
          </h1>
          {tagline && (
            <p className="font-headline text-2xl font-medium leading-snug text-brass-300 sm:text-[28px]">{tagline}</p>
          )}
          <p className="max-w-xl text-lg leading-relaxed text-[#C9D1DD]">{lead}</p>
          <div className="mt-1 flex flex-col gap-3 sm:flex-row">
            <Link href="/apply" className="btn-primary text-base sm:text-[17px]">
              Get a term sheet <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <Link href={secondary.href} className="btn-secondary text-base sm:text-[17px]">
              {secondary.label}
            </Link>
          </div>
        </div>

        <aside
          aria-label="Program terms"
          className="self-start border border-bone/20 lg:col-span-5 lg:col-start-8 lg:mt-14"
        >
          <p className="border-b border-bone/20 px-6 py-4 font-figure text-xs tracking-[0.14em] text-brass-300">
            PROGRAM TERMS
          </p>
          <Ledger onDeep className="px-6 py-1" rows={terms} />
          <p className="border-t border-bone/20 px-6 py-4 text-xs leading-relaxed text-[#A9B3C2]">
            Ranges, not quotes. {COMPLIANCE}
          </p>
        </aside>
      </div>
    </section>
  );
}

/** A ruled rate table: 2px deep top rule on the head, 1px rule rows, mono cells. */
export function RateTable({
  caption,
  headers,
  rows,
}: {
  caption: string;
  headers: string[];
  rows: string[][];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-left">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b-2 border-deep">
            {headers.map((h) => (
              <th
                key={h}
                scope="col"
                className="py-3.5 pr-4 font-figure text-xs font-medium uppercase tracking-[0.1em] text-deep-muted"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-[#C9BFAC]">
              {row.map((cell, j) =>
                j === 0 ? (
                  <th key={j} scope="row" className="py-5 pr-4 font-headline text-lg font-semibold sm:text-xl">
                    {cell}
                  </th>
                ) : (
                  <td key={j} className={`py-5 pr-4 font-figure text-[15px] ${j === 2 ? "font-medium text-deep" : "text-deep-muted"}`}>
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Lettered cards for "what decides the loan". */
export function FactorCards({ items }: { items: { title: string; body: string }[] }) {
  return (
    <ol className={`grid gap-6 ${items.length === 4 ? "md:grid-cols-2 lg:grid-cols-4" : "md:grid-cols-3"}`}>
      {items.map((f, i) => (
        <li key={f.title} className="flex flex-col gap-3.5 border border-rule bg-paper p-7 lg:p-8">
          <span className="font-figure text-[13px] text-brass-700" aria-hidden="true">
            {String.fromCharCode(65 + i)}
          </span>
          <h3 className="text-[26px] leading-tight lg:text-[28px]">{f.title}</h3>
          <p className="text-base leading-relaxed text-deep-muted">{f.body}</p>
        </li>
      ))}
    </ol>
  );
}

/** Numbered process list with ruled rows, as in the mockup's draws section. */
export function StepList({ steps }: { steps: { title: string; body: string }[] }) {
  return (
    <ol className="border-b border-rule">
      {steps.map((s, i) => (
        <li key={s.title} className="grid grid-cols-[48px_1fr] gap-2 border-t border-rule py-6 sm:grid-cols-[64px_1fr]">
          <span className="font-figure text-brass-700" aria-hidden="true">
            {String(i + 1).padStart(2, "0")}
          </span>
          <div className="flex flex-col gap-1.5">
            <h3 className="text-xl leading-snug sm:text-2xl">{s.title}</h3>
            <p className="text-[17px] leading-relaxed text-deep-muted">{s.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** The other three programs, as ruled rows with arrow links. */
export function RelatedPrograms({ current }: { current: string }) {
  const others = PROGRAMS.filter((p) => p.slug !== current);
  return (
    <ul className="grid gap-8 md:grid-cols-3 md:gap-6">
      {others.map((p) => (
        <li key={p.slug} className="flex flex-col gap-3 border-t-2 border-deep pt-6">
          <h3 className="text-[28px] leading-tight">{p.name}</h3>
          <p className="text-[17px] text-deep-muted">{p.pitch}</p>
          <p className="font-figure text-sm">{p.figures}</p>
          <div className="mt-2">
            <ArrowLink href={p.href}>{p.name} loans</ArrowLink>
          </div>
        </li>
      ))}
    </ul>
  );
}
