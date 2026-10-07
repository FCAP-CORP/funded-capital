/**
 * One-click blog publishing from /crm/marketing — the rules.
 *
 * WHY THIS EXISTS (7 Oct 2026). A blog draft used to reach the site in three
 * steps on Luis's laptop: fc-pull-drafts.bat brought it down, he read it, and
 * publish-blog.bat committed and pushed it. The writing was already automatic;
 * the last mile was two double-clicks on one particular machine. Luis asked for
 * one button in the CRM.
 *
 * HOW. The site already holds the draft (content_requests.draft_body). Pressing
 * Publish asks GitHub to create `content/blog/<slug>.mdx` on `main` through its
 * contents API — the same commit publish-blog.bat would have made — and the
 * push deploys exactly as it always has. Nothing about how the blog is built or
 * served changes; git is still the record of every post.
 *
 * NOTHING REACHES THE PUBLIC WITHOUT LUIS. The button is the decision. No cron,
 * no task and no token-holding agent can press it: it is a staff-only server
 * action, and the queue API still cannot publish (guards §6, §20).
 *
 * PURE. No network, no database, no filesystem — `publish.regress.ts` pins every
 * rule here. The one module that talks to GitHub is publish.server.ts.
 */

import { parseDraftPath, validateDraftBody } from "./draft";
import { FORBIDDEN_STRINGS } from "./dailyBlog";

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

/* ------------------------------------------------------------- the target */

/** Where posts are committed. Overridable for a fork or a test repo, never by a request. */
export const DEFAULT_REPO = "FCAP-CORP/funded-capital";
export const DEFAULT_BRANCH = "main";
export const SITE = "https://www.fundedcapital.com";
export const GITHUB_API = "https://api.github.com";

export interface PublishTarget {
  owner: string;
  repo: string;
  branch: string;
  token: string;
}

/**
 * The GitHub settings, or why there are none.
 *
 * FAILS CLOSED, like CONTENT_QUEUE_TOKEN and CRON_SECRET: no token, a token
 * that is plainly not a GitHub token, or a malformed repo name means the button
 * explains what to set up and does nothing else.
 */
export function publishTarget(env: Record<string, string | undefined>): Checked<PublishTarget> {
  const token = (env.GITHUB_PUBLISH_TOKEN ?? "").trim();
  if (!token) {
    return {
      ok: false,
      error: "Publishing is not switched on yet: GITHUB_PUBLISH_TOKEN is not set in Vercel. Nothing was published.",
    };
  }
  if (/\s/.test(token) || token.length < 30 || !/^(github_pat_|ghp_)[A-Za-z0-9_]+$/.test(token)) {
    return {
      ok: false,
      error: "GITHUB_PUBLISH_TOKEN in Vercel does not look like a GitHub token (it should start with github_pat_). Nothing was published.",
    };
  }

  const repoName = (env.GITHUB_PUBLISH_REPO ?? "").trim() || DEFAULT_REPO;
  const m = /^([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})$/.exec(repoName);
  if (!m || m[2] === "." || m[2] === "..") {
    return { ok: false, error: `GITHUB_PUBLISH_REPO "${repoName}" is not owner/name. Nothing was published.` };
  }
  const branch = (env.GITHUB_PUBLISH_BRANCH ?? "").trim() || DEFAULT_BRANCH;
  if (!/^[A-Za-z0-9._/-]{1,100}$/.test(branch) || branch.includes("..")) {
    return { ok: false, error: `GITHUB_PUBLISH_BRANCH "${branch}" is not a branch name. Nothing was published.` };
  }
  return { ok: true, value: { owner: m[1], repo: m[2], branch, token } };
}

/** The contents-API URL for one file. Each path segment is encoded on its own. */
export function contentsUrl(t: Pick<PublishTarget, "owner" | "repo">, path: string, ref?: string): string {
  const segs = path.split("/").map(encodeURIComponent).join("/");
  const base = `${GITHUB_API}/repos/${encodeURIComponent(t.owner)}/${encodeURIComponent(t.repo)}/contents/${segs}`;
  return ref ? `${base}?ref=${encodeURIComponent(ref)}` : base;
}

export const postUrl = (slug: string) => `${SITE}/blog/${slug}`;

/* -------------------------------------------------------------- the post */

export interface PublishableDraft {
  channel: string;
  status: string;
  draftUrl: string | null;
  draftBody: string | null;
}

export interface ReadyPost {
  slug: string;
  /** Repository path, always `content/blog/<slug>.mdx`. */
  path: string;
  /** The MDX exactly as it will be committed (LF endings, publish date set). */
  body: string;
  title: string;
}

/**
 * Is this row a post that can go live right now? Everything is re-checked from
 * the stored row, never from what the screen showed.
 *
 * The forbidden figures ("44 states", "as little as 5 days"…) are checked again
 * here because a draft can sit for days, and the rule list can change between
 * the morning it was written and the morning it is published.
 */
export function readyToPublish(row: PublishableDraft, today: string): Checked<ReadyPost> {
  if (row.channel !== "blog") return { ok: false, error: "Only blog posts publish from here." };
  if (row.status !== "drafted") {
    return { ok: false, error: row.status === "published" ? "That post is already published." : "That post is not a finished draft any more. Reload the page." };
  }
  const slug = parseDraftPath(row.draftUrl);
  if (!slug.ok) return { ok: false, error: `The draft has no usable address: ${slug.error}` };
  if (!row.draftBody) {
    return { ok: false, error: "This draft was written before drafts were stored on the site, so there is nothing here to publish. Use fc-pull-drafts.bat for this one." };
  }
  const body = validateDraftBody(row.draftBody);
  if (!body.ok) return { ok: false, error: `The draft is not ready: ${body.error}` };

  const lower = body.value.body.toLowerCase();
  const bad = FORBIDDEN_STRINGS.filter((s) => lower.includes(s.toLowerCase()));
  if (bad.length) {
    return { ok: false, error: `The draft still says ${bad.map((b) => `"${b}"`).join(", ")}, which the brand rules forbid. Ask for a redo.` };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return { ok: false, error: "Could not work out today's date." };

  const final = withPublishDate(body.value.body, today);
  return { ok: true, value: { slug: slug.value, path: `content/blog/${slug.value}.mdx`, body: final, title: frontmatterTitle(final) ?? slug.value } };
}

/** The frontmatter block (between the fences), or null. Assumes LF endings. */
function frontmatter(body: string): { start: number; end: number } | null {
  if (!body.startsWith("---\n")) return null;
  const end = body.indexOf("\n---", 3);
  return end === -1 ? null : { start: 4, end };
}

/**
 * Date the post the day it goes live, not the day it was drafted.
 *
 * A draft written Monday and published Thursday would otherwise appear on the
 * blog, in the sitemap and on the cadence card as three days old on the day it
 * went out. Only the `date:` line changes; an `updated:` line that is older
 * than the new date is moved with it so dateModified is never before
 * datePublished. Everything else is committed byte for byte.
 */
export function withPublishDate(body: string, today: string): string {
  const fm = frontmatter(body);
  if (!fm) return body;
  const lines = body.slice(fm.start, fm.end).split("\n");
  const out = lines.map((line) => {
    if (/^date:/.test(line)) return `date: "${today}"`;
    const u = /^updated:\s*["']?(\d{4}-\d{2}-\d{2})["']?\s*$/.exec(line);
    if (u && u[1] < today) return `updated: "${today}"`;
    return line;
  });
  return body.slice(0, fm.start) + out.join("\n") + body.slice(fm.end);
}

/** The post's title from its frontmatter, quotes removed, one line. */
export function frontmatterTitle(body: string): string | null {
  const fm = frontmatter(body);
  if (!fm) return null;
  const line = body.slice(fm.start, fm.end).split("\n").find((l) => /^title:/.test(l));
  if (!line) return null;
  let t = line.slice("title:".length).trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) t = t.slice(1, -1);
  t = t.replace(/\\"/g, '"').replace(/[\r\n\t]+/g, " ").trim();
  return t || null;
}

/** The commit message. One line of subject, capped, then who pressed the button. */
export function commitMessage(post: Pick<ReadyPost, "slug" | "title">, publishedBy: string | null): string {
  const title = post.title.length > 60 ? post.title.slice(0, 57).trimEnd() + "..." : post.title;
  const who = (publishedBy ?? "").replace(/[\r\n<>]/g, "").trim();
  return `Publish blog post: ${title}\n\ncontent/blog/${post.slug}.mdx, published from Lending OS (/crm/marketing)${who ? ` by ${who}` : ""}.`;
}

/**
 * Is the file already in the repository the same post? Compared with line
 * endings normalised and the date lines ignored, so a second click — today or
 * after midnight — is recognised as "already sent", not as a clash.
 */
export function samePost(a: string, b: string): boolean {
  const norm = (s: string) =>
    s.replace(/\r\n/g, "\n").split("\n").filter((l) => !/^(date|updated):/.test(l)).join("\n").trimEnd();
  return norm(a) === norm(b);
}

/* ------------------------------------------------------------ the answers */

export type GithubStep = "check" | "create";

/** What a GitHub refusal means, in words Luis can act on. Never echoes the token. */
export function githubProblem(status: number, step: GithubStep): string {
  if (status === 401) {
    return "GitHub did not accept GITHUB_PUBLISH_TOKEN — it has expired or been revoked. Make a new one (see CLAUDE.md, \"One-click publish\") and replace it in Vercel. Nothing was published.";
  }
  if (status === 403) {
    return "GitHub refused: the token cannot write to the repository. It needs Contents: Read and write on FCAP-CORP/funded-capital, and the organisation may need to approve it. Nothing was published.";
  }
  if (status === 404) {
    return step === "check"
      ? "GitHub cannot see the repository with this token. Check the token has access to FCAP-CORP/funded-capital. Nothing was published."
      : "GitHub could not find the repository or branch with this token. Check the token has access to FCAP-CORP/funded-capital. Nothing was published.";
  }
  if (status === 409 || status === 422) {
    return "GitHub refused the file because something changed at the same moment. Reload the page and press Publish again.";
  }
  if (status === 429 || status >= 500) {
    return `GitHub had a problem answering (error ${status}). Wait a minute and press Publish again. Nothing was published.`;
  }
  return `GitHub refused the request (error ${status}). Nothing was published. Send this message to Claude.`;
}

/** The sentence the button shows when it worked. */
export function successMessage(already: boolean): string {
  return already
    ? "This post was already sent to the site. It is live, or will be once the deploy finishes (about 2 minutes)."
    : "Published. The site is rebuilding now; the post will be live in about 2 minutes.";
}
