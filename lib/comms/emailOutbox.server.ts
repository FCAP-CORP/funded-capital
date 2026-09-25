/**
 * The EXECUTOR for email from the record card: the only code path that sends
 * mail through Gmail. Same shape as the texting executor (outbox.server.ts):
 *
 *   draft invalid          → nothing written, a sentence back
 *   Gmail not connected    → nothing written, "Connect Gmail"
 *   gate refuses           → a `blocked` row with the reason; nothing sent
 *   allowed                → a `sending` row, then Gmail
 *   Gmail accepts          → row `sent` AND the `email_out` activity, one db.batch
 *   Gmail refuses          → `failed`, with the reason in plain English
 *   no answer              → stays `sending`: outcome unknown — check Sent
 *
 * THE GATE is `canEmail()` on a fresh read of the contact: a Klaviyo
 * unsubscribe mirrored in (`email_subscribed = false`) refuses, and only the
 * person can undo it. Guards §13 pins that the gate runs before Gmail is called.
 *
 * WHOSE MAILBOX. Always the signed-in staff member's own, looked up by the
 * address Clerk has for them. A request cannot name a different sender.
 *
 * THE ACTIVITY is keyed `gmail:<message id>:<recipient>` — exactly the key the
 * Apps Script Gmail sync writes for the same message when it later finds it in
 * Sent, so the two never double up.
 *
 * STAFF. Reached only through app/crm/emailActions.ts, whose every export
 * asserts staff (guards §2 and §13). The mailbox module it uses asserts staff
 * again on every call.
 */

import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { activities, applications, contacts, outboundEmails, participants } from "@/lib/db/schema";
import { isUuid } from "@/lib/crm/tasks";
import { gmailDedupKey } from "@/lib/crm/activity";
import { templateByKey } from "@/lib/crm/emailTemplates";
import { canEmail } from "./consent";
import { base64Url, buildMime, parseEmailDraft } from "./email";
import { getSendAs, googleConfig, refreshAccessToken, sendMessage } from "./gmail.server";
import { markMailbox, mailboxRefreshToken, mailboxState } from "./mailbox.server";

export type EmailStatus = "sent" | "already_sent" | "blocked" | "failed" | "unknown" | "invalid" | "not_connected";

export type EmailOutcome = { ok: boolean; status: EmailStatus; message: string };

export type EmailRequest = {
  applicationId: string;
  subject: string;
  body: string;
  templateKey?: string | null;
  idempotencyKey: string;
  /** Clerk user id and primary email of the (already verified) staff member. */
  userId: string;
  userEmail: string | null;
};

const invalid = (message: string): EmailOutcome => ({ ok: false, status: "invalid", message });

function replay(row: { status: string; error: string | null }): EmailOutcome {
  switch (row.status) {
    case "sent":
      return { ok: true, status: "already_sent", message: "Already sent." };
    case "blocked":
      return { ok: false, status: "blocked", message: row.error ?? "Blocked." };
    case "failed":
      return { ok: false, status: "failed", message: `Not sent: ${row.error ?? "Gmail refused it."}` };
    default:
      return { ok: false, status: "unknown", message: "This email may already have gone. Check your Gmail Sent folder before sending again." };
  }
}

/** The person the card is named after: borrower first, then earliest attached. */
async function primaryContact(applicationId: string) {
  const [c] = await db
    .select({ id: contacts.id, email: contacts.email, emailSubscribed: contacts.emailSubscribed })
    .from(participants)
    .innerJoin(contacts, eq(contacts.id, participants.contactId))
    .where(eq(participants.applicationId, applicationId))
    .orderBy(desc(sql`(${participants.role} = 'borrower')`), asc(participants.createdAt), asc(participants.contactId))
    .limit(1);
  return c ?? null;
}

export async function executeSendEmail(req: EmailRequest): Promise<EmailOutcome> {
  const draft = parseEmailDraft(req.subject, req.body);
  if (!draft.ok) return invalid(draft.error);
  if (!isUuid(req.idempotencyKey)) return invalid("This email has no id. Close the panel, open it again and resend.");
  if (!isUuid(req.applicationId)) return invalid("That deal could not be found.");
  const templateKey = req.templateKey && templateByKey(req.templateKey) ? req.templateKey : null;

  const [seen] = await db
    .select({ status: outboundEmails.status, error: outboundEmails.error })
    .from(outboundEmails)
    .where(eq(outboundEmails.idempotencyKey, req.idempotencyKey))
    .limit(1);
  if (seen) return replay(seen);

  const [app] = await db.select({ id: applications.id }).from(applications).where(eq(applications.id, req.applicationId)).limit(1);
  if (!app) return invalid("That deal no longer exists.");

  // Whose mailbox: the signed-in person's own, and nobody else's.
  const fromEmail = req.userEmail?.trim().toLowerCase() ?? "";
  const config = googleConfig();
  const refresh = fromEmail && config ? await mailboxRefreshToken(fromEmail) : null;
  if (!config || !refresh) {
    const st = await mailboxState(fromEmail || null);
    const message =
      st.state === "not-configured" ? "Email sending is not set up on the server yet."
      : st.state === "needs-reconnect" ? "Gmail needs reconnecting — Google no longer accepts the old permission."
      : "Connect your Gmail first — one time, from this panel.";
    return { ok: false, status: "not_connected", message };
  }

  const contact = await primaryContact(app.id);

  // THE GATE. Fresh row, every send. See the file header.
  const gate = canEmail(contact);
  const now = new Date();

  if (!gate.ok) {
    await db
      .insert(outboundEmails)
      .values({
        idempotencyKey: req.idempotencyKey,
        contactId: contact?.id ?? null,
        applicationId: app.id,
        fromEmail,
        toEmail: contact?.email?.trim() || "(none)",
        subject: draft.subject,
        body: draft.body,
        templateKey,
        status: "blocked",
        error: gate.reason,
        createdBy: req.userId,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: outboundEmails.idempotencyKey });
    return { ok: false, status: "blocked", message: gate.reason };
  }

  const [claimed] = await db
    .insert(outboundEmails)
    .values({
      idempotencyKey: req.idempotencyKey,
      contactId: contact!.id,
      applicationId: app.id,
      fromEmail,
      toEmail: gate.email,
      subject: draft.subject,
      body: draft.body,
      templateKey,
      status: "sending",
      createdBy: req.userId,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: outboundEmails.idempotencyKey })
    .returning({ id: outboundEmails.id });
  if (!claimed) {
    const [first] = await db
      .select({ status: outboundEmails.status, error: outboundEmails.error })
      .from(outboundEmails)
      .where(eq(outboundEmails.idempotencyKey, req.idempotencyKey))
      .limit(1);
    return first ? replay(first) : invalid("This send collided with another. Check the timeline before sending again.");
  }

  const fail = async (error: string): Promise<EmailOutcome> => {
    await db
      .update(outboundEmails)
      .set({ status: "failed", error, updatedAt: new Date() })
      .where(and(eq(outboundEmails.id, claimed.id), eq(outboundEmails.status, "sending")));
    return { ok: false, status: "failed", message: `Not sent: ${error}` };
  };

  const token = await refreshAccessToken(config, refresh);
  if (!token.ok) {
    if (token.revoked) {
      await markMailbox(fromEmail, { error: "Google revoked the permission" });
      return fail("Gmail needs reconnecting — Google no longer accepts the old permission. Use Connect Gmail in this panel.");
    }
    return fail(`Google did not issue access (${token.error}). Try again in a minute.`);
  }

  // Gmail does not add the signature to API sends. Read it and add it, or do not send:
  // Luis asked for his signature on every email, so a silent signature-less send is a failure.
  const who = await getSendAs(token.accessToken, fromEmail);
  if (!who.ok) return fail(`Could not read your Gmail signature (${who.error}). Try again.`);

  let raw: string;
  try {
    raw = base64Url(
      buildMime({
        from: fromEmail,
        fromName: who.sendAs.displayName,
        to: gate.email,
        subject: draft.subject,
        text: draft.body,
        signatureHtml: who.sendAs.signature,
      }),
    );
  } catch {
    return fail("The email address on file cannot be used as-is. Check it on the contact.");
  }

  const res = await sendMessage(token.accessToken, raw);
  const sentAt = new Date();

  if (res.ok) {
    try {
      await db.batch([
        db
          .update(outboundEmails)
          .set({ status: "sent", providerMessageId: res.id, providerThreadId: res.threadId, sentAt, error: null, updatedAt: sentAt })
          .where(and(eq(outboundEmails.id, claimed.id), inArray(outboundEmails.status, ["sending", "failed"]))),
        db
          .insert(activities)
          .values({
            contactId: contact!.id,
            applicationId: app.id,
            kind: "email_out",
            occurredAt: sentAt,
            source: "crm",
            subject: draft.subject,
            body: draft.body,
            metadata: {
              provider: "gmail",
              outboundEmailId: claimed.id,
              gmailMessageId: res.id,
              gmailThreadId: res.threadId,
              from: fromEmail,
              to: gate.email,
              template: templateKey,
              by: req.userId,
            },
            dedupKey: gmailDedupKey(res.id, gate.email.toLowerCase()),
          })
          .onConflictDoNothing({ target: activities.dedupKey }),
      ]);
    } catch {
      return { ok: true, status: "sent", message: "Sent. The timeline will catch up when the Gmail sync next runs." };
    }
    await markMailbox(fromEmail, { used: true }).catch(() => {});
    return { ok: true, status: "sent", message: "Sent from your Gmail." };
  }

  if (res.outcome === "rejected") return fail(res.error);

  await db
    .update(outboundEmails)
    .set({ error: res.error, updatedAt: new Date() })
    .where(and(eq(outboundEmails.id, claimed.id), eq(outboundEmails.status, "sending")));
  return { ok: false, status: "unknown", message: `${res.error} It may still have gone — check your Gmail Sent folder before sending again.` };
}

/** What the compose panel shows: whose mailbox, and the signature preview. */
export async function composeInfo(userEmail: string | null): Promise<
  | { state: "not-configured" | "not-connected" }
  | { state: "needs-reconnect"; email: string }
  | { state: "connected"; email: string; displayName: string | null; signatureHtml: string | null; signatureError: string | null }
> {
  const st = await mailboxState(userEmail);
  if (st.state === "not-configured" || st.state === "not-connected") return { state: st.state };
  if (st.state === "needs-reconnect") return { state: "needs-reconnect", email: st.email };
  const config = googleConfig();
  const refresh = await mailboxRefreshToken(st.email);
  if (!config || !refresh) return { state: "not-connected" };
  const token = await refreshAccessToken(config, refresh);
  if (!token.ok) {
    if (token.revoked) {
      await markMailbox(st.email, { error: "Google revoked the permission" });
      return { state: "needs-reconnect", email: st.email };
    }
    return { state: "connected", email: st.email, displayName: null, signatureHtml: null, signatureError: "Google did not answer; the signature will be added when you send." };
  }
  const who = await getSendAs(token.accessToken, st.email);
  return who.ok
    ? { state: "connected", email: st.email, displayName: who.sendAs.displayName, signatureHtml: who.sendAs.signature, signatureError: null }
    : { state: "connected", email: st.email, displayName: null, signatureHtml: null, signatureError: "Could not read your Gmail signature just now." };
}
