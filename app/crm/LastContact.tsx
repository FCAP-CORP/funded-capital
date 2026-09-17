import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { daysSince, ageLabel, shortDate } from "@/lib/crm/view";

/**
 * When we last actually spoke to this person, and who spoke last.
 *
 * "Never" is the point of the whole column, so it is styled as an alarm rather
 * than as a blank. Angel Tellez sat unanswered for 76 days and nothing on any
 * screen said so — the CRM showed a tidy row with a date on it, because the
 * date it showed was when HE wrote to US.
 *
 * Direction matters as much as age. A lead we emailed a week ago is waiting on
 * them; a lead who emailed US a week ago is waiting on us, and that is the one
 * that costs money.
 */
export default function LastContact({
  at, direction,
}: {
  at: string | null;
  direction: string | null;
}) {
  if (!at) {
    return (
      <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700 ring-1 ring-inset ring-red-600/20">
        never
      </span>
    );
  }

  const days = daysSince(at);
  const inbound = direction === "email_in";

  // An unanswered inbound message is the loudest signal on the grid, so it
  // escalates faster than an outbound one: they are waiting on us.
  const tone =
    days === null ? "text-slate-400"
      : inbound && days >= 2 ? "text-red-600 font-medium"
        : days >= 30 ? "text-red-600 font-medium"
          : days >= 14 ? "text-amber-600"
            : "text-slate-600";

  return (
    <span className={`inline-flex items-center gap-1 ${tone}`} title={`${shortDate(at)} · ${inbound ? "they wrote to us" : "we wrote to them"}`}>
      {inbound
        ? <ArrowDownLeft size={12} aria-hidden="true" />
        : <ArrowUpRight size={12} aria-hidden="true" />}
      {ageLabel(days)}
      <span className="sr-only">{inbound ? "inbound" : "outbound"}</span>
    </span>
  );
}
