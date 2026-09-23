/**
 * Regression suite for the marketing request rules.
 *
 * The rule that matters most here is not the status machine — it is the pair of
 * claims the screen makes out loud: how long a channel has been quiet, and
 * whether the portal is entitled to say so. Getting the first wrong is the bug
 * this feature exists to prevent. Getting the second wrong means the screen
 * reports a confident silence it has no history to support.
 */

import {
  CHANNELS,
  CHANNEL_SPEC,
  NOTES_MAX,
  STUCK_AFTER_HOURS,
  TOPIC_MAX,
  TOPIC_MIN,
  cadenceFor,
  canTransition,
  isContentChannel,
  isPending,
  isSettled,
  pendingRequests,
  stuckRequests,
  validateRequest,
  type ContentStatus,
  type TrackedRequest,
} from "./requests";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};

const NOW = new Date("2026-09-23T12:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const hoursAgo = (n: number) => new Date(NOW.getTime() - n * 3_600_000).toISOString();

/* ---------------------------------------------------------------- channels */

console.log("\n=== 1. Only the blog can publish itself ===");

check("blog auto-publishes", CHANNEL_SPEC.blog.autoPublishes, "yes");
// If either of these ever flips to true, something must actually be able to post
// on LinkedIn or send from Klaviyo — and nothing here can.
check("LinkedIn does NOT", !CHANNEL_SPEC.linkedin.autoPublishes, "correct");
check("email does NOT", !CHANNEL_SPEC.email.autoPublishes, "correct");
check("only the blog has an archive outside this table", CHANNELS.filter((c) => CHANNEL_SPEC[c].hasArchive).join(",") === "blog", CHANNELS.filter((c) => CHANNEL_SPEC[c].hasArchive).join(","));
check("every channel says what it produces", CHANNELS.every((c) => CHANNEL_SPEC[c].produces.length > 5), "all present");
check("every channel says what published means", CHANNELS.every((c) => CHANNEL_SPEC[c].publishedMeans.length > 5), "all present");
check("isContentChannel accepts the three", CHANNELS.every(isContentChannel), "yes");
check("...and rejects anything else", !isContentChannel("tiktok") && !isContentChannel(""), "rejected");

/* ---------------------------------------------------------------- statuses */

console.log("\n=== 2. The status machine only allows real moves ===");

const legal: [ContentStatus, ContentStatus][] = [
  ["requested", "in_progress"],
  ["in_progress", "drafted"],
  ["drafted", "published"],
  ["drafted", "in_progress"],     // a redo
  ["failed", "requested"],        // a retry keeps the brief
  ["requested", "cancelled"],
  ["in_progress", "failed"],
];
for (const [from, to] of legal) {
  check(`  ${from} -> ${to}`, canTransition(from, to), "allowed");
}

const illegal: [ContentStatus, ContentStatus][] = [
  ["requested", "published"],     // nothing may skip being written
  ["requested", "drafted"],
  ["published", "requested"],     // published is the end
  ["published", "cancelled"],
  ["cancelled", "requested"],
  ["cancelled", "in_progress"],
];
for (const [from, to] of illegal) {
  check(`  ${from} -> ${to}`, !canTransition(from, to), "refused");
}

check("published is settled", isSettled("published"), "yes");
check("cancelled is settled", isSettled("cancelled"), "yes");
check("failed is NOT settled — it can be retried", !isSettled("failed"), "correct");
check("requested is pending", isPending("requested"), "yes");
check("in_progress is pending", isPending("in_progress"), "yes");
check("drafted is NOT pending — it waits on a person", !isPending("drafted"), "correct");

/* -------------------------------------------------------------- validation */

console.log("\n=== 3. A topic is a brief, not a label ===");

const good = validateRequest("blog", "  How   DSCR ratios are actually calculated  ", " keep it under 900 words ");
check("a real topic passes", good.ok, good.ok ? "ok" : good.error);
check("...whitespace is collapsed", good.ok && good.value.topic === "How DSCR ratios are actually calculated", good.ok ? good.value.topic : "-");
check("...notes are trimmed", good.ok && good.value.notes === "keep it under 900 words", good.ok ? String(good.value.notes) : "-");

const empty = validateRequest("blog", "   ", null);
check("empty topic refused", !empty.ok, empty.ok ? "ACCEPTED" : empty.error);
const oneWord = validateRequest("blog", "DSCR", null);
check("a one-word topic refused", !oneWord.ok, oneWord.ok ? "ACCEPTED" : oneWord.error);
check(`...the boundary is ${TOPIC_MIN}`, validateRequest("blog", "a".repeat(TOPIC_MIN), null).ok && !validateRequest("blog", "a".repeat(TOPIC_MIN - 1), null).ok, "exact");
check("an overlong topic refused", !validateRequest("blog", "a".repeat(TOPIC_MAX + 1), null).ok, `>${TOPIC_MAX}`);
check("overlong notes refused", !validateRequest("blog", "A perfectly good topic", "n".repeat(NOTES_MAX + 1)).ok, `>${NOTES_MAX}`);
check("an unknown channel refused", !validateRequest("tiktok", "A perfectly good topic", null).ok, "refused");
check("empty notes become null, not an empty string", (() => { const r = validateRequest("blog", "A perfectly good topic", "   "); return r.ok && r.value.notes === null; })(), "null");

/* ----------------------------------------------------------------- cadence */

console.log("\n=== 4. Cadence — the number this whole feature exists to show ===");

// The real case: the blog's newest post on 23 Sep 2026 was dated 30 August.
const realBlog = cadenceFor({ channel: "blog", lastPublishedAt: "2026-08-30T00:00:00.000Z", source: "archive" }, NOW);
check("24 days of blog silence is STALLED", realBlog.level === "stalled", realBlog.level);
check("...and it says 24 days", realBlog.days === 24, String(realBlog.days));
check("...with no caveat, because the archive is real", realBlog.caveat === "", realBlog.caveat || "(none)");

check("a blog post today is ok", cadenceFor({ channel: "blog", lastPublishedAt: daysAgo(0), source: "archive" }, NOW).level === "ok", cadenceFor({ channel: "blog", lastPublishedAt: daysAgo(0), source: "archive" }, NOW).level);
check("2 days is still ok (target 1, slipping at 3)", cadenceFor({ channel: "blog", lastPublishedAt: daysAgo(2), source: "archive" }, NOW).level === "ok", "ok");
check("3 days is slipping", cadenceFor({ channel: "blog", lastPublishedAt: daysAgo(3), source: "archive" }, NOW).level === "slipping", "slipping");
check("7 days is stalled", cadenceFor({ channel: "blog", lastPublishedAt: daysAgo(7), source: "archive" }, NOW).level === "stalled", "stalled");

// Different targets mean the same gap means different things.
check("21 days is stalled for the blog", cadenceFor({ channel: "blog", lastPublishedAt: daysAgo(21), source: "archive" }, NOW).level === "stalled", "stalled");
check("...slipping for LinkedIn (target 7)", cadenceFor({ channel: "linkedin", lastPublishedAt: daysAgo(21), source: "portal" }, NOW).level === "slipping", cadenceFor({ channel: "linkedin", lastPublishedAt: daysAgo(21), source: "portal" }, NOW).level);
check("...and fine for email (target 30)", cadenceFor({ channel: "email", lastPublishedAt: daysAgo(21), source: "portal" }, NOW).level === "ok", cadenceFor({ channel: "email", lastPublishedAt: daysAgo(21), source: "portal" }, NOW).level);

console.log("\n=== 5. Unknown is a real answer, not a red light ===");
const neverLinkedIn = cadenceFor({ channel: "linkedin", lastPublishedAt: null, source: "portal" }, NOW);
check("no history is 'unknown', NOT 'stalled'", neverLinkedIn.level === "unknown", neverLinkedIn.level);
check("...days is null, not 0", neverLinkedIn.days === null, String(neverLinkedIn.days));
check("...and it explains why", neverLinkedIn.caveat.includes("no history outside the portal"), neverLinkedIn.caveat);

const neverBlog = cadenceFor({ channel: "blog", lastPublishedAt: null, source: "archive" }, NOW);
check("an empty archive says so plainly", neverBlog.caveat === "Nothing published, ever.", neverBlog.caveat);

console.log("\n=== 6. A portal-only measurement admits what it does not know ===");
const portalMeasured = cadenceFor({ channel: "email", lastPublishedAt: daysAgo(5), source: "portal" }, NOW);
check("carries the caveat", portalMeasured.caveat.includes("not from a full history"), portalMeasured.caveat);
check("an archive measurement does not", cadenceFor({ channel: "blog", lastPublishedAt: daysAgo(5), source: "archive" }, NOW).caveat === "", "clean");

console.log("\n=== 7. Bad dates do not produce nonsense ===");
const future = cadenceFor({ channel: "blog", lastPublishedAt: daysAgo(-10), source: "archive" }, NOW);
check("a future date reports 0 days, never negative", future.days === 0, String(future.days));
check("...and reads as ok rather than stalled", future.level === "ok", future.level);
const garbage = cadenceFor({ channel: "blog", lastPublishedAt: "not-a-date", source: "archive" }, NOW);
check("an unparseable date is 'unknown'", garbage.level === "unknown", garbage.level);

/* ------------------------------------------------------------ stuck queue */

console.log("\n=== 8. A task that claimed a job and died is visible ===");

const rows: TrackedRequest[] = [
  { id: "a", channel: "blog", status: "in_progress", requestedAt: daysAgo(1), claimedAt: hoursAgo(12) },
  { id: "b", channel: "blog", status: "in_progress", requestedAt: daysAgo(1), claimedAt: hoursAgo(1) },
  { id: "c", channel: "email", status: "in_progress", requestedAt: daysAgo(1), claimedAt: null },
  { id: "d", channel: "blog", status: "requested", requestedAt: daysAgo(3), claimedAt: null },
  { id: "e", channel: "blog", status: "drafted", requestedAt: daysAgo(9), claimedAt: hoursAgo(99) },
];
const stuck = stuckRequests(rows, STUCK_AFTER_HOURS, NOW);
check("claimed 12h ago is stuck", stuck.some((r) => r.id === "a"), "flagged");
check("claimed 1h ago is not", !stuck.some((r) => r.id === "b"), "working");
check("in_progress with NO claim time is stuck", stuck.some((r) => r.id === "c"), "flagged");
check("a request nobody claimed is not stuck", !stuck.some((r) => r.id === "d"), "just waiting");
check("a finished draft is never stuck", !stuck.some((r) => r.id === "e"), "correct");
// Two, not three: only the 12-hour-old claim and the one with no claim time.
check("two total, and no others", stuck.length === 2, String(stuck.length));

console.log("\n=== 9. Pending is oldest first, so nothing outlives the queue ===");
const pending = pendingRequests(rows);
check("four pending", pending.length === 4, String(pending.length));
check("oldest request first", pending[0].id === "d", pending[0].id);
check("drafted is not pending", !pending.some((r) => r.id === "e"), "excluded");
check("empty input does not throw", pendingRequests([]).length === 0, "0");

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail > 0 ? 1 : 0);
