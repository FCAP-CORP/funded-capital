import { cn } from "@/lib/utils";
import { STAGE_LABEL, label, stageTone, type Tone } from "@/lib/crm/view";

/**
 * Badge (a.k.a. pill) — a short status word.
 *
 * NEVER COLOUR ALONE. A badge always carries its word, so "Closed — Lost" is
 * still obvious in greyscale or to a screen reader; the tone only speeds up a
 * scan. Every tone pairs a 50-level fill with an 800-level text (7:1 or better).
 * Gold is the exception: gold TEXT fails contrast at this size, so the gold
 * tone is navy text on a pale gold fill with a gold ring.
 *
 * SERVER-SAFE.
 */

export type BadgeTone = Tone;

const TONE: Record<BadgeTone, string> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  navy: "bg-navy-900 text-white ring-navy-900",
  gold: "bg-gold-400/15 text-navy-900 ring-gold-500/60",
  info: "bg-sky-50 text-sky-800 ring-sky-200",
  success: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  warning: "bg-amber-50 text-amber-800 ring-amber-200",
  danger: "bg-red-50 text-red-700 ring-red-200",
  muted: "bg-white text-slate-600 ring-slate-200",
};

export function Badge({
  tone = "neutral", size = "sm", className, ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone; size?: "xs" | "sm" }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 truncate rounded-full font-semibold ring-1 ring-inset",
        size === "xs" ? "px-1.5 py-px text-[10px] uppercase tracking-wide" : "px-2 py-0.5 text-[11px]",
        TONE[tone],
        className,
      )}
      {...props}
    />
  );
}

/** A deal's stage, labelled and toned from lib/crm/view.ts so every screen agrees. */
export function StageBadge({ stage, className }: { stage: string; className?: string }) {
  return (
    <Badge tone={stageTone(stage)} className={className}>
      {label(STAGE_LABEL, stage)}
    </Badge>
  );
}
