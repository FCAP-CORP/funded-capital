/**
 * Regression suite for the Gmail sync warning (lib/crm/syncHealth.ts).
 *
 * The case that made it: the 15-minute timer was never switched on and the
 * CRM said nothing for weeks. The stamp is fresh every run when the sync works,
 * so anything past GMAIL_STALE_AFTER_MINUTES is a real stop, and anything we
 * cannot measure must say NOTHING rather than raise a false alarm.
 */
import {
  gmailSyncHealth, gmailSyncWarning, ageWords, seenAtWords,
  GMAIL_STALE_AFTER_MINUTES, GMAIL_SYNC_HEARTBEAT, GMAIL_SYNC_TRIGGERS_URL,
} from "./syncHealth";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};

const NOW = new Date("2026-10-10T20:00:00Z");
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString();

console.log("\n=== 1. The verdict ===");
check("row name is gmail_sync (the route writes the same constant)", GMAIL_SYNC_HEARTBEAT === "gmail_sync", GMAIL_SYNC_HEARTBEAT);
check("threshold is 90 minutes (six missed runs)", GMAIL_STALE_AFTER_MINUTES === 90, String(GMAIL_STALE_AFTER_MINUTES));
check("just ran → ok", gmailSyncHealth(ago(2), NOW).state === "ok", gmailSyncHealth(ago(2), NOW).state);
check("one late run (31 min) → ok", gmailSyncHealth(ago(31), NOW).state === "ok", "ok");
check("89 minutes → still ok", gmailSyncHealth(ago(89), NOW).state === "ok", "ok");
check("90 minutes → stale", gmailSyncHealth(ago(90), NOW).state === "stale", "stale");
check("three weeks → stale", gmailSyncHealth(ago(60 * 24 * 21), NOW).state === "stale", "stale");
const s = gmailSyncHealth(ago(185), NOW);
check("stale carries its minutes", s.state === "stale" && s.minutes === 185, JSON.stringify(s));
check("a Date works as well as a string", gmailSyncHealth(new Date(ago(200)), NOW).state === "stale", "stale");
check("a stamp from the future (clock skew) counts as just now", (() => { const h = gmailSyncHealth(new Date(NOW.getTime() + 120_000), NOW); return h.state === "ok" && h.minutes === 0; })(), "ok/0");

console.log("\n=== 2. Unmeasured says nothing ===");
check("no row (migration not run) → unknown, not stale", gmailSyncHealth(null, NOW).state === "unknown", "unknown");
check("undefined → unknown", gmailSyncHealth(undefined, NOW).state === "unknown", "unknown");
check("garbage date → unknown", gmailSyncHealth("not a date", NOW).state === "unknown", "unknown");
check("unknown → no banner", gmailSyncWarning({ state: "unknown" }) === null, "null");
check("ok → no banner", gmailSyncWarning(gmailSyncHealth(ago(10), NOW)) === null, "null");

console.log("\n=== 3. The words ===");
check("95 minutes", ageWords(95) === "95 minutes", ageWords(95));
check("1 minute (singular)", ageWords(1) === "1 minute", ageWords(1));
check("2 hours at 120", ageWords(120) === "2 hours", ageWords(120));
check("rounds down: 179 min → 2 hours", ageWords(179) === "2 hours", ageWords(179));
check("47 hours stays hours", ageWords(47 * 60) === "47 hours", ageWords(47 * 60));
check("48 hours → 2 days", ageWords(48 * 60) === "2 days", ageWords(48 * 60));
check("21 days", ageWords(21 * 24 * 60) === "21 days", ageWords(21 * 24 * 60));
check("negative never prints", ageWords(-5) === "0 minutes", ageWords(-5));
check("New York time, not UTC", seenAtWords("2026-10-10T17:15:00Z") === "Sat, Oct 10, 1:15 PM", seenAtWords("2026-10-10T17:15:00Z"));
check("bad iso → empty", seenAtWords("x") === "", JSON.stringify(seenAtWords("x")));
const w = gmailSyncWarning(gmailSyncHealth(ago(185), NOW));
check("stale → a banner", w !== null, String(w?.title));
check("title says how long", w?.title === "Gmail hasn't synced for 3 hours", String(w?.title));
check("body says when it last got through", Boolean(w?.body.includes("Sat, Oct 10, 12:55 PM")), String(w?.body));
check("body says what is affected", Boolean(w?.body.includes("Waiting on you") && w?.body.includes("nurture")), "affected");
check("body says record-card emails still log", Boolean(w?.body.includes("record card")), "card");
check("no HTML entities in the words", !/&[a-z]+;|&#\d+;/i.test(`${w?.title} ${w?.body}`), "plain");
check("fix link is the project's own timer list", GMAIL_SYNC_TRIGGERS_URL.startsWith("https://script.google.com/home/projects/") && GMAIL_SYNC_TRIGGERS_URL.endsWith("/triggers"), GMAIL_SYNC_TRIGGERS_URL);

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail > 0 ? 1 : 0);
