"use client";

import { useOptimistic, useTransition } from "react";
import { setBrokerUpdates, type CrmRoute } from "../actions";
import { toast } from "@/components/ui/toast";
import { safeCall } from "@/lib/crm/safeCall";

/**
 * "Email the broker when this deal moves" — Luis's per-deal switch for the
 * automatic broker update emails (lib/crm/brokerUpdates.ts). On by default.
 * Turn it off before a move the broker should not hear about from us.
 *
 * Every call passes `from` — the page the card is open on (guards §8b).
 */
export function BrokerUpdatesToggle({ applicationId, on, from }: { applicationId: string; on: boolean; from: CrmRoute }) {
  const [shown, setShown] = useOptimistic(on);
  const [pending, start] = useTransition();
  return (
    <label className="mt-1.5 flex cursor-pointer items-start gap-2 text-xs text-slate-600">
      <input
        type="checkbox"
        checked={shown}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          start(async () => {
            setShown(next);
            // This switch decides whether the broker is emailed on the next
            // move, so a silent failure is not acceptable: say what happened.
            const res = await safeCall(() => setBrokerUpdates(applicationId, next, from));
            if (res.ok) toast.success(next ? "Broker emails on for this deal" : "Broker emails off for this deal", next ? "The broker hears about stage moves and document requests." : "Nothing is sent to the broker until you tick it again.");
            else toast.error("Not changed — broker emails are still " + (next ? "off" : "on"), (res as { error?: string }).error);
          });
        }}
        className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 accent-navy-900"
      />
      <span>
        Email the broker when this deal moves or documents are requested
        <span className="block text-[11px] text-slate-500">Sent from your Gmail straight away. Untick to keep this deal quiet.</span>
      </span>
    </label>
  );
}
