import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Encryption at rest for the Gmail refresh token. Pinned by
 * tokenCrypto.regress.ts.
 *
 * WHY IT IS ENCRYPTED. A Gmail refresh token is a standing key to send mail as
 * Luis. It has to live somewhere the server can read it, and the database is
 * the only place that survives a redeploy. Stored in the clear, anyone with a
 * database dump (a Neon branch, a backup, a leaked connection string) could
 * send email from luis@fundedcapital.com. Encrypted with a key that lives only
 * in Vercel (`GMAIL_TOKEN_KEY`), a dump alone is useless.
 *
 * AES-256-GCM: authenticated, so a tampered ciphertext fails to decrypt rather
 * than decrypting to garbage. A fresh 12-byte IV per encryption. The stored
 * form is `v1:<iv>:<tag>:<ciphertext>`, base64 each, so the format can change
 * later without guessing.
 *
 * The key must decode to exactly 32 bytes. Anything else is refused: a short
 * or mistyped key is the kind of mistake that silently weakens encryption.
 * No key → nothing is stored and nothing is read (fail closed).
 */

export function parseTokenKey(raw: string | undefined | null): Buffer | null {
  const s = (raw ?? "").trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(s)) return null;
  const key = Buffer.from(s, "base64");
  return key.length === 32 ? key : null;
}

export function encryptToken(plain: string, key: Buffer): string {
  if (key.length !== 32) throw new Error("token key must be 32 bytes");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

/** Null for anything that does not decrypt: wrong key, tampering, wrong format. Never throws. */
export function decryptToken(stored: string, key: Buffer): string | null {
  try {
    const parts = stored.split(":");
    if (parts.length !== 4 || parts[0] !== "v1") return null;
    const iv = Buffer.from(parts[1], "base64");
    const tag = Buffer.from(parts[2], "base64");
    const ct = Buffer.from(parts[3], "base64");
    if (iv.length !== 12 || tag.length !== 16) return null;
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
