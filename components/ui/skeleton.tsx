import { cn } from "@/lib/utils";

/** A grey block the size of what is coming. Decorative; the region around it says "Loading". */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded bg-slate-100 motion-reduce:animate-none", className)} />;
}
