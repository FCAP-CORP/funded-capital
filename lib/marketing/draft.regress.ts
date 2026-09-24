/**
 * Regression suite for what the queue API accepts as a blog draft.
 *
 * Section 2 is the one that matters. The path a draft carries is later written
 * to Luis's disk by a script. Every hostile shape below is refused HERE, so the
 * script is never handed one.
 */

import {
  DRAFT_DIR,
  MAX_DRAFT_BYTES,
  REQUIRED_FRONTMATTER,
  parseDraftPath,
  validateDraftBody,
} from "./draft";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};

const good = (slug: string) => `${DRAFT_DIR}${slug}.mdx`;

console.log("\n=== 1. A normal draft path is accepted ===");
const ok1 = parseDraftPath(good("hard-money-loan-rates"));
check("a plain slug passes", ok1.ok && ok1.value === "hard-money-loan-rates", ok1.ok ? ok1.value : ok1.error);
check("digits are allowed", parseDraftPath(good("70-percent-rule")).ok, "yes");
check("surrounding space is tolerated", parseDraftPath(`  ${good("brrrr-guide")}  `).ok, "trimmed");

console.log("\n=== 2. Nothing may escape content/blog ===");
const hostile: [string, unknown][] = [
  ["parent traversal", "content/blog/../../../etc/passwd"],
  ["traversal inside the name", "content/blog/..%2f..%2fetc.mdx"],
  ["a bare dot-dot", "../secrets.mdx"],
  ["absolute unix path", "/etc/cron.d/evil.mdx"],
  ["windows drive letter", "C:/Users/luis/evil.mdx"],
  ["windows drive with backslash", "C:\\Users\\luis\\evil.mdx"],
  ["backslash separator", "content\\blog\\post.mdx"],
  ["a different directory", "app/crm/actions.mdx"],
  ["the repo root", "package.json"],
  ["a nested directory", "content/blog/2026/post.mdx"],
  ["a dot-file", "content/blog/.env.mdx"],
  ["no extension", "content/blog/post"],
  ["wrong extension", "content/blog/post.ts"],
  ["double extension", "content/blog/post.mdx.bat"],
  ["uppercase in the slug", "content/blog/Post.mdx"],
  ["spaces in the slug", "content/blog/my post.mdx"],
  ["underscore in the slug", "content/blog/my_post.mdx"],
  ["a trailing hyphen", "content/blog/post-.mdx"],
  ["a leading hyphen", "content/blog/-post.mdx"],
  ["a double hyphen", "content/blog/my--post.mdx"],
  ["empty string", ""],
  ["whitespace only", "   "],
  ["a number", 42],
  ["null", null],
  ["undefined", undefined],
  ["an object", { path: "content/blog/post.mdx" }],
];
for (const [label, value] of hostile) {
  const r = parseDraftPath(value);
  check(`refuses ${label}`, !r.ok, r.ok ? `WRONGLY ACCEPTED as "${r.value}"` : "refused");
}
check("a 200+ character path is refused", !parseDraftPath(good("a".repeat(250))).ok, "refused");
check("a two-character slug is refused", !parseDraftPath(good("ab")).ok, "refused");
check("a three-character slug is accepted", parseDraftPath(good("abc")).ok, "accepted");

console.log("\n=== 3. The MDX itself ===");
const front = `---\ntitle: "A Post"\ndescription: "About something"\ndate: "2026-09-24"\ncategory: "Guides"\nauthor: "Luis Fajardo"\n---\n\n`;
const article = "Body text. ".repeat(60);
const okBody = validateDraftBody(front + article);
check("a well-formed draft passes", okBody.ok, okBody.ok ? `${okBody.value.bytes} bytes` : okBody.error);
check("CRLF is normalised to LF", okBody.ok && !okBody.value.body.includes("\r"), "normalised");

check("empty is refused", !validateDraftBody("").ok, "refused");
check("whitespace only is refused", !validateDraftBody("   ").ok, "refused");
check("a non-string is refused", !validateDraftBody(123).ok, "refused");
check("no opening fence is refused", !validateDraftBody("title: x\n\n" + article).ok, "refused");
check("an unclosed fence is refused", !validateDraftBody("---\ntitle: x\n\n" + article).ok, "refused");
check("frontmatter but no article is refused", !validateDraftBody(front + "Too short.").ok, "refused");

for (const key of REQUIRED_FRONTMATTER) {
  const stripped = front.replace(new RegExp(`^${key}:.*$\n`, "m"), "");
  const r = validateDraftBody(stripped + article);
  check(`refuses a draft missing "${key}"`, !r.ok, r.ok ? "WRONGLY ACCEPTED" : "refused");
}

const huge = front + "x".repeat(MAX_DRAFT_BYTES);
check("an oversized draft is refused", !validateDraftBody(huge).ok, "refused");
const justUnder = front + "y".repeat(MAX_DRAFT_BYTES - Buffer.byteLength(front, "utf8") - 10);
check("one just under the cap is accepted", validateDraftBody(justUnder).ok, "accepted");

// A key named in the BODY must not satisfy the frontmatter requirement.
const sneaky = `---\ntitle: "x"\ndescription: "x"\ndate: "2026-09-24"\ncategory: "x"\n---\n\nauthor: not really frontmatter\n\n` + article;
check("a key that appears only in the body does not count", !validateDraftBody(sneaky).ok, validateDraftBody(sneaky).ok ? "WRONGLY ACCEPTED" : "refused");

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail > 0 ? 1 : 0);
