import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "./focus";

/**
 * Button — the one button style for the signed-in product.
 *
 * SERVER-SAFE: no state, no "use client". A button inside a server component
 * ships no JavaScript of its own; one inside a client component costs nothing
 * extra.
 *
 * LINKS THAT LOOK LIKE BUTTONS use `buttonVariants()` on a real <Link> / <a>
 * rather than an `asChild` prop. shadcn's asChild needs @radix-ui/react-slot;
 * a function that returns a class string needs nothing, keeps the link a real
 * link (middle-click, open in new tab), and cannot put a <button> inside an <a>.
 *
 *   <Link href="/broker-portal/apply" className={buttonVariants({ size: "lg" })}>New application</Link>
 *
 * Variants: primary = navy (the default, one per view), accent = gold (the
 * single most important action — "Open Marcus", "Apply now"), secondary =
 * white with a border, ghost = no chrome, danger = destructive.
 */

export type ButtonVariant = "primary" | "accent" | "secondary" | "ghost" | "danger";
export type ButtonSize = "xs" | "sm" | "md" | "lg" | "icon" | "icon-sm";

const BASE =
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap font-semibold " +
  "transition-colors motion-reduce:transition-none " +
  "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 " +
  FOCUS_RING;

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-navy-900 text-white hover:bg-navy-800",
  // Navy text on gold: 7.8:1. White on gold would be 2.3:1.
  accent: "bg-gold-500 text-navy-950 hover:bg-gold-400",
  secondary: "border border-slate-200 bg-white text-navy-900 hover:border-slate-300 hover:bg-slate-50",
  ghost: "text-slate-700 hover:bg-slate-100 hover:text-navy-900",
  danger: "border border-red-200 bg-white text-red-700 hover:border-red-300 hover:bg-red-50",
};

const SIZE: Record<ButtonSize, string> = {
  xs: "h-8 rounded-lg px-2.5 text-xs",
  sm: "h-9 rounded-lg px-3 text-[13px]",
  md: "h-10 rounded-lg px-4 text-sm",
  lg: "h-11 rounded-xl px-[18px] text-sm",
  icon: "h-9 w-9 rounded-lg p-0",
  "icon-sm": "h-8 w-8 rounded-lg p-0",
};

export function buttonVariants({
  variant = "primary",
  size = "md",
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}): string {
  return cn(BASE, VARIANT[variant], SIZE[size], className);
}

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, disables the button and tells assistive tech it is busy. */
  loading?: boolean;
  ref?: React.Ref<HTMLButtonElement>;
};

export function Button({
  variant, size, loading = false, className, children, disabled, type = "button", ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonVariants({ variant, size, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
      {children}
    </button>
  );
}
