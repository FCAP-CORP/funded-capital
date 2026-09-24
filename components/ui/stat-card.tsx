import { cn } from "@/lib/utils";
import { cardClass } from "./card";

/**
 * One number with its label and a line of context — the dashboard's KPI card,
 * exactly, so the Pipeline strip and the dashboard strip are the same object.
 * `warn` turns the context line amber (amber-700: 5:1 on white).
 */
export function StatCard({
  title, value, sub, tone = "default", className,
}: {
  title: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "default" | "warn";
  className?: string;
}) {
  const long = typeof value === "string" && value.length > 8;
  return (
    <div className={cn(cardClass, "flex min-w-0 flex-col gap-2 p-4 sm:gap-2.5 sm:p-5", className)}>
      <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500 sm:text-xs">{title}</p>
      <p
        className={cn(
          "font-extrabold tracking-tight text-navy-900 tabular-nums",
          // A long figure ("$16,938,140") steps down a size instead of running
          // out of a half-width card on a phone or a five-across strip.
          long ? "text-xl sm:text-2xl" : "text-2xl sm:text-[30px] sm:leading-9",
        )}
      >
        {value}
      </p>
      {sub !== undefined && (
        <p className={cn("text-[13px]", tone === "warn" ? "font-semibold text-amber-700" : "text-slate-600")}>{sub}</p>
      )}
    </div>
  );
}
