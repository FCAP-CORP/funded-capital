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
      date: data.date || "",
      updated: data.updated || data.date || "",
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
    date: data.date || "",
    updated: data.updated || data.date || "",
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
