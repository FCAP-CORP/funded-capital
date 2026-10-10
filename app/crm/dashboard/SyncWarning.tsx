import { AlertTriangle, ExternalLink } from "lucide-react";
import { GMAIL_SYNC_TRIGGERS_URL, gmailSyncWarning, type SyncHealth } from "@/lib/crm/syncHealth";

/**
 * The Gmail sync warning at the top of the dashboard (10 Oct 2026).
 *
 * Shown ONLY when the sync has gone quiet — never a green "all good" badge,
 * which would become wallpaper within a week. The words come from
 * lib/crm/syncHealth.ts (tested); this file only draws them. No client
 * JavaScript: a server-rendered box and one link.
 *
 * The link opens the Apps Script project's own timer list, which is where it
 * has gone wrong before (a timer that was never switched on). "Run" there is
 * safe; "Deploy" is not needed and must not be pressed — the steps say so.
 */
export function SyncWarning({ health }: { health: SyncHealth }) {
  const w = gmailSyncWarning(health);
  if (!w) return null;
  return (
    <section
      role="alert"
      aria-labelledby="gmail-sync-warning"
      className="flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 sm:flex-row sm:items-start sm:gap-4 sm:p-5"
    >
      <AlertTriangle size={22} className="mt-0.5 shrink-0 text-amber-700" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <h2 id="gmail-sync-warning" className="text-sm font-bold text-navy-900">{w.title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-700">{w.body}</p>
        <p className="mt-2 text-xs leading-relaxed text-slate-600">
          To fix it: open the timers, check <span className="font-semibold text-navy-900">syncGmailToCrm</span> is
          listed and its error rate is low. If it is missing, open <span className="font-semibold text-navy-900">GmailSync.gs</span>,
          choose <span className="font-semibold text-navy-900">installTrigger</span> and press Run (never Deploy). Or ask Claude to look.
        </p>
      </div>
      <a
        href={GMAIL_SYNC_TRIGGERS_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg bg-navy-900 px-3 py-2 text-sm font-semibold text-white hover:bg-navy-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
      >
        Open the timers <ExternalLink size={14} aria-hidden="true" />
      </a>
    </section>
  );
}
