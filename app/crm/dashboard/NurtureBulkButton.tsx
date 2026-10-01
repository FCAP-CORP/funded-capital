"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Send } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { safeCall } from "@/lib/crm/safeCall";
import { addToNurture } from "../actions";

/**
 * "Add N to nurture" over the dashboard's "No movement" list (1 Oct 2026).
 *
 * Luis had 77 deals there and no way to act on them in bulk. This sends the
 * people who qualify into the nurture programme that fits each one. The server
 * re-reads and re-decides every person (enrollBestFit); the ids are all this
 * sends. guards.regress.ts §8: the call passes HERE.
 *
 * It asks first, and the question says the three things that decide when an
 * email actually goes: they are queued, released on weekday mornings within
 * the warm-up limit, and only while that programme's emails are on.
 */
const HERE = "/crm/dashboard" as const;

export type NurtureGroup = { program: string; name: string; count: number; emailsOn: boolean };

export function NurtureBulkButton({ contactIds, groups }: { contactIds: string[]; groups: NurtureGroup[] }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const n = contactIds.length;
  if (n === 0) return null;
  const off = groups.filter((g) => !g.emailsOn);

  function confirm() {
    start(async () => {
      const res = await safeCall(() => addToNurture(contactIds, HERE));
      if (res.ok) {
        toast.success(res.message, "They're queued. Emails go out on weekday mornings while each programme's emails are on.");
        setOpen(false);
      } else {
        toast.error("Not added", (res as { error?: string }).error);
      }
    });
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)} className="gap-1.5">
        <Send size={14} aria-hidden="true" />
        Add {n} to nurture
      </Button>
      <Dialog
        open={open}
        onClose={() => { if (!pending) setOpen(false); }}
        title={`Add ${n} ${n === 1 ? "person" : "people"} to nurture?`}
        description="Each goes into the one programme that fits them. Anyone who got in touch or moved forward since this page loaded is skipped."
        footer={
          <>
            <Button variant="secondary" data-autofocus onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            <Button onClick={confirm} loading={pending}>Add {n} to nurture</Button>
          </>
        }
      >
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
          {groups.map((g) => (
            <li key={g.program} className="flex items-start justify-between gap-3 px-3 py-2.5">
              <span className="min-w-0">
                <span className="font-semibold text-navy-900">{g.name}</span>
                <span className={`block text-xs ${g.emailsOn ? "text-slate-500" : "font-medium text-amber-800"}`}>
                  {g.emailsOn ? "Emails are on" : "Emails are off: they wait in the queue until you turn them on"}
                </span>
              </span>
              <span className="shrink-0 tabular-nums font-semibold text-navy-900">{g.count}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-slate-600">
          They are queued, not emailed now. The warm-up sends on weekday mornings (9:30 to noon New York time), starting at
          20 people a day. A reply, a new deal or an unsubscribe takes someone out on its own.
          {off.length > 0 && (
            <> Turn emails on from the <Link href="/crm/nurture" className="font-semibold text-navy-900 underline decoration-gold-500 underline-offset-2">Nurture page</Link>.</>
          )}
        </p>
      </Dialog>
    </>
  );
}
