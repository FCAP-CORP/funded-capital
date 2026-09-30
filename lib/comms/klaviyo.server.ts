/**
 * The Klaviyo HTTP client for lead nurturing. Talks to Klaviyo and nothing
 * else: reads no table, writes no table, logs nothing.
 *
 * Eight calls, and only eight:
 *   upsertProfile   POST /api/profile-import — create or update one person
 *   addToList       POST   /api/lists/{id}/relationships/profiles
 *   removeFromList  DELETE /api/lists/{id}/relationships/profiles
 *   listMembers     GET    /api/lists/{id}/profiles (+ their consent)
 *   getFlow         GET    /api/flows/{id} with its definition   (28 Sep 2026)
 *   setFlowStatus   PATCH  /api/flows/{id} — live or draft, nothing else
 *   listEvents      GET    /api/events — READ ONLY; this client never creates an event
 *   renderTemplate  POST   /api/template-render — a preview; sends nothing
 *
 * IT CANNOT SUBSCRIBE ANYONE. There is no call here to Klaviyo's subscribe,
 * unsuppress or consent endpoints, and guards.regress.ts §14 fails the build
 * if one appears. Adding a profile to a list does not change their consent —
 * Klaviyo's own docs point to the subscribe endpoint for that, which is
 * exactly the call this module refuses to make. Consent flows INBOUND only
 * (CLAUDE.md): Klaviyo tells Lending OS who unsubscribed, never the reverse.
 *
 * Key: KLAVIYO_PRIVATE_KEY (Vercel, Production). Scopes: profiles:read/write,
 * lists:read/write (since 26 Sep 2026), and for the cockpit (28 Sep 2026)
 * flows:read/write, events:read, metrics:read, templates:read. A key missing
 * the new scopes still adds and removes people; Klaviyo answers the flow,
 * event and preview calls with 403 and the page says which permission is
 * missing. No key = not configured, and the sync does nothing rather than
 * failing loudly every run.
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

async function call(key: string, path: string, init: { method: "GET" | "POST" | "DELETE" | "PATCH"; body?: unknown }): Promise<Answer> {
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

/** True when Klaviyo refused for a missing permission (the key predates the cockpit scopes). */
export const isScopeError = (error: string) => /refused the API key/.test(error);

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

/* ------------------------------------------------ the cockpit (28 Sep 2026) */

/** One flow with its definition: status, trigger, filter, emails and waits. The raw JSON; lib/nurture/cockpit.ts parses it. */
export async function getFlow(key: string, flowId: string): Promise<Result<{ json: unknown }>> {
  const a = await call(key, `/flows/${encodeURIComponent(flowId)}?additional-fields%5Bflow%5D=definition`, { method: "GET" });
  return a.status === 200 && a.json ? { ok: true, json: a.json } : fail(a);
}

/**
 * Switch a flow on (live) or off (draft). Klaviyo applies the status to the
 * flow and every email in it. "manual" is deliberately not offered: it parks
 * every send waiting for approval inside Klaviyo, which is exactly the screen
 * Luis does not use.
 */
export async function setFlowStatus(key: string, flowId: string, status: "live" | "draft"): Promise<Result<object>> {
  const a = await call(key, `/flows/${encodeURIComponent(flowId)}`, {
    method: "PATCH",
    body: { data: { type: "flow", id: flowId, attributes: { status } } },
  });
  return a.status === 200 ? { ok: true } : fail(a);
}

export type KlaviyoEvent = {
  id: string;
  datetime: string | null;
  profileId: string | null;
  properties: Record<string, unknown>;
  /** Only when asked for (`withEmail`): the profile's address, from Klaviyo's `included` block. */
  email?: string | null;
};

/** Klaviyo's filter wants an offset, not "Z". */
const klaviyoTime = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "+00:00");

/**
 * Events of one metric since `since`, oldest first, 200 a page. READ ONLY.
 * `complete` is false when the page cap stopped the read, so the caller must
 * not move its cursor past what it has not seen.
 */
export async function listEvents(
  key: string,
  metricId: string,
  since: Date,
  maxPages = 10,
  opts: { withEmail?: boolean } = {},
): Promise<Result<{ events: KlaviyoEvent[]; complete: boolean }>> {
  const filter = `and(equals(metric_id,"${metricId.replace(/[^A-Za-z0-9]/g, "")}"),greater-than(datetime,${klaviyoTime(since)}))`;
  // withEmail: Klaviyo returns each event's profile address in `included`, so an
  // unsubscribe can be matched to a contact who was never in a programme.
  const extra = opts.withEmail ? "&include=profile&fields%5Bprofile%5D=email" : "";
  let path: string | null = `/events?filter=${encodeURIComponent(filter)}&sort=datetime&page%5Bsize%5D=200${extra}`;
  const events: KlaviyoEvent[] = [];
  for (let page = 0; path && page < maxPages; page++) {
    const a = await call(key, path, { method: "GET" });
    if (a.status !== 200) return fail(a);
    const emails = new Map<string, string>();
    for (const inc of Array.isArray(a.json?.included) ? (a.json!.included as Record<string, unknown>[]) : []) {
      const em = (inc.attributes as { email?: unknown } | undefined)?.email;
      if (inc.type === "profile" && typeof inc.id === "string" && typeof em === "string") emails.set(inc.id, em);
    }
    for (const d of Array.isArray(a.json?.data) ? (a.json!.data as Record<string, unknown>[]) : []) {
      const attrs = (d.attributes ?? {}) as { datetime?: unknown; event_properties?: unknown };
      const rel = (d.relationships ?? {}) as { profile?: { data?: { id?: unknown } } };
      if (typeof d.id !== "string") continue;
      events.push({
        id: d.id,
        datetime: typeof attrs.datetime === "string" ? attrs.datetime : null,
        profileId: typeof rel.profile?.data?.id === "string" ? rel.profile.data.id : null,
        properties: attrs.event_properties && typeof attrs.event_properties === "object" ? (attrs.event_properties as Record<string, unknown>) : {},
        ...(opts.withEmail ? { email: typeof rel.profile?.data?.id === "string" ? emails.get(rel.profile.data.id) ?? null : null } : {}),
      });
    }
    const next = (a.json?.links as { next?: unknown } | undefined)?.next;
    path = typeof next === "string" && next.startsWith(`${API}/`) ? next.slice(API.length) : null;
  }
  return { ok: true, events, complete: path === null };
}

/** Render one template for a sample person. Returns HTML; sends nothing to anyone. */
export async function renderTemplate(key: string, templateId: string, context: Record<string, unknown>): Promise<Result<{ html: string }>> {
  const a = await call(key, "/template-render", {
    method: "POST",
    body: { data: { type: "template", id: templateId, attributes: { context } } },
  });
  const html = (a.json?.data as { attributes?: { html?: unknown } } | undefined)?.attributes?.html;
  return (a.status === 200 || a.status === 201) && typeof html === "string" ? { ok: true, html } : fail(a);
}
