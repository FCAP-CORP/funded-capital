/**
 * Regression suite for logging a touch and putting a deal down.
 *
 * `now` is fixed so the suite means the same thing every day it runs.
 */

import {
  KIND_LABEL,
  LOGGABLE_KINDS,
  MAX_NOTE_LENGTH,
  MAX_SNOOZE_DAYS,
  isLoggableKind,
  parseNote,
  parseSnoozeDate,
  snoozePresets,
} from "./followup";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};

/** Wednesday 23 September 2026, 21:30 UTC — deliberately AFTER 13:00. */
const NOW = new Date("2026-09-23T21:30:00.000Z");
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

console.log("\n=== 1. Only a person's own actions can be logged by hand ===");
check("a call can be logged", isLoggableKind("call"), "yes");
check("an outbound email can be logged", isLoggableKind("email_out"), "yes");
check("an outbound text can be logged", isLoggableKind("sms_out"), "yes");
check("a note can be logged", isLoggableKind("note"), "yes");
check("an INBOUND email cannot be logged by hand", !isLoggableKind("email_in"), "refused");
check("an INBOUND text cannot be logged by hand", !isLoggableKind("sms_in"), "refused");
check("a stage change cannot be forged", !isLoggableKind("stage_change"), "refused");
check("a field change cannot be forged", !isLoggableKind("field_change"), "refused");
check("automation cannot be forged", !isLoggableKind("automation"), "refused");
check("a form submission cannot be forged", !isLoggableKind("form_submission"), "refused");
check("junk is refused", !isLoggableKind("telepathy"), "refused");
check("a non-string is refused", !isLoggableKind(42), "refused");
check("null is refused", !isLoggableKind(null), "refused");
check("every loggable kind has a label", LOGGABLE_KINDS.every((k) => Boolean(KIND_LABEL[k])), "all labelled");

console.log("\n=== 2. A snooze must point at a real future date ===");
const ok = parseSnoozeDate(inDays(3), NOW);
check("three days out is accepted", ok.ok, ok.ok ? ok.value : ok.error);
check("and comes back as ISO", ok.ok && ok.value.endsWith("Z"), ok.ok ? ok.value : "-");
const past = parseSnoozeDate(inDays(-1), NOW);
check("yesterday is refused", !past.ok, past.ok ? "WRONGLY ACCEPTED" : past.error);
const rightNow = parseSnoozeDate(NOW.toISOString(), NOW);
check("this exact second is refused", !rightNow.ok, rightNow.ok ? "WRONGLY ACCEPTED" : rightNow.error);
const far = parseSnoozeDate(inDays(MAX_SNOOZE_DAYS + 1), NOW);
check("beyond a year is refused", !far.ok, far.ok ? "WRONGLY ACCEPTED" : far.error);
const edge = parseSnoozeDate(inDays(MAX_SNOOZE_DAYS - 0.5), NOW);
check("just inside a year is accepted", edge.ok, edge.ok ? "accepted" : edge.error);
check("gibberish is refused", !parseSnoozeDate("thursday-ish", NOW).ok, "refused");
check("empty is refused", !parseSnoozeDate("", NOW).ok, "refused");
check("a number is refused", !parseSnoozeDate(1790000000000, NOW).ok, "refused");
check("undefined is refused", !parseSnoozeDate(undefined, NOW).ok, "refused");

console.log("\n=== 3. Notes are trimmed and bounded ===");
const n1 = parseNote("  spoke to the builder  ");
check("surrounding space is trimmed", n1.ok && n1.value === "spoke to the builder", n1.ok ? `"${n1.value}"` : n1.error);
const n2 = parseNote("   ");
check("whitespace only becomes null, not an empty string", n2.ok && n2.value === null, n2.ok ? String(n2.value) : n2.error);
const n3 = parseNote("   ", true);
check("but is refused when a note is required", !n3.ok, n3.ok ? "WRONGLY ACCEPTED" : n3.error);
const n4 = parseNote("x".repeat(MAX_NOTE_LENGTH + 1));
check("over the limit is refused", !n4.ok, n4.ok ? "WRONGLY ACCEPTED" : "refused");
const n5 = parseNote("x".repeat(MAX_NOTE_LENGTH));
check("exactly the limit is accepted", n5.ok, n5.ok ? "accepted" : n5.error);
const n6 = parseNote(undefined);
check("undefined becomes null when optional", n6.ok && n6.value === null, "null");

console.log("\n=== 4. Presets land in the morning, never in the past ===");
const presets = snoozePresets(NOW);
check("five presets offered", presets.length === 5, String(presets.length));
check("every preset is in the future", presets.every((p) => Date.parse(p.iso) > NOW.getTime()), "all future");
check("every preset lands at 13:00 UTC", presets.every((p) => new Date(p.iso).getUTCHours() === 13), presets.map((p) => new Date(p.iso).getUTCHours()).join(","));
check("they are in ascending order", presets.every((p, i) => i === 0 || Date.parse(p.iso) > Date.parse(presets[i - 1].iso)), "ordered");
check("every preset passes its own validator", presets.every((p) => parseSnoozeDate(p.iso, NOW).ok), "all valid");
check("tomorrow is the 24th, not the 23rd", new Date(presets[0].iso).getUTCDate() === 24, new Date(presets[0].iso).toISOString());

// Clicking at 09:00 UTC, before the 13:00 mark, must still give tomorrow.
const EARLY = new Date("2026-09-23T09:00:00.000Z");
const early = snoozePresets(EARLY);
check("clicking early in the day still gives tomorrow, not today", new Date(early[0].iso).getUTCDate() === 24, new Date(early[0].iso).toISOString());
check("and every early preset is still in the future", early.every((p) => Date.parse(p.iso) > EARLY.getTime()), "all future");

// Month boundary.
const EOM = new Date("2026-09-30T21:30:00.000Z");
check("crossing a month boundary rolls correctly", new Date(snoozePresets(EOM)[0].iso).toISOString().slice(0, 10) === "2026-10-01", new Date(snoozePresets(EOM)[0].iso).toISOString().slice(0, 10));

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail > 0 ? 1 : 0);
