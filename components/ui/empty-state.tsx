import { cn } from "@/lib/utils";

/**
 * What a list says when there is nothing in it. It says WHY and WHAT NEXT —
 * "No firms yet. Add the first one above" — never a bare "No data".
 */
export function EmptyState({
  icon: Icon, title, description, action, className, compact = false,
}: {
  icon?: React.ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean | "true" }>;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center text-center",
        compact ? "gap-1.5 px-4 py-6" : "gap-2 px-6 py-10",
        className,
      )}
    >
      {Icon && (
        <span className="mb-1 grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-slate-600">
          <Icon size={20} aria-hidden="true" />
        </span>
      )}
      <p className="text-sm font-semibold text-navy-900">{title}</p>
      {description && <p className="max-w-md text-sm text-slate-600">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
