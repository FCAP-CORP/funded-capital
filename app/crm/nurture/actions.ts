"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { assertCrmStaff, signedInUser } from "@/lib/crm/access";
import { parseContactIds, programByKey } from "@/lib/nurture/nurture";
import { enrollInProgram, retryEnrollmentSync, stopEnrollment } from "@/lib/nurture/nurture.server";
import { drainNurtureSoon } from "@/lib/nurture/sync.server";

/**
 * The three buttons on /crm/nurture.
 *
 * Each asserts staff first (guards.regress.ts §2) — an action is its own
 * endpoint — and the data layer asserts again. Each refreshes /crm/nurture and
 * nothing else (the PPR rule in CLAUDE.md: refresh only the route you are on).
 *
 * The Klaviyo calls happen AFTER the response, via `after()`, so Luis sees the
 * result at once and Klaviyo is told within seconds. If that background run
 * fails or is cut short, the 15-minute cron finishes the job.
 */

const HERE = "/crm/nurture";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type NurtureActionResult = { ok: true; message: string } | { ok: false; error: string };

export async function enrollAction(program: string, contactIds: unknown): Promise<NurtureActionResult> {
  await assertCrmStaff();
  const p = programByKey(program);
  if (!p) return { ok: false, error: "Pick a programme." };
  const ids = parseContactIds(contactIds);
  if (!ids.ok) return { ok: false, error: ids.error };

  const me = await signedInUser();
  const r = await enrollInProgram({ program: p.key, contactIds: ids.ids, by: me?.id ?? "staff", now: new Date() });
  revalidatePath(HERE);
  if (r.enrolled > 0) after(() => drainNurtureSoon());

  if (r.enrolled === 0) return { ok: false, error: "Nobody was added — they no longer qualify (someone got in touch, a deal started, or they are already in)." };
  const skipped = r.skipped > 0 ? ` ${r.skipped} skipped because they no longer qualify.` : "";
  return { ok: true, message: `Added ${r.enrolled} to ${p.name}.${skipped}` };
}

export async function stopAction(enrollmentId: string): Promise<NurtureActionResult> {
  await assertCrmStaff();
  if (typeof enrollmentId !== "string" || !UUID.test(enrollmentId)) return { ok: false, error: "Not found." };
  const me = await signedInUser();
  const stopped = await stopEnrollment({ enrollmentId, by: me?.id ?? "staff" });
  revalidatePath(HERE);
  if (stopped) after(() => drainNurtureSoon());
  return stopped ? { ok: true, message: "Stopped. They'll be taken off the Klaviyo list." } : { ok: false, error: "Already stopped." };
}

export async function retryAction(enrollmentId: string): Promise<NurtureActionResult> {
  await assertCrmStaff();
  if (typeof enrollmentId !== "string" || !UUID.test(enrollmentId)) return { ok: false, error: "Not found." };
  const ok = await retryEnrollmentSync({ enrollmentId });
  revalidatePath(HERE);
  if (ok) after(() => drainNurtureSoon());
  return ok ? { ok: true, message: "Trying Klaviyo again." } : { ok: false, error: "Nothing to retry." };
}
