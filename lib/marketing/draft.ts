/**
 * What the queue API will accept as a finished blog draft.
 *
 * Pure — no database, no filesystem — so every rule is pinned by
 * lib/marketing/draft.regress.ts.
 *
 * WHY THIS IS STRICTER THAN IT LOOKS. The path a draft carries is later
 * written to Luis's disk by a script he double-clicks. A path is therefore not
 * a label, it is an instruction to create a file somewhere, and the only safe
 * assumption is that whatever produced it may be wrong. Validating here means
 * the dangerous value never reaches the database, so the script cannot be
 * handed one later.
 */

/** An MDX post runs 9-20 KB. A quarter of a megabyte is already absurd. */
export const MAX_DRAFT_BYTES = 262_144;

/** The only directory a draft may claim. */
export const DRAFT_DIR = "content/blog/";

/** Frontmatter keys the site needs to render a post at all. */
export const REQUIRED_FRONTMATTER = [
  "title",
  "description",
  "date",
  "category",
  "author",
] as const;

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Validate `content/blog/<slug>.mdx` and return the slug.
 *
 * Rejects anything that is not exactly that shape. No absolute paths, no drive
 * letters, no `..`, no backslashes, no nested directories, no dot-files, no
 * second extension. The slug itself is lowercase letters, digits and single
 * hyphens — the same alphabet the site's routes already use, so a slug that
 * passes here is one the blog can actually serve.
 */
export function parseDraftPath(input: unknown): Checked<string> {
  if (typeof input !== "string" || !input.trim()) {
    return { ok: false, error: "A draft must say where it belongs." };
  }
  const path = input.trim();

  if (path.length > 200) return { ok: false, error: "That path is too long." };
  if (path.includes("\\")) return { ok: false, error: "Use forward slashes." };
  if (path.includes("..")) return { ok: false, error: "A path may not contain '..'." };
  if (path.startsWith("/") || /^[A-Za-z]:/.test(path)) {
    return { ok: false, error: "A path must be relative to the repository." };
  }
  if (!path.startsWith(DRAFT_DIR)) {
    return { ok: false, error: `A blog draft must live in ${DRAFT_DIR}.` };
  }

  const file = path.slice(DRAFT_DIR.length);
  if (!file.endsWith(".mdx")) return { ok: false, error: "A blog draft must be a .mdx file." };

  const slug = file.slice(0, -".mdx".length);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    return {
      ok: false,
      error: "A slug may only contain lowercase letters, numbers and single hyphens.",
    };
  }
  if (slug.length < 3 || slug.length > 120) {
    return { ok: false, error: "A slug must be between 3 and 120 characters." };
  }
  return { ok: true, value: slug };
}

export interface DraftBody {
  body: string;
  bytes: number;
}

/**
 * Validate the MDX itself.
 *
 * A structural check, not a parse: the fences must be there, the frontmatter
 * must name the keys the site needs, and the whole thing must be a sane size.
 * Deep YAML validation stays in the task, which already parses with
 * yaml.safe_load before it sends anything. Duplicating that here would be a
 * second implementation of a rule that must agree with the first.
 */
export function validateDraftBody(input: unknown): Checked<DraftBody> {
  if (typeof input !== "string" || !input.trim()) {
    return { ok: false, error: "The draft is empty." };
  }
  const body = input.replace(/\r\n/g, "\n");
  const bytes = Buffer.byteLength(body, "utf8");
  if (bytes > MAX_DRAFT_BYTES) {
    return { ok: false, error: `A draft must be under ${Math.floor(MAX_DRAFT_BYTES / 1024)} KB.` };
  }
  if (!body.startsWith("---\n")) {
    return { ok: false, error: "A draft must open with a frontmatter fence." };
  }
  const end = body.indexOf("\n---", 3);
  if (end === -1) return { ok: false, error: "The frontmatter fence is never closed." };

  const front = body.slice(4, end);
  const missing = REQUIRED_FRONTMATTER.filter(
    (k) => !new RegExp(`^${k}:`, "m").test(front),
  );
  if (missing.length) {
    return { ok: false, error: `The frontmatter is missing: ${missing.join(", ")}.` };
  }

  const article = body.slice(end + 4).trim();
  if (article.length < 500) {
    return { ok: false, error: "The draft has frontmatter but almost no article." };
  }
  return { ok: true, value: { body, bytes } };
}
