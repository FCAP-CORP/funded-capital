/**
 * Regression suite for "is this blog request actually live?".
 *
 * The screen used to say "Draft ready" for a post that had been on the site for
 * a week, because publishing happens in publish-blog.bat and nothing tells the
 * table. These tests pin the rule that replaced the chore: the live site
 * decides, for drafted blog rows only, and nothing else moves.
 */

import { articleWordCount, draftSlug, effectiveStatus, safeHref, type PublishableRow } from "./published";
import type { ContentChannel, ContentStatus } from "./requests";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};

const NOW = "2026-09-24T12:00:00.000Z";
const LIVE = new Map<string, string>([
  ["hard-money-loan-credit-score", "2026-08-24"],
  ["dscr-loan-rates-2026", "2026-09-25"],
  ["post-with-no-date", ""],
]);

const row = (over: Partial<PublishableRow> & { channel?: ContentChannel; status?: ContentStatus } = {}): PublishableRow => ({
  channel: "blog",
  status: "drafted",
  draftUrl: "content/blog/hard-money-loan-credit-score.mdx",
  publishedAt: null,
  ...over,
});

console.log("\n=== 1. A drafted blog post that is live shows as published ===");
const live = effectiveStatus(row(), LIVE);
check("live slug → published", live.status === "published", live.status);
check("...with the post's own frontmatter date", live.publishedAt === "2026-08-24", String(live.publishedAt));
check("...and says the site decided, not the table", live.fromSite === true, String(live.fromSite));
check("...and carries the slug", live.slug === "hard-money-loan-credit-score", String(live.slug));
const spaced = effectiveStatus(row({ draftUrl: "  content/blog/dscr-loan-rates-2026.mdx  " }), LIVE);
check("a path with surrounding space still matches", spaced.status === "published" && spaced.publishedAt === "2026-09-25", spaced.status);
const undated = effectiveStatus(row({ draftUrl: "content/blog/post-with-no-date.mdx" }), LIVE);
check("a live post with no date is published with no date, not a fake one", undated.status === "published" && undated.publishedAt === null, String(undated.publishedAt));

console.log("\n=== 2. Not live → exactly what is stored ===");
const notLive = effectiveStatus(row({ draftUrl: "content/blog/not-written-yet.mdx" }), LIVE);
check("not live → drafted", notLive.status === "drafted", notLive.status);
check("...not marked as decided by the site", notLive.fromSite === false, String(notLive.fromSite));
check("...slug still known, so the page can show the path", notLive.slug === "not-written-yet", String(notLive.slug));
check("empty site → drafted", effectiveStatus(row(), new Map()).status === "drafted", "drafted");

console.log("\n=== 3. A malformed or missing path never matches ===");
const badPaths: [string, string | null][] = [
  ["missing", null],
  ["empty", ""],
  ["a bare slug, no directory", "hard-money-loan-credit-score"],
  ["a URL to the post", "https://www.fundedcapital.com/blog/hard-money-loan-credit-score"],
  ["traversal to the same name", "content/blog/../blog/hard-money-loan-credit-score.mdx"],
  ["backslashes", "content\\blog\\hard-money-loan-credit-score.mdx"],
  ["uppercase", "content/blog/Hard-Money-Loan-Credit-Score.mdx"],
  ["wrong extension", "content/blog/hard-money-loan-credit-score.md"],
];
for (const [label, draftUrl] of badPaths) {
  const e = effectiveStatus(row({ draftUrl }), LIVE);
  check(`  ${label} → stored status`, e.status === "drafted" && !e.fromSite && e.slug === null, `${e.status}, slug ${e.slug}`);
}

console.log("\n=== 4. LinkedIn and email are never touched ===");
for (const channel of ["linkedin", "email"] as const) {
  const e = effectiveStatus(row({ channel }), LIVE);
  check(`  ${channel} with a live-looking path stays drafted`, e.status === "drafted" && !e.fromSite, e.status);
  check(`  ${channel} has no blog slug`, draftSlug({ channel, draftUrl: "content/blog/hard-money-loan-credit-score.mdx" }) === null, "null");
  const pub = effectiveStatus(row({ channel, status: "published", publishedAt: NOW }), LIVE);
  check(`  ${channel} published keeps its stored date`, pub.status === "published" && pub.publishedAt === NOW && !pub.fromSite, String(pub.publishedAt));
}

console.log("\n=== 5. Only `drafted` is overridden ===");
const others: ContentStatus[] = ["requested", "in_progress", "failed", "cancelled"];
for (const status of others) {
  const e = effectiveStatus(row({ status }), LIVE);
  check(`  ${status} with a live slug stays ${status}`, e.status === status && !e.fromSite, e.status);
}
const stored = effectiveStatus(row({ status: "published", publishedAt: NOW }), LIVE);
check("already published keeps the stored timestamp, not the frontmatter date", stored.publishedAt === NOW && !stored.fromSite, String(stored.publishedAt));

console.log("\n=== 6. The input is not mutated ===");
const r = row();
const before = JSON.stringify(r);
effectiveStatus(r, LIVE);
check("the row object is unchanged", JSON.stringify(r) === before, "unchanged");

console.log("\n=== 7. Only http(s) becomes a link ===");
check("https passes", safeHref("https://mail.google.com/mail/#drafts") !== null, String(safeHref("https://mail.google.com/mail/#drafts")));
check("http passes", safeHref("http://example.com/x") !== null, "yes");
for (const bad of ["javascript:alert(1)", "JAVASCRIPT:alert(1)", " javascript:alert(1)", "data:text/html,hi", "content/blog/x.mdx", "/blog/x", "//evil.example/x", "", null, undefined]) {
  check(`  refuses ${JSON.stringify(bad)}`, safeHref(bad as string | null | undefined) === null, String(safeHref(bad as string | null | undefined)));
}

console.log("\n=== 8. Word count reads the article, not the frontmatter ===");
const mdx = `---\ntitle: "One two three"\ndescription: "four five"\n---\n\n## Heading here\n\nSix seven eight.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n---\n\nnine\n`;
// Heading(1) here(1) Six seven eight.(3) a b 1 2 (4) nine(1) = 10; "##", "|", "---" excluded.
check("counts article words only", articleWordCount(mdx) === 10, String(articleWordCount(mdx)));
check("CRLF counts the same", articleWordCount(mdx.replace(/\n/g, "\r\n")) === 10, String(articleWordCount(mdx.replace(/\n/g, "\r\n"))));
check("no frontmatter → counts everything", articleWordCount("just three words") === 3, "3");
check("unclosed frontmatter → 0, not the YAML", articleWordCount("---\ntitle: x\nno close") === 0, "0");
check("null → 0", articleWordCount(null) === 0, "0");

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail > 0 ? 1 : 0);
