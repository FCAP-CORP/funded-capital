import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { FIELD_FOCUS, FOCUS_RING } from "./focus";

/**
 * Form controls: Label, Input, Textarea, Select, Checkbox.
 *
 * NATIVE ELEMENTS, STYLED. A native <select> is the most accessible dropdown
 * there is, opens the phone's own picker on mobile, and costs zero JavaScript;
 * a custom popover select would cost a library and still be worse on a phone.
 * All of these are SERVER-SAFE and pass every prop through, so `name`,
 * `required`, `aria-*` and form submission behave exactly as a bare element.
 *
 * Placeholder text is slate-500 (4.8:1). The slate-300/400 placeholders used
 * across the older screens are below 3:1 and effectively invisible to anyone
 * with low vision.
 */

const FIELD =
  "w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-navy-900 placeholder:text-slate-500 " +
  "disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-60 " +
  "aria-[invalid=true]:border-red-400 " +
  FIELD_FOCUS;

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("block text-[11px] font-semibold uppercase tracking-wide text-slate-600", className)}
      {...props}
    />
  );
}

export function Input({
  className, inputSize = "md", ref, ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { inputSize?: "sm" | "md"; ref?: React.Ref<HTMLInputElement> }) {
  return <input ref={ref} className={cn(FIELD, inputSize === "sm" ? "h-9" : "h-10", className)} {...props} />;
}

export function Textarea({
  className, ref, ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: React.Ref<HTMLTextAreaElement> }) {
  return <textarea ref={ref} className={cn(FIELD, "min-h-[4.5rem] py-2 leading-relaxed", className)} {...props} />;
}

/**
 * A native select with the chevron drawn by us (the browser's own arrow is
 * removed with `appearance-none` so it looks the same everywhere).
 */
export function Select({
  className, wrapperClassName, selectSize = "md", children, ref, ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  wrapperClassName?: string;
  selectSize?: "sm" | "md";
  ref?: React.Ref<HTMLSelectElement>;
}) {
  return (
    <span className={cn("relative inline-flex w-full", wrapperClassName)}>
      <select
        ref={ref}
        className={cn(FIELD, "appearance-none pr-8", selectSize === "sm" ? "h-9 text-[13px]" : "h-10", className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        size={15}
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500"
      />
    </span>
  );
}

/**
 * A native checkbox in brand colours (`accent-color` does the tick, so it is
 * still the real control — Space toggles it, forms submit it, screen readers
 * announce it). For the "some selected" state, set `.indeterminate` from a ref
 * in the client component that owns it; there is no HTML attribute for it.
 */
export function Checkbox({
  className, ref, ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & { ref?: React.Ref<HTMLInputElement> }) {
  return (
    <input
      ref={ref}
      type="checkbox"
      className={cn(
        "h-4 w-4 shrink-0 cursor-pointer rounded border-slate-400 accent-navy-900 disabled:cursor-not-allowed disabled:opacity-50",
        FOCUS_RING,
        className,
      )}
      {...props}
    />
  );
}
