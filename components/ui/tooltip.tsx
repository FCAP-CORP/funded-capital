import { cn } from "@/lib/utils";

/**
 * A hint on hover AND on keyboard focus, in CSS alone.
 *
 * Supplementary only: it is `aria-hidden`, because a CSS tooltip cannot wire
 * `aria-describedby` to its trigger without an id from the caller. Anything a
 * screen-reader user needs goes in the trigger's own `aria-label` — which an
 * icon-only button must have anyway.
 */
export function Tooltip({
  content, side = "top", className, children,
}: { content: React.ReactNode; side?: "top" | "bottom"; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("group/tt relative inline-flex", className)}>
      {children}
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute left-1/2 z-50 w-max max-w-[16rem] -translate-x-1/2 rounded-md bg-navy-900 px-2 py-1 text-xs font-medium leading-snug text-white shadow-card-hover",
          "invisible opacity-0 transition-opacity delay-150 group-hover/tt:visible group-hover/tt:opacity-100 group-focus-within/tt:visible group-focus-within/tt:opacity-100",
          "motion-reduce:transition-none",
          side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5",
        )}
      >
        {content}
      </span>
    </span>
  );
}
