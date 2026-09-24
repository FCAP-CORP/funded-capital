import { cn } from "@/lib/utils";

/**
 * Card — the white panel every section of the portal sits on.
 *
 * Matches the dashboard (rounded-2xl, slate-200 hairline, no shadow): a flat
 * panel reads as a document, a shadowed one as a pop-up, and a screen full of
 * shadows reads as noise. SERVER-SAFE.
 *
 * `as` lets a card be the <section> it usually is, so a heading inside it can
 * label it (`aria-labelledby`) without an extra wrapper div.
 */

/** The class string, for the rare element that cannot be a <Card> (a <details>, a <table> wrapper). */
export const cardClass = "rounded-2xl border border-slate-200 bg-white";

type AsProp = "div" | "section" | "article" | "aside" | "li" | "form";

export function Card({
  as: Tag = "div", className, ...props
}: React.HTMLAttributes<HTMLElement> & { as?: AsProp }) {
  return <Tag className={cn(cardClass, className)} {...(props as React.HTMLAttributes<HTMLElement>)} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 pb-3 pt-5 sm:px-5", className)}
      {...props}
    />
  );
}

export function CardTitle({
  as: Tag = "h2", className, ...props
}: React.HTMLAttributes<HTMLHeadingElement> & { as?: "h2" | "h3" | "h4" | "p" }) {
  return <Tag className={cn("text-lg font-bold text-navy-900", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-[13px] text-slate-600", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-4 pb-5 sm:px-5", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 sm:px-5", className)}
      {...props}
    />
  );
}
