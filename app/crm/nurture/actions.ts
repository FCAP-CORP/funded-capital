"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { assertCrmStaff, signedInUser } from "@/lib/crm/access";
import { parseContactIds, programByKey } from "@/lib/nurture/nurture";
import { parseMode, MODE_LABEL } from "@/lib/nurture/cockpit";
import { enrollInProgram, retryEnrollmentSync, setPaused, setProgramMode, stopEnrollment } from "@/lib/nurture/nurture.server";
import { drainNurtureSoon, refreshFromKlaviyo, switchFlow } from "@/lib/nurture/sync.server";

/**
 * The buttons on /crm/nurture: enrol, stop, try again, and the cockpit's
 * mode switch, emails on/off, pause/resume and refresh.
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

  if (r.enrolled === 0) return { ok: false, error: "Nobody was added — they no longer qualify (someone responded, a deal started, or they are already in)." };
  const skipped = r.skipped > 0 ? ` ${r.skipped} skipped because they no longer qualify.` : "";
  return { ok: true, message: `Added ${r.enrolled} to ${p.name}. They're queued and go out on weekday mornings, within the warm-up limit, while this programme's emails are on.${skipped}` };
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

/* ------------------------------------------------------------- cockpit */

export async function setModeAction(program: string, mode: string): Promise<NurtureActionResult> {
  await assertCrmStaff();
  const p = programByKey(program);
  const m = parseMode(mode);
  if (!p || !m) return { ok: false, error: "Pick a programme and a mode." };
  const me = await signedInUser();
  const ok = await setProgramMode({ program: p.key, mode: m, by: me?.id ?? "staff" });
  revalidatePath(HERE);
  if (!ok) return { ok: false, error: "Not saved. Has migration 0016 run?" };
  return {
    ok: true,
    message: m === "auto"
      ? `${p.name}: ${MODE_LABEL.auto}. Every weekday morning, everyone who qualifies is queued.`
      : `${p.name}: ${MODE_LABEL.review}. Only the people you tick are added.`,
  };
}

/** Switch a programme's emails on or off. Reaches Klaviyo, so it goes through the sync module. */
export async function setFlowAction(program: string, on: boolean): Promise<NurtureActionResult> {
  await assertCrmStaff();
  const p = programByKey(program);
  if (!p || typeof on !== "boolean") return { ok: false, error: "Pick a programme." };
  const r = await switchFlow(p.key, on);
  revalidatePath(HERE);
  if (r.ok && on) after(() => drainNurtureSoon());
  return r;
}

export async function pauseAction(paused: boolean): Promise<NurtureActionResult> {
  await assertCrmStaff();
  if (typeof paused !== "boolean") return { ok: false, error: "Not saved." };
  const me = await signedInUser();
  const ok = await setPaused({ paused, by: me?.id ?? "staff", now: new Date() });
  revalidatePath(HERE);
  if (!ok) return { ok: false, error: "Not saved. Has migration 0016 run?" };
  if (!paused) after(() => drainNurtureSoon());
  return { ok: true, message: paused ? "Paused. Nobody new goes to Klaviyo until you resume." : "Resumed. Sending picks up on the next weekday morning window." };
}

export async function refreshAction(): Promise<NurtureActionResult> {
  await assertCrmStaff();
  const r = await refreshFromKlaviyo();
  revalidatePath(HERE);
  return r;
}
