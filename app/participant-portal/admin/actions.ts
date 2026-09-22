"use server";

import { revalidatePath } from "next/cache";
import {
  clearRunInitiated,
  logPaymentRun,
  markLoanPaidOff,
  markRunInitiated,
  recordCapitalReturned,
} from "@/lib/revenueShare.server";

/**
 * Server actions for the Program Book.
 *
 * Every one of these is admin-gated inside revenueShare.server.ts rather than
 * here, so a new action cannot ship having forgotten the check. What this file
 * adds is form parsing and the cache invalidation that makes the page show the
 * new truth immediately instead of a stale figure.
 */

export interface ActionResult {
  ok: boolean;
  message: string;
}

const AGAIN = " Nothing was changed. Try again, and tell Claude if it persists.";

function fail(detail?: string): ActionResult {
  return { ok: false, message: (detail || "The change could not be made.") + AGAIN };
}

/** Refresh every surface that shows program figures, including participants'. */
function refresh() {
  revalidatePath("/participant-portal/admin");
  revalidatePath("/participant-portal");
  revalidatePath("/participant-portal/payments");
  revalidatePath("/participant-portal/documents");
}

export async function logRunAction(
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  const period = String(form.get("period") || "");
  const sent = String(form.get("sent") || "") || period;

  // The checkbox is the whole point: this records money as received, and the
  // only thing that knows whether it actually moved is the person clicking.
  if (form.get("confirmed") !== "yes") {
    return { ok: false, message: "Tick the confirmation box first — this records money as paid." };
  }

  const result = await logPaymentRun(period, sent);
  if (!result.ok) return fail(result.detail);
  refresh();
  return { ok: true, message: result.data.message };
}

export async function markInitiatedAction(
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  const date = String(form.get("date") || "");
  if (!date) return { ok: false, message: "Pick a date first." };
  const result = await markRunInitiated(date);
  if (!result.ok) return fail(result.detail);
  refresh();
  return { ok: true, message: result.data.message };
}

export async function clearInitiatedAction(
  _prev: ActionResult | null,
  _form: FormData
): Promise<ActionResult> {
  const result = await clearRunInitiated();
  if (!result.ok) return fail(result.detail);
  refresh();
  return { ok: true, message: result.data.message };
}

export async function markPaidOffAction(
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  const key = String(form.get("key") || "").trim();
  const date = String(form.get("date") || "");
  if (!key) return { ok: false, message: "Enter a loan ID or participation ID." };
  if (!date) return { ok: false, message: "Pick the payoff date." };
  const result = await markLoanPaidOff(key, date);
  if (!result.ok) return fail(result.detail);
  refresh();
  return { ok: true, message: result.data.message };
}

export async function capitalReturnedAction(
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  const id = String(form.get("id") || "").trim();
  const date = String(form.get("date") || "");
  if (!id) return { ok: false, message: "Missing participation." };
  if (!date) return { ok: false, message: "Pick the date the capital went back." };
  const result = await recordCapitalReturned(id, date);
  if (!result.ok) return fail(result.detail);
  refresh();
  return { ok: true, message: result.data.message };
}
