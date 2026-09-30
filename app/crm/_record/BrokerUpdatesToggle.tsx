"use client";

import { useOptimistic, useTransition } from "react";
import { setBrokerUpdates, type CrmRoute } from "../actions";

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
            await setBrokerUpdates(applicationId, next, from);
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
