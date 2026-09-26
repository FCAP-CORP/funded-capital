/**
 * The daily blog, written by the website itself.
 *
 * WHY THIS MOVED INTO THE REPO (25 Sep 2026). The 7am blog was a scheduled
 * Claude task. It had to fetch the queue token out of a Drive file and send it
 * to /api/crm/content-queue. On 25 Sep the run's own safety check read that as
 * "an agent found a credential in a file and is sending it to a web address"
 * and refused. No post was written. The check was not wrong: from outside, that
 * IS what credential theft looks like, and it will keep refusing it on some
 * mornings and not others. The fix is for no agent to handle the token at all.
 *
 * So the job now runs as a Vercel cron (vercel.json → /api/cron/daily-blog).
 * Vercel sends CRON_SECRET, the route reads CONTENT_QUEUE_TOKEN and
 * ANTHROPIC_API_KEY from its own environment, and no secret ever leaves the
 * server. The route talks to the queue through the same HTTP API the task used,
 * so every validation and every status rule in queue.api.server.ts still
 * applies unchanged. It can claim, draft and fail. It still cannot publish.
 *
 * DELIBERATE REVERSAL, RECORDED. CLAUDE.md said "nothing in the Next.js app
 * calls a model" to keep an API key out of a public-facing service. Luis chose
 * to move the job here on 25 Sep 2026 after the scheduled-task version was
 * blocked. The key is read by exactly one route, which answers only to Vercel's
 * cron secret. It is never sent to a browser.
 *
 * THIS FILE IS PURE: the prompt, the parser and every check. No network, no
 * database, no filesystem. Every rule is pinned by dailyBlog.regress.ts.
 */

import matter from "gray-matter";
import { parseDraftPath, validateDraftBody } from "./draft";
import { parseCarouselSpec, type CarouselSpec } from "./carousel";

/* ------------------------------------------------------------ the queue */

export interface QueueItem {
  id: string;
  channel: string;
  topic: string;
  notes: string | null;
  status: string;
  requestedAt: string | null;
}

/**
 * The oldest blog request still waiting.
 *
 * `in_progress` is left alone on purpose: another run owns it, or it is stuck
 * and Luis retries it from /crm/marketing, where a stuck row is flagged.
 */
export function pickNextBlog(items: readonly QueueItem[]): QueueItem | null {
  const waiting = items
    .filter((i) => i.channel === "blog" && i.status === "requested")
    .sort((a, b) => (a.requestedAt ?? "").localeCompare(b.requestedAt ?? ""));
  return waiting[0] ?? null;
}

/** Today's date on the New York calendar, "YYYY-MM-DD". Posts are dated in Eastern time. */
export function newYorkDate(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parts; // en-CA formats as YYYY-MM-DD
}

/**
 * Was a blog draft already delivered today? Vercel may invoke a cron more than
 * once for the same schedule, and two posts in one morning is not the cadence.
 */
export function draftedToday(drafts: readonly { draftedAt: string | null }[], today: string): boolean {
  return drafts.some((d) => d.draftedAt !== null && newYorkDate(new Date(d.draftedAt)) === today);
}

/** Every /blog/<slug> in the live sitemap. */
export function slugsFromSitemap(xml: string): string[] {
  const out = new Set<string>();
  for (const m of xml.matchAll(/<loc>\s*https?:\/\/[^<]*?\/blog\/([a-z0-9-]+)\/?\s*<\/loc>/g)) out.add(m[1]);
  return [...out].sort();
}

/* ------------------------------------------------------------ the rules */

export const CATEGORIES = [
  "Hard Money Loans",
  "Fix & Flip",
  "DSCR Loans",
  "New Construction",
  "Multifamily",
  "BRRRR Strategy",
  "Brokers",
] as const;

export const WORDS_MIN = 1200;
export const WORDS_MAX = 1800;

/** Distinct links to other Funded Capital posts every draft must carry. */
export const MIN_INTERNAL_LINKS = 2;

/**
 * A run of this many words appearing twice in one paragraph is a pasted
 * repeat, not style. Found on the first cron draft (25 Sep 2026): one sentence about value
 * appeals was written out twice back to back, and nothing caught it.
 */
export const REPEAT_WORDS = 7;

/** Words the brand voice bans outright. Matched as whole words, case-insensitive. */
export const BANNED_PHRASES = [
  "committed to",
  "dedicated to",
  "passionate about",
  "seamless",
  "seamlessly",
  "synergy",
  "robust",
  "solution",
  "solutions",
  "utilize",
  "utilizes",
  "utilizing",
] as const;

/** Figures that were wrong before and must never come back. */
export const FORBIDDEN_STRINGS = ["44 states", "as little as 5 days", "680 floor", "85% LTC"] as const;

export const COMPLIANCE_LINE = "Terms are subject to underwriting, appraisal, title, and insurance.";
export const PHONE = "(305) 857-5620";

export const PROGRAM_PAGES = [
  "/fix-and-flip-loans",
  "/dscr-loans",
  "/new-construction-loans",
  "/apply",
  "/calculator",
] as const;

/**
 * The system prompt. Everything here was in the scheduled task's prompt and is
 * current as of 23 Sep 2026; the brand voice guide is appended at run time.
 */
export const SYSTEM_RULES = `You are the Lead Performance Architect for Funded Capital, an asset-based lender to real estate investors (fix & flip, ground-up construction, DSCR rental, bridge). You write one blog post from a brief. A person reviews and publishes it later. Audience: real estate investors and the brokers who serve them. Never homebuyers.

RESEARCH FIRST with the web_search tool. Never invent a figure. Cite every rate, market statistic, regulation or dated claim with its source and publication date in the prose ("according to ..., published ...").
- Write every sentence yourself. Never paste a search result's wording; paraphrase it and quote only a short phrase in quotation marks when the exact words matter.
- Credit each claim to ONE source, the one you actually read, in the same sentence. Never start a sentence with one source and end it with another.
- Read the finished post once for repeated sentences and remove them.

NUMBERS, current as of 23 Sep 2026. Do not copy figures from older posts.
- Ground-Up leverage: 85% of full cost (purchase + sunk costs + remaining budget) as standard; 90% for builders with five or more completed ground-up projects; a further 5% of cost on top of either finances the interest reserve, so an experienced builder reaches 95% all-in with the reserve financed. After-repair loan-to-value is a second cap and the lower one governs. NEVER write a flat "85% LTC" for ground-up.
- Fix & Flip from 8.75%. DSCR from 6.0%. Rate RANGES only, never a guarantee.
- Credit: most programs 660+, best tiers 680+, 640-659 case-by-case. Never a hard "680 floor".
- Coverage: 45 states, excluded VT, UT, OR, SD, ND. Never "44 states".
- Closing: "5-10 business days". Never "as little as 5 days".
- Include exactly once: "${COMPLIANCE_LINE}"
- Never state an unverified Funded Capital figure (no "term sheet in 2 hours", no broker commission percentage) and never invent a Funded Capital program or policy.

BRAND: investor-to-investor, lead with numbers, short sentences. Banned words: ${BANNED_PHRASES.join(", ")}, and "leverage" used as a verb. Plain English a first-deal investor understands and a pro respects.

FORMAT
- Frontmatter, exactly this shape (same keys, order, quoting, YAML style):
---
title: "..."
description: "... 150-160 characters ..."
date: "YYYY-MM-DD"
updated: "YYYY-MM-DD"
category: "..."
readTime: "N min read"
author: "Luis Fajardo"
authorTitle: "Senior Sales Director, Funded Capital"
keywords:
  [
    "keyword one",
    "keyword two",
  ]
faq:
  - q: "Question?"
    a: >-
      Plain-text answer.
---
- date and updated are the date given in the brief. category is one of: ${CATEGORIES.join(", ")}. keywords: 5 to 8. faq: 4 to 6 items, plain text. The site renders the faq and emits FAQPage JSON-LD from it, so do NOT write an FAQ section in the body.
- Body ${WORDS_MIN}-${WORDS_MAX} words, markdown with ## headings. Tables allowed.
- Link to at least ${MIN_INTERNAL_LINKS} different posts from the list of live posts you are given, as /blog/<slug>, where they genuinely help the reader. Link only to those posts and to program pages: ${PROGRAM_PAGES.join(", ")}.
- End with an Apply Now CTA linking /apply and the phone number ${PHONE}.
- Slug: lowercase letters, digits and single hyphens, 3-120 characters, NOT one of the live slugs.

CAROUSEL: a LinkedIn carousel of 6 to 8 slides as JSON {"slides":[...]}. First slide "cover", last "cta", neither elsewhere. At least two different types from: big, stats, bars, steps, compare. Shapes (limits are characters):
{"t":"cover","eyebrow":"<=48","h":"<=80","s":"<=200"}
{"t":"big","eyebrow":"<=48","n":"<=12","h":"<=90","s":"<=200","gold":false}
{"t":"stats","h":"<=90","stats":[{"n":"<=12","label":"<=60"}]}  (2 to 4)
{"t":"bars","h":"<=90","rows":[{"label":"<=40","value":55,"text":"55%","best":true}],"cap":"<=160 REQUIRED source and date"}  (2 to 6 rows)
{"t":"steps","h":"<=90","steps":["<=110"]}  (2 to 5)
{"t":"list","h":"<=90","items":["<=80"],"tone":"bad" or "good"}  (2 to 5)
{"t":"compare","h":"<=90","left":{"label":"<=40","items":["<=50"]},"right":{"label":"<=40","items":["<=50"]}}  (2 to 4 a side; left is the mistake)
{"t":"statement","h":"<=90","s":"<=200","gold":false}
{"t":"cta","eyebrow":"<=48","h":"<=90","s":"<=200","site":"fundedcapital.com"}
Any slide may carry "eyebrow" and "cap" (<=160). Never put a space before punctuation. Wrap one to three headline words in *stars* to colour them gold, on the cover and at most two other slides. Plain Latin characters only: no arrows, no approx sign, no check marks, no emoji. Every number on a slide must appear in the post; mark illustrative numbers "Illustrative." in the cap. No compliance line on slides.

LINKEDIN CAPTION for Luis's personal profile: 120-220 words, a hook first line, short lines, one question to invite comments, the compliance line "${COMPLIANCE_LINE}" once, 3-5 hashtags. No link in the caption. End with a line "First comment: https://www.fundedcapital.com/blog/<slug>".

OUTPUT: after your research, reply with exactly these five blocks and nothing else:
<slug>the-slug</slug>
<summary>one line, under 200 characters: what the post argues</summary>
<mdx>
the complete MDX, frontmatter included
</mdx>
<carousel>
{"slides":[...]}
</carousel>
<linkedin>
the caption
</linkedin>`;

/** The per-run message: the brief, today's date and the posts that may be linked. */
export function buildBrief(item: Pick<QueueItem, "topic" | "notes">, today: string, liveSlugs: readonly string[]): string {
  const notes = (item.notes ?? "").trim();
  return [
    `Today is ${today}. Use it for date and updated.`,
    ``,
    `THE BRIEF (Luis wrote this; follow it):`,
    `Topic: ${item.topic}`,
    notes ? `Notes: ${notes}` : `Notes: none`,
    ``,
    `LIVE POSTS you may link to as /blog/<slug> (your own slug must not be one of these):`,
    liveSlugs.join("\n"),
  ].join("\n");
}

/* ---------------------------------------------------------- the output */

export interface ModelOutput {
  slug: string;
  summary: string;
  mdx: string;
  carouselRaw: string;
  linkedin: string;
}

function block(text: string, tag: string): string | null {
  const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(text);
  return m ? m[1].trim() : null;
}

/** Pull the five blocks out of the model's reply. Names what is missing. */
export function parseModelOutput(text: string): { ok: true; value: ModelOutput } | { ok: false; error: string } {
  const slug = block(text, "slug");
  const summary = block(text, "summary");
  const mdx = block(text, "mdx");
  const carouselRaw = block(text, "carousel");
  const linkedin = block(text, "linkedin");
  const missing = [
    ["slug", slug],
    ["summary", summary],
    ["mdx", mdx],
    ["carousel", carouselRaw],
    ["linkedin", linkedin],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) return { ok: false, error: `The reply is missing: ${missing.join(", ")}.` };
  return {
    ok: true,
    value: {
      slug: slug!,
      summary: summary!.replace(/\s+/g, " ").slice(0, 200),
      mdx: mdx!.replace(/\r\n/g, "\n") + "\n",
      carouselRaw: carouselRaw!,
      linkedin: linkedin!,
    },
  };
}

/** Words in the article body, frontmatter excluded, markdown syntax ignored. */
export function bodyWordCount(body: string): number {
  const text = body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_|`~-]+/g, " ");
  return text.split(/\s+/).filter((w) => /[A-Za-z0-9$%]/.test(w)).length;
}

/**
 * Word runs of REPEAT_WORDS or more that occur twice inside ONE paragraph.
 *
 * Why a paragraph and not the whole post: a good post legitimately restates a
 * rule it explained earlier ("5-10 business days once the file is complete"
 * appears in two sections of a live post), and a post-wide check flagged six
 * of eight published posts. The real failure is a sentence pasted twice in the
 * same place, which is exactly what this finds. Case and punctuation are
 * ignored; tables are skipped.
 */
export function repeatedPassages(body: string, n = REPEAT_WORDS): string[] {
  const out: string[] = [];
  for (const para of body.split(/\n\s*\n/)) {
    if (para.trim().startsWith("|")) continue;
    const words = para
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .toLowerCase()
      .replace(/[^a-z0-9$%' ]+/g, " ")
      .split(/\s+/)
      .filter(Boolean);
    const seen = new Map<string, number>();
    let skipUntil = -1; // one report per repeated stretch, not one per shifted window
    for (let i = 0; i + n <= words.length; i++) {
      const key = words.slice(i, i + n).join(" ");
      const first = seen.get(key);
      if (first === undefined) seen.set(key, i);
      else if (i - first >= n && i > skipUntil) {
        out.push(key);
        skipUntil = i + n;
      }
    }
  }
  return out;
}

/** Distinct /blog/<slug> links in a body. */
export function internalLinks(body: string): string[] {
  return [...new Set([...body.matchAll(/\]\(\/blog\/([a-z0-9-]+)\/?[)#?]/g)].map((m) => m[1]))];
}

/** Slide text with a space before punctuation ("Low ."), which reads as a typo on a slide. */
export function spaceBeforePunctuation(raw: string): boolean {
  try {
    const walk = (v: unknown): boolean =>
      typeof v === "string"
        ? /\s[.,!?;:]/.test(v.replace(/\*/g, ""))
        : Array.isArray(v)
          ? v.some(walk)
          : v !== null && typeof v === "object"
            ? Object.values(v as Record<string, unknown>).some(walk)
            : false;
    return walk(JSON.parse(raw));
  } catch {
    return false;
  }
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Banned brand-voice words and forbidden figures found anywhere in a text. */
export function voiceProblems(text: string): string[] {
  const out: string[] = [];
  for (const p of BANNED_PHRASES) {
    if (new RegExp(`\\b${escapeRe(p)}\\b`, "i").test(text)) out.push(`uses the banned word "${p}"`);
  }
  if (/\bleverag(e|es|ed|ing)\s+(your|their|our|his|her|its|the|a|an|this|that|these|those|it|them)\b/i.test(text)) {
    out.push(`uses "leverage" as a verb`);
  }
  for (const f of FORBIDDEN_STRINGS) {
    if (text.toLowerCase().includes(f.toLowerCase())) out.push(`contains the forbidden figure "${f}"`);
  }
  return out;
}

export interface CheckedDraft {
  slug: string;
  draftUrl: string;
  mdx: string;
  words: number;
  carousel: CarouselSpec | null;
  carouselError: string | null;
}

/**
 * Everything the old task checked in its sandbox before sending, now checked in
 * code. Returns every problem at once, so one repair round can fix them all.
 * The carousel is checked but never blocks the post: a bad carousel costs a
 * slide deck, a bad post costs the day.
 */
export function checkOutput(
  out: ModelOutput,
  today: string,
  liveSlugs: readonly string[],
): { ok: true; value: CheckedDraft } | { ok: false; problems: string[] } {
  const problems: string[] = [];

  const draftUrl = `content/blog/${out.slug}.mdx`;
  const path = parseDraftPath(draftUrl);
  if (!path.ok) problems.push(`slug: ${path.error}`);
  if (liveSlugs.includes(out.slug)) problems.push(`slug: "${out.slug}" is already a live post; choose another`);

  const shape = validateDraftBody(out.mdx);
  if (!shape.ok) problems.push(`mdx: ${shape.error}`);

  let data: Record<string, unknown> = {};
  let body = "";
  try {
    const parsed = matter(out.mdx);
    data = parsed.data as Record<string, unknown>;
    body = parsed.content;
  } catch (e) {
    problems.push(`frontmatter: not valid YAML (${(e as Error).message.split("\n")[0]})`);
  }

  if (shape.ok && body) {
    for (const k of ["title", "description", "date", "updated", "category", "readTime", "author", "authorTitle"]) {
      if (typeof data[k] !== "string" || !(data[k] as string).trim()) problems.push(`frontmatter: "${k}" is missing or not a quoted string`);
    }
    if (data.date !== today) problems.push(`frontmatter: date must be "${today}"`);
    if (data.updated !== today) problems.push(`frontmatter: updated must be "${today}"`);
    if (typeof data.category === "string" && !(CATEGORIES as readonly string[]).includes(data.category)) {
      problems.push(`frontmatter: category must be one of ${CATEGORIES.join(", ")}`);
    }
    if (data.author !== "Luis Fajardo") problems.push(`frontmatter: author must be "Luis Fajardo"`);
    const desc = typeof data.description === "string" ? data.description.length : 0;
    if (desc && (desc < 120 || desc > 170)) problems.push(`frontmatter: description is ${desc} characters; aim for 150-160`);
    const kw = data.keywords;
    if (!Array.isArray(kw) || kw.length < 5 || kw.length > 8 || !kw.every((k) => typeof k === "string")) {
      problems.push("frontmatter: keywords must be a list of 5 to 8 strings");
    }
    const faq = data.faq;
    if (
      !Array.isArray(faq) ||
      faq.length < 4 ||
      faq.length > 6 ||
      !faq.every((f) => f && typeof f.q === "string" && typeof f.a === "string" && f.q.trim() && f.a.trim())
    ) {
      problems.push("frontmatter: faq must be 4 to 6 items, each with q and a");
    }

    const words = bodyWordCount(body);
    if (words < WORDS_MIN || words > WORDS_MAX) problems.push(`body: ${words} words; it must be ${WORDS_MIN}-${WORDS_MAX}`);

    if (/^#{1,6}\s*(faq|frequently asked)/im.test(body)) {
      problems.push("body: has an FAQ section; the faq belongs only in the frontmatter");
    }

    const compliance = out.mdx.split(COMPLIANCE_LINE).length - 1;
    if (compliance !== 1) problems.push(`the compliance line must appear exactly once (found ${compliance})`);
    if (!out.mdx.includes(PHONE)) problems.push(`the closing CTA must include ${PHONE}`);
    if (!/\]\(\/apply\)/.test(body)) problems.push("the closing CTA must link to /apply");

    const dead = [...body.matchAll(/\]\(\/blog\/([^)#?\s]+)[^)]*\)/g)]
      .map((m) => m[1].replace(/\/$/, ""))
      .filter((s) => !liveSlugs.includes(s));
    if (dead.length) problems.push(`links: not live posts, remove or replace: ${[...new Set(dead)].join(", ")}`);

    const linked = internalLinks(body).filter((s) => liveSlugs.includes(s));
    if (linked.length < MIN_INTERNAL_LINKS) {
      problems.push(`links: link to at least ${MIN_INTERNAL_LINKS} different live posts as /blog/<slug> (found ${linked.length})`);
    }

    for (const r of repeatedPassages(body)) {
      problems.push(`body: this passage appears twice; keep it once: "${r}"`);
    }
  }

  problems.push(...voiceProblems(out.mdx).map((p) => `post ${p}`));
  problems.push(...voiceProblems(out.linkedin).map((p) => `LinkedIn caption ${p}`));

  if (problems.length) return { ok: false, problems };

  let carousel: CarouselSpec | null = null;
  let carouselError: string | null = null;
  try {
    const spec = parseCarouselSpec(JSON.parse(out.carouselRaw));
    if (!spec.ok) carouselError = spec.error;
    else if (spaceBeforePunctuation(out.carouselRaw)) carouselError = "A slide has a space before punctuation (like \"Low .\"); remove it.";
    else carousel = spec.value;
  } catch {
    carouselError = "The carousel is not valid JSON.";
  }

  return {
    ok: true,
    value: {
      slug: out.slug,
      draftUrl,
      mdx: out.mdx,
      words: bodyWordCount(body),
      carousel,
      carouselError,
    },
  };
}

/** The follow-up message when a draft fails the checks: fix these, send everything again. */
export function repairRequest(problems: readonly string[]): string {
  return [
    "Your reply failed these checks. Fix every one, change nothing else that was fine, and reply again with all five blocks in full:",
    ...problems.map((p) => `- ${p}`),
  ].join("\n");
}
