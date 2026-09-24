/**
 * Is a blog request actually published? Ask the blog, not the table.
 *
 * WHY THIS EXISTS. A blog draft goes live when Luis runs publish-blog.bat, and
 * nothing about that tells this portal. The row stays "Draft ready" until
 * someone remembers to click "Published" as well — which is a second chore for
 * a thing that already happened, and a screen that is wrong until they do.
 *
 * The site already knows which posts are live: they are the MDX files
 * `getAllPosts()` reads. So a drafted blog request whose slug is among them is
 * shown as published, with the post's own date, whether or not the button was
 * ever pressed. Nothing is WRITTEN — the page renders the truth, the stored
 * status is left alone, and a redeploy that removed the post would make the row
 * go back to "Draft ready" on its own.
 *
 * PURE. The live slugs are a parameter, so every rule is pinned by
 * `published.regress.ts` without a filesystem.
 */

import { parseDraftPath } from "./draft";
import type { ContentChannel, ContentStatus } from "./requests";

export interface PublishableRow {
  channel: ContentChannel;
  status: ContentStatus;
  draftUrl: string | null;
  publishedAt: string | null;
}

export interface EffectiveStatus {
  status: ContentStatus;
  /** When it went out: the stored timestamp, or the live post's frontmatter date. */
  publishedAt: string | null;
  /** The blog slug, when the row carries a valid one. */
  slug: string | null;
  /** True when "published" came from the live site rather than the table. */
  fromSite: boolean;
}

/** The slug of a blog request's draft, or null when it has no usable path. */
export function draftSlug(row: Pick<PublishableRow, "channel" | "draftUrl">): string | null {
  if (row.channel !== "blog") return null;
  const parsed = parseDraftPath(row.draftUrl);
  return parsed.ok ? parsed.value : null;
}

/**
 * What the screen should say about this request.
 *
 * ONLY `drafted` IS EVER OVERRIDDEN. That is the one state where "it is live
 * now" is a natural next step the table has not heard about. The others are
 * left alone on purpose:
 *   - `cancelled` is a decision Luis made; a live post with the same slug does
 *     not unmake it.
 *   - `in_progress` with a live slug is a redo in flight — the screen should
 *     say it is being rewritten, not that it is finished.
 *   - `published` is already right.
 * LinkedIn and email have no archive to check, so they always show what is
 * stored and keep their "Published" button.
 *
 * @param liveSlugs slug → frontmatter date, from `getAllPosts()`.
 */
export function effectiveStatus(
  row: PublishableRow,
  liveSlugs: ReadonlyMap<string, string>,
): EffectiveStatus {
  const slug = draftSlug(row);
  const stored: EffectiveStatus = { status: row.status, publishedAt: row.publishedAt, slug, fromSite: false };

  if (row.status !== "drafted" || slug === null) return stored;
  if (!liveSlugs.has(slug)) return stored;

  const date = liveSlugs.get(slug) ?? "";
  return { status: "published", publishedAt: date || null, slug, fromSite: true };
}

/**
 * A link that is safe to put in an href.
 *
 * `draft_url` is written by a token-holding task, not by a person, so it is
 * treated as untrusted: only http(s) becomes a link. A blog path like
 * `content/blog/x.mdx` was being rendered as a relative link and opened a 404;
 * it is not a URL at all, and the page shows it as text instead.
 */
export function safeHref(v: string | null | undefined): string | null {
  const raw = (v ?? "").trim();
  if (!/^https?:\/\//i.test(raw)) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Words in the article, frontmatter excluded. For "1,420 words" on the page. */
export function articleWordCount(mdx: string | null | undefined): number {
  const text = (mdx ?? "").replace(/\r\n/g, "\n");
  let article = text;
  if (text.startsWith("---\n")) {
    const end = text.indexOf("\n---", 3);
    article = end === -1 ? "" : text.slice(end + 4);
  }
  // Whitespace-separated tokens that contain a letter or digit, so table
  // pipes, heading hashes and horizontal rules are not counted as words.
  return article.split(/\s+/).filter((t) => /[A-Za-z0-9]/.test(t)).length;
}
