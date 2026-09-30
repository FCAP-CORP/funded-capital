import fs from "fs";
import path from "path";
import matter from "gray-matter";

const postsDirectory = path.join(process.cwd(), "content/blog");

export interface FaqItem {
  q: string;
  a: string;
}

export interface PostMeta {
  slug: string;
  title: string;
  description: string;
  date: string;
  /** Last substantive update; falls back to date. Feeds dateModified in JSON-LD. */
  updated: string;
  category: string;
  readTime: string;
  keywords: string[];
  author: string;
  authorTitle: string;
}

export const DEFAULT_AUTHOR = "Luis Fajardo";
export const DEFAULT_AUTHOR_TITLE = "Senior Sales Director, Funded Capital";

export interface Post extends PostMeta {
  content: string;
  faq: FaqItem[];
}

/**
 * A frontmatter date as "YYYY-MM-DD". Every post quotes its dates today, but an
 * unquoted `date: 2026-09-25` makes gray-matter hand back a Date object, which
 * would slip through as a "string" and break sorting and the sitemap.
 */
function dateString(v: unknown): string {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  return typeof v === "string" ? v.trim() : "";
}

/**
 * When a post last really changed, for the sitemap's <lastmod>: `updated` when
 * the frontmatter has one, else the publish date. Undefined when neither is a
 * real calendar date, so the sitemap omits the field rather than inventing one.
 * (Search engines stop trusting a lastmod that changes on every deploy.)
 */
export function postLastModified(post: Pick<PostMeta, "date" | "updated">): string | undefined {
  for (const d of [post.updated, post.date]) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      const t = new Date(`${d}T00:00:00Z`);
      if (!Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d) return d;
    }
  }
  return undefined;
}

function normalizeFaq(raw: unknown): FaqItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (item): item is { q: string; a: string } =>
        !!item && typeof item.q === "string" && typeof item.a === "string"
    )
    .map((item) => ({ q: item.q.trim(), a: item.a.trim() }));
}

export function getAllPosts(): PostMeta[] {
  if (!fs.existsSync(postsDirectory)) return [];
  const fileNames = fs.readdirSync(postsDirectory).filter((f) => f.endsWith(".mdx"));
  const posts = fileNames.map((fileName) => {
    const slug = fileName.replace(/\.mdx$/, "");
    const fullPath = path.join(postsDirectory, fileName);
    const fileContents = fs.readFileSync(fullPath, "utf8");
    const { data } = matter(fileContents);
    return {
      slug,
      title: data.title || "",
      description: data.description || "",
      date: dateString(data.date),
      updated: dateString(data.updated) || dateString(data.date),
      category: data.category || "General",
      readTime: data.readTime || "5 min read",
      keywords: data.keywords || [],
      author: data.author || DEFAULT_AUTHOR,
      authorTitle: data.authorTitle || DEFAULT_AUTHOR_TITLE,
    } as PostMeta;
  });
  return posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getPostBySlug(slug: string): Post | null {
  const fullPath = path.join(postsDirectory, `${slug}.mdx`);
  if (!fs.existsSync(fullPath)) return null;
  const fileContents = fs.readFileSync(fullPath, "utf8");
  const { data, content } = matter(fileContents);
  return {
    slug,
    title: data.title || "",
    description: data.description || "",
    date: dateString(data.date),
    updated: dateString(data.updated) || dateString(data.date),
    category: data.category || "General",
    readTime: data.readTime || "5 min read",
    keywords: data.keywords || [],
    author: data.author || DEFAULT_AUTHOR,
    authorTitle: data.authorTitle || DEFAULT_AUTHOR_TITLE,
    faq: normalizeFaq(data.faq),
    content,
  };
}

export function getAllSlugs(): string[] {
  if (!fs.existsSync(postsDirectory)) return [];
  return fs
    .readdirSync(postsDirectory)
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => f.replace(/\.mdx$/, ""));
}
