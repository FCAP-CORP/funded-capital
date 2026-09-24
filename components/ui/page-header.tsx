import { cn } from "@/lib/utils";

/**
 * Every page's title block: an optional back link or eyebrow, the <h1>, one
 * line saying what the page is for, and the page's actions on the right (on a
 * phone, under the title). Same type scale as the dashboard's greeting.
 */
export function PageHeader({
  title, description, actions, eyebrow, className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** A back link or a small label above the title. */
  eyebrow?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="flex min-w-0 flex-col gap-1">
        {eyebrow && <div className="text-[13px] text-slate-500">{eyebrow}</div>}
        <h1 className="text-2xl font-extrabold tracking-tight text-navy-900 sm:text-[28px] sm:leading-9">{title}</h1>
        {description && <p className="max-w-3xl text-sm text-slate-600">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
