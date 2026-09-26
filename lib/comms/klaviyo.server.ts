/**
 * The Klaviyo HTTP client for lead nurturing. Talks to Klaviyo and nothing
 * else: reads no table, writes no table, logs nothing.
 *
 * Four calls, and only four:
 *   upsertProfile   POST /api/profile-import — create or update one person
 *   addToList       POST   /api/lists/{id}/relationships/profiles
 *   removeFromList  DELETE /api/lists/{id}/relationships/profiles
 *   listMembers     GET    /api/lists/{id}/profiles (+ their consent)
 *
 * IT CANNOT SUBSCRIBE ANYONE. There is no call here to Klaviyo's subscribe,
 * unsuppress or consent endpoints, and guards.regress.ts §14 fails the build
 * if one appears. Adding a profile to a list does not change their consent —
 * Klaviyo's own docs point to the subscribe endpoint for that, which is
 * exactly the call this module refuses to make. Consent flows INBOUND only
 * (CLAUDE.md): Klaviyo tells Lending OS who unsubscribed, never the reverse.
 *
 * Key: KLAVIYO_PRIVATE_KEY (Vercel, Production). Scopes needed: profiles:read,
 * profiles:write, lists:read, lists:write. Nothing else. No key = not
 * configured, and the sync does nothing rather than failing loudly every run.
 *
 * Imported by lib/nurture/sync.server.ts only.
 */

import "server-only";
import type { KlaviyoEmailMarketing, ProfilePayload } from "@/lib/nurture/nurture";

const API = "https://a.klaviyo.com/api";
/** Klaviyo's dated API version. Pinned: a new revision can change response shapes. */
export const KLAVIYO_REVISION = "2026-07-15";
export const KLAVIYO_TIMEOUT_MS = 10_000;
/** Klaviyo accepts up to 1000 profiles per list call; we stay well under. */
export const LIST_BATCH = 100;

export function klaviyoKey(): string | null {
  const k = process.env.KLAVIYO_PRIVATE_KEY?.trim();
  // Private keys start pk_. A public key (6 characters) here would fail every call.
  return k && k.startsWith("pk_") && k.length >= 20 ? k : null;
}

type Answer = { status: number; json: Record<string, unknown> | null; retryAfter: number | null };

async function call(key: string, path: string, init: { method: "GET" | "POST" | "DELETE"; body?: unknown }): Promise<Answer> {
  try {
    const res = await fetch(`${API}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Klaviyo-API-Key ${key}`,
        revision: KLAVIYO_REVISION,
        accept: "application/vnd.api+json",
        ...(init.body ? { "content-type": "application/vnd.api+json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(KLAVIYO_TIMEOUT_MS),
    });
    let json: Record<string, unknown> | null = null;
    try { json = (await res.json()) as Record<string, unknown>; } catch { /* 204 or non-JSON */ }
    const ra = Number(res.headers.get("retry-after"));
    return { status: res.status, json, retryAfter: Number.isFinite(ra) && ra > 0 ? ra : null };
  } catch {
    return { status: 0, json: null, retryAfter: null };
  }
}

type KError = { code?: unknown; detail?: unknown; meta?: { duplicate_profile_id?: unknown } };
const firstError = (j: Record<string, unknown> | null): KError | null =>
  Array.isArray(j?.errors) && j!.errors.length ? (j!.errors[0] as KError) : null;

/** Klaviyo's short machine reason — never a body, never an address. */
function reason(a: Answer): string {
  if (a.status === 0) return "Klaviyo did not answer (timeout or network)";
  if (a.status === 401 || a.status === 403) return "Klaviyo refused the API key (check KLAVIYO_PRIVATE_KEY and its scopes)";
  if (a.status === 429) return "Klaviyo rate limit — will retry";
  const e = firstError(a.json);
  const code = typeof e?.code === "string" ? e.code : "";
  const detail = typeof e?.detail === "string" ? e.detail.slice(0, 120) : "";
  return `Klaviyo ${a.status}${code ? ` ${code}` : ""}${detail ? `: ${detail}` : ""}`;
}

export type Result<T> = ({ ok: true } & T) | { ok: false; error: string; retryable: boolean };
const fail = (a: Answer): { ok: false; error: string; retryable: boolean } => ({
  ok: false,
  error: reason(a),
  retryable: a.status === 0 || a.status === 429 || a.status >= 500,
});

/**
 * Create or update one profile. Returns Klaviyo's profile id.
 *
 * A 409 means the address already belongs to a profile carrying different
 * identifiers (another external_id, say). Klaviyo names that profile in the
 * error, and it IS the person — same address — so its id is used as-is.
 */
export async function upsertProfile(key: string, payload: ProfilePayload): Promise<Result<{ profileId: string; conflict: boolean }>> {
  const a = await call(key, "/profile-import", { method: "POST", body: payload });
  if (a.status === 200 || a.status === 201) {
    const id = (a.json?.data as { id?: unknown } | undefined)?.id;
    if (typeof id === "string" && id) return { ok: true, profileId: id, conflict: false };
    return { ok: false, error: "Klaviyo answered without a profile id", retryable: true };
  }
  if (a.status === 409) {
    const dup = firstError(a.json)?.meta?.duplicate_profile_id;
    if (typeof dup === "string" && dup) return { ok: true, profileId: dup, conflict: true };
  }
  return fail(a);
}

const refs = (ids: string[]) => ({ data: ids.map((id) => ({ type: "profile", id })) });

export async function addToList(key: string, listId: string, profileIds: string[]): Promise<Result<object>> {
  if (profileIds.length === 0) return { ok: true };
  const a = await call(key, `/lists/${encodeURIComponent(listId)}/relationships/profiles`, { method: "POST", body: refs(profileIds) });
  return a.status === 204 || a.status === 200 ? { ok: true } : fail(a);
}

/** Removing someone who is not on the list is a no-op on Klaviyo's side, not an error. */
export async function removeFromList(key: string, listId: string, profileIds: string[]): Promise<Result<object>> {
  if (profileIds.length === 0) return { ok: true };
  const a = await call(key, `/lists/${encodeURIComponent(listId)}/relationships/profiles`, { method: "DELETE", body: refs(profileIds) });
  return a.status === 204 || a.status === 200 ? { ok: true } : fail(a);
}

export type ListMember = { profileId: string; externalId: string | null; email: string | null; marketing: KlaviyoEmailMarketing };

/**
 * Everyone on a list, with their email consent. 100 per page.
 *
 * `complete` is false when the page cap stopped the read early — the caller
 * must then NOT conclude that someone missing from `members` was removed.
 */
export async function listMembers(key: string, listId: string, maxPages = 30): Promise<Result<{ members: ListMember[]; complete: boolean }>> {
  const members: ListMember[] = [];
  let path: string | null =
    `/lists/${encodeURIComponent(listId)}/profiles?additional-fields%5Bprofile%5D=subscriptions&page%5Bsize%5D=100`;
  for (let page = 0; path && page < maxPages; page++) {
    const a = await call(key, path, { method: "GET" });
    if (a.status !== 200) return fail(a);
    const data = Array.isArray(a.json?.data) ? (a.json!.data as Record<string, unknown>[]) : [];
    for (const d of data) {
      const attrs = (d.attributes ?? {}) as { email?: unknown; external_id?: unknown; subscriptions?: { email?: { marketing?: KlaviyoEmailMarketing } } };
      if (typeof d.id !== "string") continue;
      members.push({
        profileId: d.id,
        externalId: typeof attrs.external_id === "string" ? attrs.external_id : null,
        email: typeof attrs.email === "string" ? attrs.email : null,
        marketing: attrs.subscriptions?.email?.marketing ?? null,
      });
    }
    const next = (a.json?.links as { next?: unknown } | undefined)?.next;
    // Only ever follow Klaviyo's own next link, re-rooted on the API so a key is never sent elsewhere.
    path = typeof next === "string" && next.startsWith(`${API}/`) ? next.slice(API.length) : null;
  }
  return { ok: true, members, complete: path === null };
}
