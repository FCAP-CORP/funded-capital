"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { assertCrmStaff } from "@/lib/crm/access";
import { executeRetryText, executeSendText, type SendStatus } from "@/lib/comms/outbox.server";
import type { CrmRoute } from "./actions";

/**
 * Texting from the record card. Two actions, both staff-only, both thin.
 *
 * These decide nothing about consent. They check WHO is asking (a server
 * action is an addressable endpoint — see the note at the top of actions.ts)
 * and hand over to the executor in lib/comms/outbox.server.ts, which re-reads
 * the contact and runs the consent gate itself on every send and retry. So a
 * crafted POST that skips the card's disabled button meets the same gate.
 *
 * Kept out of actions.ts so a change to texting cannot disturb the pipeline's
 * actions, and so this file is the executor's only importer (guards §11).
 *
 * NEVER THROWS TO THE BROWSER. Every outcome — sent, blocked, refused by Quo,
 * outcome unknown — comes back as a value with a sentence the card can show.
 */

async function requireStaff(): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new Error("not signed in");
  await assertCrmStaff();
  return userId;
}

/**
 * The routes these actions may refresh — typed as CrmRoute, so a route that is
 * not on actions.ts's list cannot be added here. One route per call, the
 * caller's own; anything else falls back to /crm rather than being passed to
 * revalidatePath, because the argument arrives from the browser.
 */
const COMMS_ROUTES: readonly CrmRoute[] = ["/crm", "/crm/dashboard", "/crm/board", "/crm/contacts"];

function revalidateFrom(from: unknown, fallback: CrmRoute): void {
  revalidatePath(typeof from === "string" && (COMMS_ROUTES as readonly string[]).includes(from) ? from : fallback);
}

export type TextResult =
  | { ok: true; status: SendStatus; message: string }
  | { ok: false; status: SendStatus | "error"; error: string };

/**
 * Send a text to the person on a deal (or a named contact on it).
 *
 * `idempotencyKey` is a uuid the compose box mints once; pressing Send twice,
 * or the browser resending the action, returns the first result and sends
 * nothing more.
 */
export async function sendText(
  target: { applicationId?: string | null; contactId?: string | null },
  body: string,
  idempotencyKey: string,
  from: CrmRoute = "/crm",
): Promise<TextResult> {
  try {
    const userId = await requireStaff();
    const res = await executeSendText({
      applicationId: target?.applicationId ?? null,
      contactId: target?.contactId ?? null,
      body,
      idempotencyKey,
      userId,
    });
    // Blocked and failed attempts are on the timeline too, so refresh either way.
    if (res.outboundId) revalidateFrom(from, "/crm");
    return res.ok
      ? { ok: true, status: res.status, message: res.message }
      : { ok: false, status: res.status, error: res.message };
  } catch (err) {
    return {
      ok: false,
      status: "error",
      error: err instanceof Error && err.message === "not signed in" ? "You are signed out. Sign in again." : "Something went wrong while sending. Check the timeline before trying again.",
    };
  }
}

/** Try a failed or stuck text again. The executor re-checks consent first. */
export async function retryText(outboundId: string, from: CrmRoute = "/crm"): Promise<TextResult> {
  try {
    const userId = await requireStaff();
    const res = await executeRetryText(outboundId, userId);
    revalidateFrom(from, "/crm");
    return res.ok
      ? { ok: true, status: res.status, message: res.message }
      : { ok: false, status: res.status, error: res.message };
  } catch {
    return { ok: false, status: "error", error: "Something went wrong while retrying. Check the timeline before trying again." };
  }
}
