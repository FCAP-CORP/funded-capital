/**
 * Regression suite for lead nurturing (lib/nurture/nurture.ts).
 *
 * What must never happen, in the order it would hurt:
 *   §1  someone who unsubscribed, or is mid-deal, or was just talking to us,
 *       gets marketing email;
 *   §2  a person lands in two programmes, or the wrong one;
 *   §3  a reply / new deal / unsubscribe fails to stop the emails;
 *   §4  Klaviyo's view of consent is misread;
 *   §5  the Klaviyo payload could subscribe anyone or wipe their data.
 */
import {
  ENROLL_MAX, LOST_MIN_DAYS, MAX_SYNC_ATTEMPTS, PAST_BORROWER_MIN_DAYS, PROGRAMS, PROGRAM_KEYS, QUIET_DAYS,
  candidateOf, classify, klaviyoVerdict, loanWords, lostReasonExcluded, parseContactIds, profilePayload,
  programByKey, retryDelayMinutes, stateAfterStop, stopReason, summarize,
  type NurtureApp, type NurtureContact, type StopSignals,
} from "./nurture";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};

const NOW = new Date("2026-09-26T16:00:00.000Z");
const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

let seq = 0;
const app = (o: Partial<NurtureApp> = {}): NurtureApp => ({
  id: `a${++seq}`,
  stage: "lead",
  leadSource: "website",
  product: "fix_and_flip",
  arrivedAt: ago(90),
  firstTermSheetAt: null,
  fundedAt: null,
  lostAt: null,
  lostReason: null,
  ...o,
});
const person = (o: Partial<NurtureContact> = {}): NurtureContact => ({
  id: `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`,
  firstName: "Dana",
  lastName: "Reyes",
  email: "dana@example.com",
  emailSubscribed: null,
  leadSource: "website",
  state: "FL",
  roles: ["borrower"],
  apps: [app()],
  lastTouchAt: ago(45),
  priorPrograms: [],
  activeProgram: null,
  staffStopped: false,
  ...o,
});
const prog = (c: NurtureContact) => classify(c, NOW);
const is = (c: NurtureContact, key: string) => prog(c).program === key;
const why = (c: NurtureContact) => prog(c).exclusion;

console.log("\n§0 programmes");
check("four programmes, unique keys", PROGRAMS.length === 4 && new Set(PROGRAM_KEYS).size === 4, PROGRAM_KEYS.join(","));
check("every programme has a real Klaviyo list id", PROGRAMS.every((p) => /^[A-Za-z0-9]{6}$/.test(p.klaviyoListId)), PROGRAMS.map((p) => p.klaviyoListId).join(","));
check("list ids are unique", new Set(PROGRAMS.map((p) => p.klaviyoListId)).size === 4, "");
check("no programme uses a list Luis manages by hand (newsletter, BP Nurture, Warm Leads)",
  !PROGRAMS.some((p) => ["UTDZkv", "VA5fgk", "Yxdkhg", "RvAjPC", "TYcq9Z", "TwrSea"].includes(p.klaviyoListId)), "");
check("programByKey refuses junk", programByKey("quiet")?.key === "quiet" && programByKey("x") === null && programByKey(undefined) === null, "");
check("Luis's threshold: quiet means 30 days", QUIET_DAYS === 30, String(QUIET_DAYS));

console.log("\n§1 nobody who should be left alone");
check("baseline: a quiet website lead → quiet", is(person(), "quiet"), String(prog(person()).program));
check("unsubscribed → excluded", why(person({ emailSubscribed: false })) === "unsubscribed", "");
check("subscribed=true still fine", is(person({ emailSubscribed: true }), "quiet"), "");
check("no email → excluded", why(person({ email: null })) === "no_email", "");
check("junk email → excluded", why(person({ email: "not an email" })) === "no_email", "");
check("our own address → excluded", why(person({ email: "luis@FundedCapital.com" })) === "internal", "");
check("broker-only → excluded", why(person({ roles: ["broker"] })) === "broker", "");
check("broker who also borrows → not excluded as broker", is(person({ roles: ["broker", "borrower"] }), "quiet"), "");
check("no application → excluded", why(person({ apps: [] })) === "no_deal", "");
check("term sheet out → in progress", why(person({ apps: [app({ stage: "term_sheet_issued" })] })) === "in_progress", "");
check("underwriting → in progress", why(person({ apps: [app({ stage: "underwriting" })] })) === "in_progress", "");
check("one deal in progress blocks even with an old lead beside it",
  why(person({ apps: [app(), app({ stage: "docs_out" })] })) === "in_progress", "");
check(`touched ${QUIET_DAYS - 1} days ago → recent`, why(person({ lastTouchAt: ago(QUIET_DAYS - 1) })) === "recent_contact", "");
check(`touched exactly ${QUIET_DAYS} days ago → eligible`, is(person({ lastTouchAt: ago(QUIET_DAYS) }), "quiet"), "");
check("never touched, old enquiry → eligible", is(person({ lastTouchAt: null }), "quiet"), "");
check("never touched, enquiry 10 days old → recent", why(person({ lastTouchAt: null, apps: [app({ arrivedAt: ago(10) })] })) === "recent_contact", "");
check("enquiry with no date at all → treated as recent (safe side)", why(person({ lastTouchAt: null, apps: [app({ arrivedAt: null })] })) === "recent_contact", "");
check("new enquiry 5 days ago beside an old one → recent", why(person({ apps: [app(), app({ arrivedAt: ago(5) })] })) === "recent_contact", "");
check("not our product (homebuyer) → not a fit", why(person({ apps: [app({ product: "not_our_product" })] })) === "not_a_fit", "");
check("lost as duplicate → not a fit", why(person({ apps: [app({ stage: "closed_lost", lostReason: "Duplicate file", lostAt: ago(200) })] })) === "not_a_fit", "");
check("lost as Not our product — note → not a fit", why(person({ apps: [app({ stage: "closed_lost", lostReason: "Not our product — owner occupied", lostAt: ago(200) })] })) === "not_a_fit", "");
check("legacy spam reason → not a fit", lostReasonExcluded("bot / SPAM submission"), "");
check("'Stopped responding' is NOT excluded (best target)", !lostReasonExcluded("Stopped responding"), "");
check("'Rate or terms' is NOT excluded", !lostReasonExcluded("Rate or terms — went with a bank"), "");
check("already active in a programme → excluded", why(person({ activeProgram: "quiet" })) === "enrolled", "");
check("Luis stopped them before → never offered again", why(person({ staffStopped: true })) === "stopped_before", "");
check("went through this programme before → excluded", why(person({ priorPrograms: ["quiet"] })) === "already_done", "");
check("went through a DIFFERENT programme → still eligible for this one", is(person({ priorPrograms: ["lost"] }), "quiet"), "");

console.log("\n§2 exactly one programme, the right one");
const borrower = (fundedDays: number) => person({ apps: [app({ stage: "active", fundedAt: ago(fundedDays), arrivedAt: ago(fundedDays + 30) })] });
check(`funded ${PAST_BORROWER_MIN_DAYS + 10} days ago → past borrower`, is(borrower(PAST_BORROWER_MIN_DAYS + 10), "past_borrower"), "");
check(`funded ${PAST_BORROWER_MIN_DAYS - 10} days ago → recent borrower, excluded`, why(borrower(PAST_BORROWER_MIN_DAYS - 10)) === "recent_borrower", "");
check("paid off long ago → past borrower", is(person({ apps: [app({ stage: "payoff", fundedAt: ago(700) })] }), "past_borrower"), "");
check("funded with no date, enquiry 2 years old → past borrower", is(person({ apps: [app({ stage: "funded", arrivedAt: ago(730) })] }), "past_borrower"), "");
check("funded with no date and no arrival → recent (safe side)", why(person({ apps: [app({ stage: "funded", arrivedAt: null })] })) === "recent_contact" || why(person({ apps: [app({ stage: "funded", arrivedAt: null })] })) === "recent_borrower", String(why(person({ apps: [app({ stage: "funded", arrivedAt: null })] }))));
check("past borrower beats BiggerPockets", is(person({ leadSource: "biggerpockets", apps: [app({ stage: "active", fundedAt: ago(400) }), app({ leadSource: "biggerpockets" })] }), "past_borrower"), "");
const bp = (o: Partial<NurtureApp> = {}) => person({ leadSource: "biggerpockets", apps: [app({ leadSource: "biggerpockets", ...o })] });
check("BP lead, no term sheet → BP programme", is(bp(), "bp_no_term_sheet"), "");
check("BP by application source only → BP programme", is(person({ apps: [app({ leadSource: "biggerpockets" })] }), "bp_no_term_sheet"), "");
check("BP lead that once had a term sheet, now back to lead → quiet, not BP", is(bp({ firstTermSheetAt: ago(80) }), "quiet"), "");
check(`BP lead lost ${LOST_MIN_DAYS + 5} days ago → BP programme`, is(bp({ stage: "closed_lost", lostAt: ago(LOST_MIN_DAYS + 5), lostReason: "Stopped responding" }), "bp_no_term_sheet"), "");
check(`BP lead lost ${LOST_MIN_DAYS - 5} days ago → recently lost`, why(bp({ stage: "closed_lost", lostAt: ago(LOST_MIN_DAYS - 5), lostReason: "Stopped responding" })) === "recently_lost", "");
check("BP duplicate → not a fit", why(bp({ stage: "closed_lost", lostAt: ago(200), lostReason: "Duplicate file" })) === "not_a_fit", "");
const lost = (days: number, reason = "Went with another lender") => person({ apps: [app({ stage: "closed_lost", lostAt: ago(days), lostReason: reason, arrivedAt: ago(days + 20) })] });
check(`lost ${LOST_MIN_DAYS} days ago → lost programme`, is(lost(LOST_MIN_DAYS), "lost"), "");
check(`lost ${LOST_MIN_DAYS - 1} days ago → recently lost`, why(lost(LOST_MIN_DAYS - 1)) === "recently_lost", "");
check("lost with no lost date uses arrival", is(person({ apps: [app({ stage: "closed_lost", lostAt: null, arrivedAt: ago(300) })] }), "lost"), "");
check("an open lead beside an old lost deal → quiet (the open enquiry wins)", is(person({ apps: [app(), app({ stage: "closed_lost", lostAt: ago(300) })] }), "quiet"), "");
check("a duplicate beside a real lead is ignored → quiet", is(person({ apps: [app(), app({ stage: "closed_lost", lostReason: "Duplicate file", lostAt: ago(3) })] }), "quiet"), "");
const many = [person(), bp(), lost(200), borrower(400), person({ emailSubscribed: false })];
const sum = summarize(many, [], NOW);
const placed = PROGRAM_KEYS.reduce((n, k) => n + sum.candidates[k].length, 0);
check("summary: each person in at most one list", placed === 4, `${placed} placed of 5`);
check("summary: the unsubscribed one is counted as excluded", sum.excluded.unsubscribed === 1, JSON.stringify(sum.excluded));
check("summary: ready counts match the lists", sum.byProgram.every((p) => p.ready === sum.candidates[p.key].length), "");

console.log("\n§3 auto-stop");
const sig = (o: Partial<StopSignals> = {}): StopSignals => ({
  enrolledAt: ago(10), email: "dana@example.com", emailSubscribed: null,
  lastInboundAt: ago(60), lastOutboundAt: ago(60), lastArrivalAt: ago(90), lastForwardMoveAt: ago(90), ...o,
});
check("nothing new → keeps going", stopReason(sig()) === null, "");
check("replied by email after enrolling → stop", stopReason(sig({ lastInboundAt: ago(1) })) === "replied", "");
check("reply BEFORE enrolling does not stop", stopReason(sig({ lastInboundAt: ago(11) })) === null, "");
check("new enquiry → stop (new_deal)", stopReason(sig({ lastArrivalAt: ago(2) })) === "new_deal", "");
check("deal moved forward → stop", stopReason(sig({ lastForwardMoveAt: ago(2) })) === "deal_moved", "");
check("Luis emailed/called them himself → stop", stopReason(sig({ lastOutboundAt: ago(2) })) === "contacted", "");
check("unsubscribe beats everything", stopReason(sig({ emailSubscribed: false, lastInboundAt: ago(1) })) === "unsubscribed", "");
check("email removed → stop", stopReason(sig({ email: "" })) === "no_email", "");
check("a reply outranks Luis's own follow-up (credit the programme)", stopReason(sig({ lastInboundAt: ago(1), lastOutboundAt: ago(1) })) === "replied", "");
check("stopping never skips removal of a row that might be mid-add", stateAfterStop("pending_add") === "pending_remove" && stateAfterStop("added") === "pending_remove" && stateAfterStop("removed") === "removed", "");

console.log("\n§4 reading Klaviyo");
const L = "Yq4vxf";
check("never subscribed, nothing suppressed → ok", klaviyoVerdict({ can_receive_email_marketing: true, consent: "NEVER_SUBSCRIBED", suppression: [] }, L) === "ok", "");
check("subscribed → ok", klaviyoVerdict({ can_receive_email_marketing: true, consent: "SUBSCRIBED" }, L) === "ok", "");
check("consent UNSUBSCRIBED → unsubscribed", klaviyoVerdict({ consent: "UNSUBSCRIBED" }, L) === "unsubscribed", "");
check("suppressed UNSUBSCRIBE → unsubscribed", klaviyoVerdict({ consent: "NEVER_SUBSCRIBED", suppression: [{ reason: "UNSUBSCRIBE" }] }, L) === "unsubscribed", "");
check("spam complaint → unsubscribed", klaviyoVerdict({ suppression: [{ reason: "SPAM_COMPLAINT" }] }, L) === "unsubscribed", "");
check("suppressed by hand in Klaviyo → unsubscribed", klaviyoVerdict({ suppression: [{ reason: "USER_SUPPRESSED" }] }, L) === "unsubscribed", "");
check("hard bounce → bounced (not a consent change)", klaviyoVerdict({ suppression: [{ reason: "HARD_BOUNCE" }] }, L) === "bounced", "");
check("unsubscribed from THIS list only → list_unsubscribed", klaviyoVerdict({ consent: "SUBSCRIBED", list_suppressions: [{ list_id: L, reason: "UNSUBSCRIBE" }] }, L) === "list_unsubscribed", "");
check("unsubscribed from a DIFFERENT list → ok", klaviyoVerdict({ consent: "SUBSCRIBED", list_suppressions: [{ list_id: "Other1", reason: "UNSUBSCRIBE" }] }, L) === "ok", "");
check("cannot receive, no reason given → treated as unsubscribed", klaviyoVerdict({ can_receive_email_marketing: false }, L) === "unsubscribed", "");
check("missing object → ok (absence is not a signal)", klaviyoVerdict(null, L) === "ok", "");

console.log("\n§5 the Klaviyo payload");
const c = person({ firstName: "  Ana ", lastName: null, email: " Ana@Example.COM ", apps: [app({ product: "ground_up", arrivedAt: ago(40) }), app({ product: "dscr", arrivedAt: ago(400) })] });
const p = profilePayload(c, PROGRAMS[2])!;
const json = JSON.stringify(p);
check("never carries a subscription or consent field", !/subscri|consent|marketing/i.test(json), json);
check("never carries a phone number", !/phone/i.test(json), "");
check("email lower-cased and trimmed", p.data.attributes.email === "ana@example.com", p.data.attributes.email);
check("external_id is the Lending OS contact id", p.data.attributes.external_id === c.id, "");
check("empty last name is OMITTED, not null (never erases Klaviyo data)", !("last_name" in p.data.attributes) && !json.includes("null"), "");
check("first name trimmed", p.data.attributes.first_name === "Ana", "");
check("loan type = newest enquiry, in words", p.data.attributes.properties.los_loan_type === "ground-up construction", String(p.data.attributes.properties.los_loan_type));
check("programme name travels for Klaviyo segmenting", p.data.attributes.properties.los_program === "Quiet leads", "");
check("retry without external id drops only that field", !("external_id" in profilePayload(c, PROGRAMS[2], { withExternalId: false })!.data.attributes), "");
check("no email → no payload", profilePayload(person({ email: "x" }), PROGRAMS[0]) === null, "");
check("unknown loan types say nothing", loanWords([app({ product: "unknown" }), app({ product: "multiple" })]) === null, "");

console.log("\n§6 sync and the page");
check("retry delays grow and cap at 6h", retryDelayMinutes(1) === 2 && retryDelayMinutes(3) === 8 && retryDelayMinutes(20) === 360, "");
check("gives up after a bounded number of tries", MAX_SYNC_ATTEMPTS >= 5 && MAX_SYNC_ATTEMPTS <= 12, String(MAX_SYNC_ATTEMPTS));
const id1 = "11111111-1111-4111-8111-111111111111";
check("ids: uuids only, deduped", (() => { const r = parseContactIds([id1, id1.toUpperCase(), "x", 5]); return r.ok && r.ids.length === 1; })(), "");
check("ids: none → refused", !parseContactIds([]).ok && !parseContactIds("x").ok, "");
check(`ids: more than ${ENROLL_MAX} → refused`, !parseContactIds(Array.from({ length: ENROLL_MAX + 1 }, (_, i) => `11111111-1111-4111-8111-${String(i).padStart(12, "0")}`)).ok, "");
const cand = candidateOf(person({ lastTouchAt: null, firstName: null, lastName: null }), NOW);
check("a nameless candidate shows the email", cand.name === "dana@example.com" && cand.quietDays === null, cand.name);
const sorted = summarize([person({ lastTouchAt: ago(40) }), person({ lastTouchAt: null }), person({ lastTouchAt: ago(300) })], [], NOW).candidates.quiet;
check("longest-quiet first, never-contacted at the top", sorted[0].quietDays === null && sorted[1].quietDays === 300, sorted.map((s) => s.quietDays).join(","));
const s2 = summarize([], [
  { program: "quiet", status: "active", stopReason: null, syncState: "added", syncAttempts: 0 },
  { program: "quiet", status: "stopped", stopReason: "replied", syncState: "removed", syncAttempts: 0 },
  { program: "quiet", status: "stopped", stopReason: "unsubscribed", syncState: "removed", syncAttempts: 0 },
  { program: "quiet", status: "active", stopReason: null, syncState: "pending_add", syncAttempts: MAX_SYNC_ATTEMPTS },
], NOW).byProgram.find((b) => b.key === "quiet")!;
check("results: a reply counts as a win, an unsubscribe does not", s2.wins === 1 && s2.stopped.unsubscribed === 1, JSON.stringify(s2));
check("results: failed syncs surfaced", s2.syncFailed === 1 && s2.active === 2, "");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
