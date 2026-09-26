import { notFound } from "next/navigation";
import { isCrmStaff } from "@/lib/crm/access";
import { getNurturePage } from "@/lib/nurture/nurture.server";
import { PROGRAMS, programByKey } from "@/lib/nurture/nurture";
import { NurtureView, type NurtureTab } from "./NurtureView";

/**
 * The request-dependent part of /crm/nurture: which programme and tab are
 * open, the staff check, and the data. Rendered inside the page's <Suspense>.
 */
export default async function NurtureContent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!(await isCrmStaff())) notFound();

  const sp = await searchParams;
  const program = programByKey(typeof sp.program === "string" ? sp.program : "") ?? PROGRAMS.find((p) => p.key === "quiet")!;
  const tab: NurtureTab = sp.view === "enrolled" || sp.view === "stopped" ? sp.view : "ready";

  const data = await getNurturePage(new Date());
  return <NurtureView data={data} program={program.key} tab={tab} />;
}
