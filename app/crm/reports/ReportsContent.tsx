import { notFound } from "next/navigation";
import { isCrmStaff } from "@/lib/crm/access";
import { getNurtureReportRows, getReportRows } from "@/lib/crm/reports.server";
import { buildReports, parseRange, RANGE_LABEL } from "@/lib/crm/reports";
import { nurtureReport } from "@/lib/nurture/cockpit";
import { NurtureReport, RangePicker, ReportsBody } from "./ReportsView";

/**
 * The part of /crm/reports that depends on the request: the period in the
 * URL, the staff check and the data. Rendered inside the page's <Suspense>,
 * which is the only place request data may be awaited under cacheComponents.
 */
export default async function Reports({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // Checked here as well as in the layout; getReportRows asserts staff again.
  if (!(await isCrmStaff())) notFound();

  const range = parseRange((await searchParams).range);
  const now = new Date();
  const [rows, nurtureRows] = await Promise.all([getReportRows(), getNurtureReportRows()]);
  const model = buildReports(rows, range, now);
  const nurture = nurtureReport(nurtureRows, model.window);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <RangePicker active={range} />
        <p className="text-[13px] text-slate-500">
          {RANGE_LABEL[range]} · New York time · updated {now.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })}
        </p>
      </div>
      <ReportsBody m={model} />
      <NurtureReport r={nurture} periodLabel={model.window.label} />
    </div>
  );
}
