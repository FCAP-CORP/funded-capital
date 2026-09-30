/**
 * Search-engine basics for the public site (30 Sep 2026):
 *   1. every public page declares its own canonical URL, and the root layout
 *      declares none (one there would make every page canonical to "/");
 *   2. no public page title contains "Funded Capital" — the root layout's
 *      template "%s | Funded Capital" already adds it, so a page that adds it
 *      again shows "... | Funded Capital | Funded Capital" in Google;
 *   3. the sitemap keeps the same URLs and dates each blog post by its own
 *      frontmatter instead of stamping everything with the build time.
 *
 * Plain script, no framework, no network:
 *   npx tsx lib/seo.regress.ts
 */

import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(__dirname, "..");

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail = "") => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}${detail ? `  ${detail}` : ""}`);
};

/**
 * Every public, indexable page and the canonical path it must declare.
 * A new public page belongs here AND in app/sitemap.ts; section 3 checks the
 * two lists agree. CRM, portal and sign-in pages are private and have none.
 */
const PUBLIC_PAGES: Record<string, string> = {
  "app/page.tsx": "/",
  "app/about/page.tsx": "/about",
  "app/how-it-works/page.tsx": "/how-it-works",
  "app/loan-programs/page.tsx": "/loan-programs",
  "app/why-us/page.tsx": "/why-us",
  "app/apply/page.tsx": "/apply",
  "app/broker-program/page.tsx": "/broker-program",
  "app/broker-program/register/page.tsx": "/broker-program/register",
  "app/privacy/page.tsx": "/privacy",
  "app/terms/page.tsx": "/terms",
  "app/blog/page.tsx": "/blog",
  "app/blog/[slug]/page.tsx": "/blog/${slug}",
  "app/fix-and-flip-loans/page.tsx": "/fix-and-flip-loans",
  "app/dscr-loans/page.tsx": "/dscr-loans",
  "app/new-construction-loans/page.tsx": "/new-construction-loans",
  "app/multifamily-loans/page.tsx": "/multifamily-loans",
  "app/contact/page.tsx": "/contact",
  "app/calculator/page.tsx": "/calculator",
};

/** Public but noindex: no canonical required, and it must stay out of the sitemap. */
const NOINDEX_PAGES = ["app/thank-you/page.tsx"];

/**
 * app/page.tsx sits in the SAME segment as the root layout, and Next applies
 * title.template only to child segments. So the home page's title is used as
 * written and must carry the brand itself.
 */
const TEMPLATE_EXEMPT = new Set(["app/page.tsx"]);

function read(rel: string): string {
  try {
    return readFileSync(join(ROOT, rel), "utf8");
  } catch {
    return "";
  }
}

/** The text of `export const metadata = {...}` or of generateMetadata, else "". */
function metadataBlock(src: string): string {
  const start = src.search(/export (const metadata\b|async function generateMetadata\b)/);
  if (start < 0) return "";
  const end = src.indexOf("\n}", start); // both forms close at column 0
  return end < 0 ? src.slice(start) : src.slice(start, end + 2);
}

/** Top-level `title: "..."` of a metadata block (nested openGraph titles are ignored). */
function topLevelTitle(block: string): string | null {
  const firstKey = /\n(\s+)[a-zA-Z]+:/.exec(block.slice(block.indexOf("{")));
  if (!firstKey) return null;
  const indent = firstKey[1];
  const m = new RegExp(`\\n${indent}title:\\s*(["\`])([^"\`]*)\\1`).exec(block);
  return m ? m[2] : null;
}

/* ------------------------------------------------------------ 1. canonicals */

console.log("\n=== 1. Every public page declares its own canonical ===");
for (const [file, path] of Object.entries(PUBLIC_PAGES)) {
  const block = metadataBlock(read(file));
  if (!block) {
    check(file, false, "**NO METADATA FOUND** (file moved? update PUBLIC_PAGES)");
    continue;
  }
  const m = /alternates:\s*\{\s*canonical:\s*(["`])([^"`]+)\1\s*,?\s*\}/.exec(block);
  check(`${file} -> ${path}`, !!m && m[2] === path, m ? m[2] : "**NO CANONICAL**");
}
for (const file of NOINDEX_PAGES) {
  const block = metadataBlock(read(file));
  check(`${file} stays noindex (so it needs no canonical)`, /robots:\s*\{\s*index:\s*false/.test(block), block ? "" : "**NO METADATA**");
}

const layout = metadataBlock(read("app/layout.tsx"));
check("the root layout declares NO canonical (it would point every page at /)", !!layout && !/canonical/.test(layout.replace(/\/\/.*$/gm, "")), "none");
check("the root layout's openGraph has no url (it would make every page's og:url the home page)",
  !!layout && !/\burl:/.test(layout.replace(/\/\/.*$/gm, "")), "none");
check("metadataBase is https://www.fundedcapital.com (relative canonicals resolve against it)",
  /metadataBase:\s*new URL\("https:\/\/www\.fundedcapital\.com\/?"\)/.test(layout));

/* ---------------------------------------------------------------- 2. titles */

console.log("\n=== 2. No public page title repeats the brand the template adds ===");
const rootTemplate = /template:\s*"([^"]*)"/.exec(layout)?.[1] ?? "";
check('the root layout template is "%s | Funded Capital"', rootTemplate === "%s | Funded Capital", rootTemplate);
for (const file of [...Object.keys(PUBLIC_PAGES), ...NOINDEX_PAGES]) {
  const block = metadataBlock(read(file));
  const title = topLevelTitle(block);
  if (TEMPLATE_EXEMPT.has(file)) {
    check(`${file} (not templated) names the brand itself`, !!title && title.includes("Funded Capital"), title ?? "**NO TITLE**");
    continue;
  }
  const absolute = /\n\s+title:\s*\{\s*absolute:\s*"([^"]*)"/.exec(block)?.[1];
  if (absolute !== undefined) {
    // `absolute` skips the template, so the page names the brand itself — once.
    check(`${file} absolute title names the brand exactly once`, (absolute.match(/Funded Capital/g) ?? []).length === 1, `"${absolute}"`);
    continue;
  }
  if (title === null) {
    // generateMetadata builds it from data; the literal must not add the brand.
    const line = /\n\s+title:([^\n]*)/.exec(block)?.[1] ?? "";
    check(`${file} title is computed and adds no brand`, !!line && !/Funded Capital/i.test(line), line.trim() || "**NO TITLE**");
    continue;
  }
  check(`${file} title has no "Funded Capital"`, !/Funded Capital/i.test(title), `"${title}"`);
}

/* --------------------------------------------------------------- 3. sitemap */

console.log("\n=== 3. The sitemap: same URLs, real dates only ===");

/** The 17 non-blog URLs the sitemap listed before 30 Sep 2026. Unchanged. */
const STATIC_URLS = [
  "/", "/fix-and-flip-loans", "/dscr-loans", "/new-construction-loans", "/multifamily-loans",
  "/loan-programs", "/apply", "/calculator", "/broker-program", "/broker-program/register",
  "/how-it-works", "/about", "/why-us", "/contact", "/privacy", "/terms", "/blog",
];

const FIXTURES: Record<string, string> = {
  // updated wins over date
  "with-updated.mdx": `---\ntitle: "A"\ndate: "2026-08-01"\nupdated: "2026-09-20"\n---\nBody.\n`,
  // no updated: the publish date
  "date-only.mdx": `---\ntitle: "B"\ndate: "2026-09-25"\n---\nBody.\n`,
  // unquoted: gray-matter returns a Date object
  "unquoted-date.mdx": `---\ntitle: "C"\ndate: 2026-07-04\n---\nBody.\n`,
  // no usable date: lastModified is left out, never invented
  "no-date.mdx": `---\ntitle: "D"\ndate: "sometime"\n---\nBody.\n`,
};

async function sitemapChecks() {
  const dir = mkdtempSync(join(tmpdir(), "fc-sitemap-"));
  const cwd = process.cwd();
  try {
    mkdirSync(join(dir, "content", "blog"), { recursive: true });
    for (const [name, body] of Object.entries(FIXTURES)) writeFileSync(join(dir, "content", "blog", name), body);
    writeFileSync(join(dir, "content", "blog", "not-a-post.txt"), "ignored");
    // lib/blog.ts resolves content/blog against the working directory when it loads.
    process.chdir(dir);
    const { default: sitemap } = await import("../app/sitemap");
    const entries = sitemap();
    const base = "https://www.fundedcapital.com";
    const urls = entries.map((e) => e.url.replace(base, "") || "/");
    const byUrl = new Map(entries.map((e) => [e.url.replace(base, "") || "/", e]));

    check("URL count is 17 static + one per post", entries.length === STATIC_URLS.length + Object.keys(FIXTURES).length, `${entries.length}`);
    check("every static URL is still there", STATIC_URLS.every((u) => urls.includes(u)), STATIC_URLS.filter((u) => !urls.includes(u)).join(", ") || "all 17");
    check("no URL is listed twice", new Set(urls).size === urls.length);
    check("thank-you is still left out", !urls.includes("/thank-you"));
    check("every URL is on www", entries.every((e) => e.url.startsWith(base)));

    const staticWithDate = STATIC_URLS.filter((u) => u !== "/blog" && byUrl.get(u)?.lastModified !== undefined);
    check("static pages carry no lastModified", staticWithDate.length === 0, staticWithDate.join(", ") || "none");
    check("a post with `updated` uses it", byUrl.get("/blog/with-updated")?.lastModified === "2026-09-20", String(byUrl.get("/blog/with-updated")?.lastModified));
    check("a post without `updated` uses its date", byUrl.get("/blog/date-only")?.lastModified === "2026-09-25", String(byUrl.get("/blog/date-only")?.lastModified));
    check("an unquoted YAML date still works", byUrl.get("/blog/unquoted-date")?.lastModified === "2026-07-04", String(byUrl.get("/blog/unquoted-date")?.lastModified));
    check("a post with no real date gets no lastModified", byUrl.get("/blog/no-date")?.lastModified === undefined, String(byUrl.get("/blog/no-date")?.lastModified));
    check("/blog carries the newest post's date", byUrl.get("/blog")?.lastModified === "2026-09-25", String(byUrl.get("/blog")?.lastModified));
    check("nothing is stamped with today's date", !entries.some((e) => String(e.lastModified ?? "").startsWith(new Date().toISOString().slice(0, 10)) && e.url !== `${base}/blog/date-only`));

    // The sitemap's static URLs and the canonical list are the same set of pages.
    const canon = Object.values(PUBLIC_PAGES).filter((p) => !p.includes("${"));
    const missing = canon.filter((p) => !STATIC_URLS.includes(p));
    const extra = STATIC_URLS.filter((p) => !canon.includes(p));
    check("every canonical page is in the sitemap and vice versa", !missing.length && !extra.length, [...missing, ...extra].join(", ") || "same 17");
  } finally {
    process.chdir(cwd);
    rmSync(dir, { recursive: true, force: true });
  }
}

sitemapChecks()
  .catch((e) => check("the sitemap could be built", false, String(e)))
  .finally(() => {
    console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
    process.exit(fail > 0 ? 1 : 0);
  });
