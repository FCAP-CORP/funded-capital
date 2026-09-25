/**
 * Connected Gmail mailboxes: store, read and mark. STAFF-ONLY — every export
 * asserts staff itself (guards.regress.ts §3), because a refresh token is a
 * standing key to send mail as the person who connected it.
 *
 * The token is encrypted before it touches the database and decrypted only
 * here (lib/comms/tokenCrypto.ts, key `GMAIL_TOKEN_KEY` in Vercel). No key, no
 * storage and no sending: fail closed, never "store it in the clear for now".
 */

import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { mailConnections } from "@/lib/db/schema";
import { assertCrmStaff } from "@/lib/crm/access";
import { decryptToken, encryptToken, parseTokenKey } from "./tokenCrypto";

const lower = (e: string) => e.trim().toLowerCase();

function tokenKey(): Buffer | null {
  return parseTokenKey(process.env.GMAIL_TOKEN_KEY);
}

/** Is the server able to store tokens at all? */
export async function mailboxReady(): Promise<boolean> {
  await assertCrmStaff();
  return tokenKey() !== null;
}

export async function saveMailConnection(p: {
  email: string;
  clerkUserId: string;
  refreshToken: string;
  scopes: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertCrmStaff();
  const key = tokenKey();
  if (!key) return { ok: false, error: "not-configured" };
  const enc = encryptToken(p.refreshToken, key);
  const email = lower(p.email);
  await db.execute(sql`
    INSERT INTO mail_connections (provider, email, clerk_user_id, refresh_token_enc, scopes, connected_at, updated_at, last_error)
    VALUES ('google', ${email}, ${p.clerkUserId}, ${enc}, ${p.scopes}, now(), now(), NULL)
    ON CONFLICT (provider, lower(email)) DO UPDATE SET
      clerk_user_id = EXCLUDED.clerk_user_id,
      refresh_token_enc = EXCLUDED.refresh_token_enc,
      scopes = EXCLUDED.scopes,
      connected_at = now(),
      updated_at = now(),
      last_error = NULL
  `);
  return { ok: true };
}

export type MailboxState =
  | { state: "not-configured" }
  | { state: "not-connected" }
  | { state: "needs-reconnect"; email: string; why: string }
  | { state: "connected"; email: string };

/** For the compose panel: what the card should offer. */
export async function mailboxState(email: string | null | undefined): Promise<MailboxState> {
  await assertCrmStaff();
  if (!tokenKey() || !process.env.GOOGLE_OAUTH_CLIENT_ID || !process.env.GOOGLE_OAUTH_CLIENT_SECRET) return { state: "not-configured" };
  if (!email) return { state: "not-connected" };
  const [row] = await db
    .select({ email: mailConnections.email, lastError: mailConnections.lastError })
    .from(mailConnections)
    .where(and(eq(mailConnections.provider, "google"), eq(sql`lower(${mailConnections.email})`, lower(email))))
    .limit(1);
  if (!row) return { state: "not-connected" };
  if (row.lastError) return { state: "needs-reconnect", email: row.email, why: row.lastError };
  return { state: "connected", email: row.email };
}

/** The decrypted refresh token for a mailbox, or null. */
export async function mailboxRefreshToken(email: string): Promise<string | null> {
  await assertCrmStaff();
  const key = tokenKey();
  if (!key) return null;
  const [row] = await db
    .select({ enc: mailConnections.refreshTokenEnc, lastError: mailConnections.lastError })
    .from(mailConnections)
    .where(and(eq(mailConnections.provider, "google"), eq(sql`lower(${mailConnections.email})`, lower(email))))
    .limit(1);
  if (!row || row.lastError) return null;
  return decryptToken(row.enc, key);
}

/** Record that a mailbox needs reconnecting (revoked grant), or clear it on success. */
export async function markMailbox(email: string, outcome: { used: true } | { error: string }): Promise<void> {
  await assertCrmStaff();
  await db
    .update(mailConnections)
    .set("used" in outcome ? { lastUsedAt: new Date(), updatedAt: new Date() } : { lastError: outcome.error.slice(0, 200), updatedAt: new Date() })
    .where(and(eq(mailConnections.provider, "google"), eq(sql`lower(${mailConnections.email})`, lower(email))));
}
