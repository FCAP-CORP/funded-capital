import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Join class names and let the LAST conflicting Tailwind class win.
 *
 * `cn("px-3 bg-white", props.className)` means a caller can pass `bg-slate-50`
 * and actually get it, instead of both classes landing in the markup and the
 * stylesheet's source order deciding. That is what makes the components in
 * components/ui safe to restyle from the outside.
 *
 * tailwind-merge is pinned to the v2 line on purpose: v3 targets Tailwind 4 and
 * mis-reads some Tailwind 3 class names. It is told about the project's own
 * shadow tokens (tailwind.config.ts) so `shadow-card` and `shadow-card-hover`
 * replace each other rather than stacking.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      shadow: [{ shadow: ["card", "card-hover", "gold"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
