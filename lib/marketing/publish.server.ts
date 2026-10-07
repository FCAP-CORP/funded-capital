/**
 * One-click blog publishing — the only module that writes to GitHub. STAFF ONLY.
 *
 * Every export asserts staff itself (guards §3), and §20 pins the rest: it
 * talks to api.github.com and nothing else, it only ever writes the path that
 * `readyToPublish` built (always content/blog/<slug>.mdx), the token goes in
 * one header and is never logged, and nothing outside app/crm/marketing calls
 * it — the queue API, the daily-blog cron and every token-holding route cannot
 * reach it.
 *
 * ORDER IS THE SAFETY:
 *   staff → settings (fail closed) → re-read the row → readyToPublish →
 *   ask GitHub whether the file exists → create it → record "published".
 * The database is written only AFTER GitHub has the file, so a refusal or a
 * timeout never leaves a row saying "published" for a post that is not there.
 *
 * A DOUBLE CLICK PUBLISHES ONCE. GitHub's create refuses a file that already
 * exists, so the second click finds the first one's file, recognises it as the
 * same post (`samePost`) and reports "already sent" instead of an error. A
 * DIFFERENT post at the same address is refused and never overwritten: this
 * module has no update path at all — it never sends a `sha`.
 */

import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { contentRequests } from "@/lib/db/schema";
import { assertCrmStaff, signedInUser } from "@/lib/crm/access";
import { newYorkDate } from "./dailyBlog";
import { parseDraftPath } from "./draft";
import {
  commitMessage,
  contentsUrl,
  githubProblem,
  postUrl,
  publishTarget,
  readyToPublish,
  samePost,
  successMessage,
  type PublishTarget,
} from "./publish";

export type PublishResult =
  | { ok: true; url: string; already: boolean; message: string }
  | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMEOUT_MS = 20_000;

type GhResponse = { status: number; json: unknown } | { status: 0; error: string };

/** One call to GitHub. The token is in this header and nowhere else. */
async function github(t: PublishTarget, url: string, init: { method: "GET" | "PUT"; body?: unknown }): Promise<GhResponse> {
  try {
    const res = await fetch(url, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${t.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "funded-capital-lending-os",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    return { status: res.status, json };
  } catch (err) {
    const name = err instanceof Error ? err.name : "error";
    return { status: 0, error: name };
  }
}

/** The text of a file the contents API returned, or null. */
function decoded(json: unknown): string | null {
  const j = json as { content?: unknown; encoding?: unknown } | null;
  if (!j || typeof j.content !== "string" || j.encoding !== "base64") return null;
  return Buffer.from(j.content.replace(/\s+/g, ""), "base64").toString("utf8");
}

type Existing = { kind: "none" } | { kind: "same" } | { kind: "different" } | { kind: "error"; error: string };

async function whatIsThere(t: PublishTarget, path: string, body: string): Promise<Existing> {
  const res = await github(t, contentsUrl(t, path, t.branch), { method: "GET" });
  if (res.status === 0) return { kind: "error", error: "Could not reach GitHub. Check back in a minute and press Publish again. Nothing was published." };
  if (res.status === 404) {
    // 404 means "no such file" only when the repository itself is visible;
    // a token without access gets 404 too. The create step tells them apart.
    return { kind: "none" };
  }
  if (res.status !== 200) return { kind: "error", error: githubProblem(res.status, "check") };
  const text = decoded(res.json);
  if (text === null) return { kind: "different" };
  return samePost(text, body) ? { kind: "same" } : { kind: "different" };
}

/**
 * Publish one drafted blog request: commit its MDX to the repository, then
 * record it as published. Returns a sentence for the button either way.
 */
export async function publishBlogDraft(id: string, now: Date = new Date()): Promise<PublishResult> {
  await assertCrmStaff();

  if (typeof id !== "string" || !UUID.test(id)) return { ok: false, error: "That request does not exist." };

  const target = publishTarget(process.env);
  if (!target.ok) return target;

  const rows = await db
    .select({
      channel: contentRequests.channel,
      status: contentRequests.status,
      draftUrl: contentRequests.draftUrl,
      draftBody: contentRequests.draftBody,
    })
    .from(contentRequests)
    .where(eq(contentRequests.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return { ok: false, error: "That request no longer exists." };

  // A click from a page loaded before the first click landed: already done.
  if (row.channel === "blog" && row.status === "published") {
    const slug = parseDraftPath(row.draftUrl);
    if (slug.ok) return { ok: true, url: postUrl(slug.value), already: true, message: successMessage(true) };
  }

  const ready = readyToPublish(row, newYorkDate(now));
  if (!ready.ok) return ready;
  const post = ready.value;
  const t = target.value;

  let already = false;
  const before = await whatIsThere(t, post.path, post.body);
  if (before.kind === "error") return { ok: false, error: before.error };
  if (before.kind === "different") {
    return {
      ok: false,
      error: `A different post already lives at /blog/${post.slug}. Nothing was overwritten. Ask for a redo with a different title.`,
    };
  }
  if (before.kind === "same") {
    already = true;
  } else {
    const user = await signedInUser();
    const by = user?.primaryEmailAddress?.emailAddress ?? null;
    const created = await github(t, contentsUrl(t, post.path), {
      method: "PUT",
      body: {
        message: commitMessage(post, by),
        content: Buffer.from(post.body, "utf8").toString("base64"),
        branch: t.branch,
        // No `sha`, ever: this can create a file, never replace one.
      },
    });

    if (created.status === 0) {
      return {
        ok: false,
        error: "GitHub did not answer in time, so it is not certain whether the post went through. Press Publish again — if it did, it will say so.",
      };
    }
    if (created.status === 409 || created.status === 422) {
      // A second click, or two tabs, got there first. Same post = done.
      const after = await whatIsThere(t, post.path, post.body);
      if (after.kind === "same") already = true;
      else if (after.kind === "different") {
        return { ok: false, error: `A different post already lives at /blog/${post.slug}. Nothing was overwritten. Ask for a redo with a different title.` };
      } else return { ok: false, error: githubProblem(created.status, "create") };
    } else if (created.status !== 201 && created.status !== 200) {
      return { ok: false, error: githubProblem(created.status, "create") };
    }
  }

  // GitHub has the file. Only now does the row say so. `status = 'drafted'`
  // in the WHERE keeps a stale click from rewriting a row that already moved.
  // The body is cleared: it was a transit copy, and the published copy now
  // lives in content/blog.
  const url = postUrl(post.slug);
  await db
    .update(contentRequests)
    .set({ status: "published", publishedAt: now, publishedUrl: url, draftBody: null, error: null, updatedAt: now })
    .where(and(eq(contentRequests.id, id), eq(contentRequests.status, "drafted")));

  return { ok: true, url, already, message: successMessage(already) };
}
