"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { assertCrmStaff, signedInUser } from "@/lib/crm/access";
import { composeInfo, executeSendEmail, type EmailStatus } from "@/lib/comms/emailOutbox.server";
import { signatureToText } from "@/lib/comms/email";
import type { CrmRoute } from "./actions";

/**
 * Email from the record card. Two actions, both staff-only, both thin — the
 * rules live in the executor (lib/comms/emailOutbox.server.ts), which re-reads
 * the contact and runs the email gate itself on every send.
 *
 * The sender is always the signed-in person's own address, read here from
 * Clerk — never from the request.
 *
 * NEVER THROWS TO THE BROWSER.
 */

async function requireStaff(): Promise<{ userId: string; email: string | null; firstName: string | null }> {
  const { userId } = await auth();
  if (!userId) throw new Error("not signed in");
  await assertCrmStaff();
  const user = await signedInUser();
  return {
    userId,
    email: user?.primaryEmailAddress?.emailAddress?.toLowerCase() ?? null,
    firstName: user?.firstName ?? null,
  };
}

const EMAIL_ROUTES: readonly CrmRoute[] = ["/crm", "/crm/dashboard", "/crm/board", "/crm/contacts"];

function revalidateFrom(from: unknown, fallback: CrmRoute): void {
  revalidatePath(typeof from === "string" && (EMAIL_ROUTES as readonly string[]).includes(from) ? from : fallback);
}

export type EmailPanelInfo =
  | { ok: true; state: "not-configured" | "not-connected"; senderFirstName: string | null }
  | { ok: true; state: "needs-reconnect"; email: string; senderFirstName: string | null }
  | {
      ok: true;
      state: "connected";
      email: string;
      displayName: string | null;
      signature: string | null;
      signatureNote: string | null;
      senderFirstName: string | null;
    }
  | { ok: false; error: string };

/** Opened with the panel: whose Gmail, and the signature that will be added. */
export async function emailPanelInfo(): Promise<EmailPanelInfo> {
  try {
    const me = await requireStaff();
    const info = await composeInfo(me.email);
    if (info.state === "connected") {
      return {
        ok: true,
        state: "connected",
        email: info.email,
        displayName: info.displayName,
        signature: info.signatureHtml ? signatureToText(info.signatureHtml) : null,
        signatureNote: info.signatureError ?? (info.signatureHtml ? null : "Your Gmail has no signature set, so none will be added."),
        senderFirstName: me.firstName,
      };
    }
    return info.state === "needs-reconnect"
      ? { ok: true, state: "needs-reconnect", email: info.email, senderFirstName: me.firstName }
      : { ok: true, state: info.state, senderFirstName: me.firstName };
  } catch {
    return { ok: false, error: "Could not check your Gmail connection. Try again." };
  }
}

export type EmailResult =
  | { ok: true; status: EmailStatus; message: string }
  | { ok: false; status: EmailStatus | "error"; error: string };

export async function sendEmail(
  applicationId: string,
  draft: { subject: string; body: string; templateKey?: string | null },
  idempotencyKey: string,
  from: CrmRoute = "/crm",
): Promise<EmailResult> {
  try {
    const me = await requireStaff();
    const res = await executeSendEmail({
      applicationId,
      subject: draft?.subject ?? "",
      body: draft?.body ?? "",
      templateKey: draft?.templateKey ?? null,
      idempotencyKey,
      userId: me.userId,
      userEmail: me.email,
    });
    if (res.ok) revalidateFrom(from, "/crm");
    return res.ok ? { ok: true, status: res.status, message: res.message } : { ok: false, status: res.status, error: res.message };
  } catch (err) {
    return {
      ok: false,
      status: "error",
      error: err instanceof Error && err.message === "not signed in" ? "You are signed out. Sign in again." : "Something went wrong while sending. Check your Gmail Sent folder before trying again.",
    };
  }
}
