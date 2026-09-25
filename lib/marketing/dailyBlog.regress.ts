/**
 * The daily blog cron's rules: picking, parsing and every check it runs before
 * a draft is allowed into the queue. Plain script, no framework:
 *   npx tsx lib/marketing/dailyBlog.regress.ts
 */

import {
  COMPLIANCE_LINE,
  PHONE,
  SYSTEM_RULES,
  bodyWordCount,
  buildBrief,
  checkOutput,
  draftedToday,
  newYorkDate,
  parseModelOutput,
  pickNextBlog,
  repairRequest,
  slugsFromSitemap,
  voiceProblems,
  type ModelOutput,
  type QueueItem,
} from "./dailyBlog";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail = "") => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}${detail ? `  ${detail}` : ""}`);
};

/* ------------------------------------------------------------ fixtures */

const TODAY = "2026-09-25";
const LIVE = ["hard-money-loan-document-checklist", "llc-real-estate-loan", "how-to-read-hard-money-term-sheet", "a", "b", "c", "d", "e", "f", "g"];

const sentence = "Investors who run the numbers before they call a lender close faster and argue less about terms. ";
const paragraph = sentence.repeat(8).trim();

function mdx(opts: { body?: string; date?: string; category?: string; faqCount?: number; extraBody?: string } = {}): string {
  const faqN = opts.faqCount ?? 4;
  const faq = Array.from({ length: faqN }, (_, i) => `  - q: "Question ${i + 1}?"\n    a: >-\n      Answer ${i + 1} in plain text.`).join("\n");
  const body =
    opts.body ??
    [
      "## Why this matters",
      "",
      Array.from({ length: 10 }, () => paragraph).join("\n\n"),
      "",
      "See the [document checklist](/blog/hard-money-loan-document-checklist) and run the [calculator](/calculator).",
      "",
      COMPLIANCE_LINE,
      "",
      `**Ready? [Apply Now](/apply) or call ${PHONE}.**`,
      opts.extraBody ?? "",
    ].join("\n");
  return `---
title: "A Test Post"
description: "A description long enough to pass the length check, written to sit between one hundred and fifty and one hundred and sixty characters."
date: "${opts.date ?? TODAY}"
updated: "${opts.date ?? TODAY}"
category: "${opts.category ?? "Brokers"}"
readTime: "8 min read"
author: "Luis Fajardo"
authorTitle: "Senior Sales Director, Funded Capital"
keywords:
  [
    "one",
    "two",
    "three",
    "four",
    "five",
  ]
faq:
${faq}
---

${body}
`;
}

const CAROUSEL = JSON.stringify({
  slides: [
    { t: "cover", eyebrow: "For brokers", h: "Know *which one* you are", s: "Three models." },
    { t: "big", n: "3", h: "Three questions decide it", gold: false },
    { t: "steps", h: "Ask these in order", steps: ["Whose name is on the note?", "Whose money funds it?"] },
    { t: "statement", h: "More income means more risk", gold: false },
    { t: "compare", h: "Brokering versus funding", left: { label: "Mistake", items: ["Guess", "Hope"] }, right: { label: "Instead", items: ["Ask", "Check"] } },
    { t: "cta", h: "Place your next deal", s: "Apply online.", site: "fundedcapital.com" },
  ],
});

function output(over: Partial<ModelOutput> = {}): ModelOutput {
  return {
    slug: "a-brand-new-post",
    summary: "What the post argues.",
    mdx: mdx(),
    carouselRaw: CAROUSEL,
    linkedin: `A hook line.\n\nThe point.\n\n${COMPLIANCE_LINE}\n\n#RealEstate\n\nFirst comment: https://www.fundedcapital.com/blog/a-brand-new-post`,
    ...over,
  };
}

/* ------------------------------------------------------------ picking */

console.log("\n=== 1. Picking the next request ===");
const item = (id: string, over: Partial<QueueItem> = {}): QueueItem => ({
  id, channel: "blog", topic: `Topic ${id}`, notes: null, status: "requested", requestedAt: `2026-09-2${id}T10:00:00Z`, ...over,
});
check("oldest requested blog wins", pickNextBlog([item("3"), item("1"), item("2")])?.id === "1");
check("in_progress is left alone", pickNextBlog([item("1", { status: "in_progress" }), item("2")])?.id === "2");
check("other channels are ignored", pickNextBlog([item("1", { channel: "linkedin" }), item("2")])?.id === "2");
check("nothing waiting returns null", pickNextBlog([item("1", { status: "drafted" })]) === null);

console.log("\n=== 2. Dates on the New York calendar ===");
check("11:00 UTC is the same day in New York", newYorkDate(new Date("2026-09-25T11:00:00Z")) === "2026-09-25");
check("02:00 UTC is still yesterday in New York", newYorkDate(new Date("2026-09-26T02:00:00Z")) === "2026-09-25");
check("a draft at 07:05 ET counts as today", draftedToday([{ draftedAt: "2026-09-25T11:05:00Z" }], TODAY));
check("yesterday's draft does not", !draftedToday([{ draftedAt: "2026-09-24T14:36:50Z" }], TODAY));
check("a null draftedAt does not", !draftedToday([{ draftedAt: null }], TODAY));

console.log("\n=== 3. The sitemap ===");
const xml = `<urlset><url><loc>https://www.fundedcapital.com/blog/llc-real-estate-loan</loc></url><url><loc>https://www.fundedcapital.com/dscr-loans</loc></url><url><loc>https://fundedcapital.com/blog/abc-1/</loc></url></urlset>`;
const slugs = slugsFromSitemap(xml);
check("blog slugs are extracted", slugs.includes("llc-real-estate-loan") && slugs.includes("abc-1"), slugs.join(","));
check("program pages are not blog slugs", !slugs.includes("dscr-loans"));

console.log("\n=== 4. The prompt carries the rules that went wrong before ===");
for (const must of ["45 states", "5-10 business days", "85% of full cost", "660+", "NEVER write a flat \"85% LTC\"", COMPLIANCE_LINE, "<mdx>", "<carousel>", "<linkedin>"]) {
  check(`system prompt says: ${must}`, SYSTEM_RULES.includes(must));
}
const brief = buildBrief({ topic: "The topic", notes: "The notes" }, TODAY, LIVE);
check("the brief carries topic, notes, date and live slugs", brief.includes("The topic") && brief.includes("The notes") && brief.includes(TODAY) && brief.includes("llc-real-estate-loan"));

console.log("\n=== 5. Parsing the reply ===");
const reply = `research notes\n<slug>x-y</slug>\n<summary>  a   line </summary>\n<mdx>\n${mdx()}\n</mdx>\n<carousel>${CAROUSEL}</carousel>\n<linkedin>cap</linkedin>`;
const p = parseModelOutput(reply);
check("all five blocks are found", p.ok);
check("summary whitespace is collapsed", p.ok && p.value.summary === "a line");
const partial = parseModelOutput("<slug>x</slug><mdx>y</mdx>");
check("missing blocks are named", !partial.ok && /summary, carousel, linkedin/.test(partial.error), partial.ok ? "" : partial.error);

console.log("\n=== 6. A good draft passes ===");
const good = checkOutput(output(), TODAY, LIVE);
check("clean output is accepted", good.ok, good.ok ? `${good.value.words} words` : good.problems.join(" | "));
check("...with its carousel parsed", good.ok && good.value.carousel !== null && good.value.carouselError === null, good.ok ? String(good.value.carouselError) : "");
check("...and draftUrl under content/blog", good.ok && good.value.draftUrl === "content/blog/a-brand-new-post.mdx");

console.log("\n=== 7. Every bad draft is refused, with a reason ===");
const refused = (name: string, o: ModelOutput, re: RegExp) => {
  const r = checkOutput(o, TODAY, LIVE);
  check(name, !r.ok && r.problems.some((x) => re.test(x)), r.ok ? "**ACCEPTED**" : r.problems.join(" | "));
};
refused("a slug that is already live", output({ slug: "llc-real-estate-loan" }), /already a live post/);
refused("a slug with capitals", output({ slug: "Bad-Slug" }), /slug:/);
refused("the wrong date", output({ mdx: mdx({ date: "2026-09-24" }) }), /date must be/);
refused("an unknown category", output({ mdx: mdx({ category: "Homebuyers" }) }), /category/);
refused("too few FAQ items", output({ mdx: mdx({ faqCount: 2 }) }), /faq/);
refused("a body that is too short", output({ mdx: mdx({ body: `${paragraph}\n\n${COMPLIANCE_LINE}\n\n[Apply Now](/apply) ${PHONE}` }) }), /words/);
refused("an FAQ section in the body", output({ mdx: mdx({ extraBody: "\n## FAQ\n\nQ and A." }) }), /FAQ section/);
refused("a link to a post that is not live", output({ mdx: mdx({ extraBody: "\nSee [this](/blog/does-not-exist)." }) }), /does-not-exist/);
refused("\"44 states\"", output({ mdx: mdx({ extraBody: "\nWe lend in 44 states." }) }), /44 states/);
refused("\"as little as 5 days\"", output({ mdx: mdx({ extraBody: "\nClose in as little as 5 days." }) }), /as little as 5 days/);
refused("\"85% LTC\"", output({ mdx: mdx({ extraBody: "\nUp to 85% LTC." }) }), /85% LTC/);
refused("a banned word", output({ mdx: mdx({ extraBody: "\nA seamless process." }) }), /seamless/);
refused("leverage as a verb", output({ mdx: mdx({ extraBody: "\nLeverage your equity." }) }), /leverage/);
refused("a banned word in the LinkedIn caption", output({ linkedin: "We are committed to you." }), /LinkedIn caption/);
refused("the compliance line twice", output({ mdx: mdx({ extraBody: `\n${COMPLIANCE_LINE}` }) }), /exactly once/);
refused("no phone number", output({ mdx: mdx().replace(PHONE, "") }), /305/);
refused("broken YAML", output({ mdx: mdx().replace('title: "A Test Post"', 'title: "A Test: Post') }), /YAML|title/);

console.log("\n=== 8. A bad carousel never blocks the post ===");
const noCarousel = checkOutput(output({ carouselRaw: "{not json" }), TODAY, LIVE);
check("invalid JSON: post accepted, carousel reported", noCarousel.ok && noCarousel.value.carousel === null && /JSON/.test(noCarousel.value.carouselError ?? ""));
const arrow = checkOutput(output({ carouselRaw: CAROUSEL.replace("Three models.", "Three → models.") }), TODAY, LIVE);
check("an arrow on a slide: post accepted, carousel refused", arrow.ok && arrow.value.carousel === null && !!arrow.value.carouselError, arrow.ok ? String(arrow.value.carouselError) : "");

console.log("\n=== 9. Small pieces ===");
check("word count ignores markdown and link targets", bodyWordCount("## Head\n\n[two words](/blog/x) and **bold**") === 5, String(bodyWordCount("## Head\n\n[two words](/blog/x) and **bold**")));
check("'leverage' as a noun is fine", voiceProblems("Ground-Up leverage reaches 90% of cost.").length === 0);
check("'solutions' is caught", voiceProblems("Lending solutions.").length === 1);
check("the repair message lists every problem", /- one\n- two/.test(repairRequest(["one", "two"])));

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail > 0 ? 1 : 0);
