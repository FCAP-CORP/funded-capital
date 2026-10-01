"use client";

import { useState, useTransition } from "react";
import { Archive } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { safeCall } from "@/lib/crm/safeCall";
import { closeNotOurProduct } from "../actions";

/**
 * "Close N as lost" over the dashboard's "No movement" list (1 Oct 2026), for
 * deals whose Program says "Not our product" and that never reached a term
 * sheet. They can't go into nurture and nobody is working them; closing them
 * is what takes them off the list.
 *
 * Asks first, with the names, because twenty deals at once is not a click to
 * make by accident — and the label on old files may be wrong. Cancel has focus.
 * The server re-checks every deal (closableAsNotOurProduct) before moving it.
 * guards.regress.ts §8: the call passes HERE.
 */
const HERE = "/crm/dashboard" as const;

export function CloseNotOurProductButton({ deals }: { deals: { applicationId: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const n = deals.length;
  if (n === 0) return null;

  function confirm() {
    const ids = deals.map((d) => d.applicationId);
    start(async () => {
      const res = await safeCall(() => closeNotOurProduct(ids, HERE));
      if (res.ok) {
        toast.success(res.message, "Reopen any of them from its card if it turns out to be a real deal.");
        setOpen(false);
      } else {
        toast.error("Nothing closed", (res as { error?: string }).error);
      }
    });
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)} className="gap-1.5">
        <Archive size={14} aria-hidden="true" />
        Close {n} as lost
      </Button>
      <Dialog
        open={open}
        onClose={() => { if (!pending) setOpen(false); }}
        size="md"
        title={`Close ${n} ${n === 1 ? "deal" : "deals"} as lost?`}
        description={`${n === 1 ? "It is" : "These are"} marked "Not our product" and never reached a term sheet. ${n === 1 ? "It moves" : "They move"} to Closed – Lost with the reason "Not our product" and leave this list.`}
        footer={
          <>
            <Button variant="secondary" data-autofocus onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            <Button onClick={confirm} loading={pending}>Close {n} as lost</Button>
          </>
        }
      >
        <ul className="max-h-56 overflow-y-auto rounded-lg border border-slate-200 text-sm">
          {deals.map((d) => (
            <li key={d.applicationId} className="border-t border-slate-100 px-3 py-1.5 text-navy-900 first:border-t-0">{d.name}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-slate-600">
          Not sure about one? Cancel, open its card and check the Program first. If a broker sent any of these,
          they get the usual email that the file was closed. You can reopen a deal from its card at any time.
        </p>
      </Dialog>
    </>
  );
}
