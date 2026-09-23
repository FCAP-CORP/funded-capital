"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { assertCrmStaff } from "@/lib/crm/access";
import { createRequest, setRequestStatus } from "@/lib/marketing/requests.server";
import type { ContentStatus } from "@/lib/marketing/requests";

/**
 * Server actions for the marketing queue.
 *
 * Every one re-checks staff access, exactly as app/crm/brokers/actions.ts does
 * and for the same reason: an action is its own addressable endpoint, reachable
 * with a crafted POST by anyone who can sign in, and the guard on the page does
 * not cover it. `lib/crm/guards.regress.ts` fails the build if one of these
 * loses its check.
 *
 * NOTHING HERE GENERATES ANYTHING. These write a row and revalidate a page. The
 * writing happens in a scheduled Claude task that reads the queue.
 */

async function requireStaff(): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new Error("not signed in");
  await assertCrmStaff();
  return userId;
}

export type ActionResult = { ok: true } | { ok: false; error: string };

function fail(err: unknown): ActionResult {
  return { ok: false, error: err instanceof Error ? err.message : String(err) };
}

/** Ask for a post. The row is the request; a scheduled task does the work. */
export async function requestContentAction(
  channel: string,
  topic: string,
  notes: string,
): Promise<ActionResult> {
  try {
    const staffUserId = await requireStaff();
    const res = await createRequest(channel, topic, notes, staffUserId);
    if (!res.ok) return res;
    revalidatePath("/crm/marketing");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Move a request along by hand.
 *
 * ONLY THE MOVES A PERSON MAKES. Marking something published, cancelling it, or
 * retrying a failure. The transitions a task makes — claiming a job, attaching
 * a draft — are written by that task, not offered as buttons here.
 *
 * The status is validated against the ENUM rather than trusted, and
 * `setRequestStatus` re-reads the row and re-checks the move before writing.
 */
const MANUAL: readonly ContentStatus[] = ["published", "cancelled", "requested"];

export async function setRequestStatusAction(
  id: string,
  status: string,
  publishedUrl: string,
): Promise<ActionResult> {
  try {
    await requireStaff();
    if (!(MANUAL as readonly string[]).includes(status)) {
      return { ok: false, error: `"${status}" is not something you set by hand.` };
    }
    const res = await setRequestStatus(id, status as ContentStatus, {
      publishedUrl: publishedUrl.trim() || null,
    });
    if (!res.ok) return res;
    revalidatePath("/crm/marketing");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
