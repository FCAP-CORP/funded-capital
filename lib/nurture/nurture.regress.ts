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
  STAGE_ORDER, STOP_LABEL, WIN_REASONS,
  candidateOf, classify, isForwardMove, nurtureStatus, klaviyoVerdict, loanWords, lostReasonExcluded, parseContactIds, profilePayload,
  programByKey, retryDelayMinutes, stateAfterStop, stopReason, summarize,
  type NurtureApp, type NurtureContact, type StopSignals,
} from "./nurture";
import { STAGE_ORDER as BROKER_STAGE_ORDER } from "../crm/brokerUpdates";
import { stageEnum } from "../db/schema";

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
  addedAt: ago(200),
  tags: ["investor"],
  ...o,
});
const prog = (c: NurtureContact) => classify(c, NOW);
const is = (c: NurtureContact, key: string) => prog(c).program === key;
const why = (c: NurtureContact) => prog(c).exclusion;

console.log("\n§0 programmes");
check("five programmes, unique keys", PROGRAMS.length === 5 && new Set(PROGRAM_KEYS).size === 5, PROGRAM_KEYS.join(","));
check("every programme has a real Klaviyo list id", PROGRAMS.every((p) => /^[A-Za-z0-9]{6}$/.test(p.klaviyoListId)), PROGRAMS.map((p) => p.klaviyoListId).join(","));
check("list ids are unique", new Set(PROGRAMS.map((p) => p.klaviyoListId)).size === 5, "");
check("only the old-contacts programme starts unticked (Luis reviews each one)",
  PROGRAMS.filter((p) => !p.preselect).map((p) => p.key).join(",") === "contacts", "");
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
check("no application, quiet, added long ago → Investor contacts", is(person({ apps: [] }), "contacts"), String(prog(person({ apps: [] })).program));
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

console.log("\n§2b people with no deal (the old spreadsheet)");
const bare = (o: Partial<NurtureContact> = {}) => person({ apps: [], roles: [], ...o });
check("no deal → only ever the contacts programme", is(bare(), "contacts"), "");
check("no deal, added 10 days ago → recent", why(bare({ addedAt: ago(10) })) === "recent_contact", "");
check("no deal, no added date → recent (safe side)", why(bare({ addedAt: null })) === "recent_contact", "");
check("no deal, in touch 5 days ago → recent", why(bare({ lastTouchAt: ago(5) })) === "recent_contact", "");
check("no deal, never in touch, added long ago → contacts", is(bare({ lastTouchAt: null }), "contacts"), "");
check("no deal, contact marked as a broker → excluded", why(bare({ leadSource: "broker" })) === "broker", "");
check("no deal, unsubscribed → excluded", why(bare({ emailSubscribed: false })) === "unsubscribed", "");
check("no deal, our own address → excluded", why(bare({ email: "x@fundedcapital.com" })) === "internal", "");
check("no deal, went through it before → excluded", why(bare({ priorPrograms: ["contacts"] })) === "already_done", "");
check("no deal, Luis stopped them before → excluded", why(bare({ staffStopped: true })) === "stopped_before", "");
check("no deal, already in a programme → excluded", why(bare({ activeProgram: "contacts" })) === "enrolled", "");
check("someone WITH a deal never lands in contacts", PROGRAM_KEYS.filter((k) => k !== "contacts").every(() => prog(person()).program !== "contacts"), "");
const note = candidateOf(bare({ addedAt: "2026-04-10T15:00:00Z", tags: ["investor", " flipper ", "", "miami", "extra"] }), NOW).note;
check("review note shows when they were added and up to 3 tags", note === "Added Apr 2026 · investor, flipper, miami", note);
check("people with a deal get no note", candidateOf(person(), NOW).note === "", "");

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
console.log("\n§3b finishing (30 Sep 2026)");
{
  const fin = ago(1); // the flow's last email + grace passed yesterday
  check("flow ran its course, nothing else happened → finished", stopReason(sig({ finishAt: fin }), NOW) === "finished", "");
  check("not yet at the finish date → keeps going", stopReason(sig({ finishAt: new Date(NOW.getTime() + 86_400_000).toISOString() }), NOW) === null, "");
  check("no finish date (never reached Klaviyo) → never finished", stopReason(sig({ finishAt: null }), NOW) === null, "");
  check("without a clock, nothing finishes (old callers unchanged)", stopReason(sig({ finishAt: fin })) === null, "");
  check("a reply BEFORE the finish date is still a win", stopReason(sig({ finishAt: fin, lastInboundAt: ago(2) }), NOW) === "replied", "");
  check("a reply AFTER the finish date is not the programme's win → finished", stopReason(sig({ finishAt: ago(5), lastInboundAt: ago(2) }), NOW) === "finished", "");
  check("a deal move after the finish date is not a win either", stopReason(sig({ finishAt: ago(5), lastForwardMoveAt: ago(2) }), NOW) === "finished", "");
  check("an unsubscribe still outranks finishing (consent first)", stopReason(sig({ finishAt: fin, emailSubscribed: false }), NOW) === "unsubscribed", "");
  check("'finished' is labelled, and is not a win", STOP_LABEL.finished === "Got all the emails" && !WIN_REASONS.includes("finished"), STOP_LABEL.finished);
  check("finishing takes them off the Klaviyo list", stateAfterStop("added") === "pending_remove", "");
  const sf = summarize([], [
    { program: "quiet", status: "stopped", stopReason: "finished", syncState: "removed", syncAttempts: 0 },
    { program: "quiet", status: "stopped", stopReason: "replied", syncState: "removed", syncAttempts: 0 },
  ], NOW).byProgram.find((b) => b.key === "quiet")!;
  check("finished people count under Stopped, not as wins, not as enrolled", sf.stopped.finished === 1 && sf.wins === 1 && sf.active === 0, JSON.stringify(sf));
  // Loops: finished frees the person, but never for the same programme.
  check("finished the quiet programme → quiet is never offered again", why(person({ priorPrograms: ["quiet"] })) === "already_done", "");
  const lostNow = person({ priorPrograms: ["quiet"], apps: [app({ stage: "closed_lost", lostAt: ago(120), lostReason: "Stopped responding" })] });
  check("...but a different programme is, once they fit it (lost deal)", prog(lostNow).program === "lost", String(prog(lostNow).program ?? prog(lostNow).exclusion));
  check("no programme still promises 'a note every month'", PROGRAMS.every((p) => !/every (month|few months)/i.test(p.what) && /then they stop\.$/.test(p.what)), PROGRAMS.map((p) => p.what).join(" | "));
}

console.log("\n§3c which stage moves count as 'moved forward'");
check("the stage order is lib/crm/brokerUpdates.ts STAGE_ORDER, exactly", JSON.stringify(STAGE_ORDER) === JSON.stringify(BROKER_STAGE_ORDER), STAGE_ORDER.join(","));
check("...and covers every stage the database has", stageEnum.enumValues.every((v) => (STAGE_ORDER as readonly string[]).includes(v)) && STAGE_ORDER.length === stageEnum.enumValues.length, `${stageEnum.enumValues.length} stages`);
check("lead → term sheet issued: forward", isForwardMove("lead", "term_sheet_issued"), "");
check("underwriting → funded: forward", isForwardMove("underwriting", "funded"), "");
check("underwriting → lead (a correction): NOT forward", !isForwardMove("underwriting", "lead"), "");
check("term sheet signed → issued (a correction): NOT forward", !isForwardMove("term_sheet_signed", "term_sheet_issued"), "");
check("anything → closed_lost: NOT forward", !isForwardMove("lead", "closed_lost") && !isForwardMove("underwriting", "closed_lost"), "");
check("closed_lost → qualified (reopened, the borrower came back): forward", isForwardMove("closed_lost", "qualified"), "");
check("a deal's first stage (no from) is not a move", !isForwardMove(null, "lead") && !isForwardMove(undefined, "qualified"), "");
check("a past borrower's loan moving on (active → draw cycle) still counts, as before", isForwardMove("active", "draw_cycle"), "");
check("...but back from draw cycle to active does not", !isForwardMove("draw_cycle", "active"), "");
check("the same stage twice is not a move", !isForwardMove("qualified", "qualified"), "");
check("an unknown stage is not a move", !isForwardMove("mystery", "funded") && !isForwardMove("lead", "mystery"), "");

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

console.log("\n=== §8 one person's status, in words (dashboard 'No movement', 1 Oct 2026) ===");
{
  const ready = nurtureStatus(person({ leadSource: "biggerpockets", apps: [app({ leadSource: "biggerpockets" })] }), NOW);
  check("ready: names the programme classify() picks", ready.kind === "ready" && ready.program === "bp_no_term_sheet" && ready.text === "Ready for nurture: BiggerPockets, no term sheet", ready.text);
  const quiet = nurtureStatus(person(), NOW);
  check("ready agrees with classify() for a quiet lead", quiet.kind === "ready" && quiet.program === classify(person(), NOW).program, quiet.text);
  const inProg = nurtureStatus(person({ activeProgram: "quiet" }), NOW);
  check("in a programme: says which", inProg.kind === "in" && inProg.text === "In nurture: Quiet leads", inProg.text);
  // 2026-09-26T16:00Z minus 10 days = Sep 16; +30 = Oct 16 (New York dates).
  const touched = nurtureStatus(person({ lastTouchAt: ago(10) }), NOW);
  check("in touch 10 days ago: not yet, with the date they can join", touched.kind === "out" && touched.exclusion === "recent_contact" && touched.text === "Not yet: in touch Sep 16, can join from Oct 16", touched.text);
  // An old touch but a fresh enquiry: the enquiry is what holds them out, and the text says so.
  const refiled = nurtureStatus(person({ lastTouchAt: ago(80), apps: [app({ arrivedAt: ago(90) }), app({ arrivedAt: ago(7) })] }), NOW);
  check("a new enquiry 7 days ago: says 'new enquiry', dated from the enquiry", refiled.kind === "out" && refiled.text === "Not yet: new enquiry Sep 19, can join from Oct 19", refiled.text);
  check("…and readyOn is 30 days after the enquiry", refiled.kind === "out" && refiled.readyOn === new Date(Date.parse(ago(7)) + QUIET_DAYS * 86_400_000).toISOString(), "");
  const unsub = nurtureStatus(person({ emailSubscribed: false }), NOW);
  check("unsubscribed: the plain reason, no date", unsub.kind === "out" && unsub.text === "Not for nurture: Unsubscribed" && unsub.readyOn === null, unsub.text);
  const nop = nurtureStatus(person({ apps: [app({ product: "not_our_product" })] }), NOW);
  check("Not our product: says so plainly", nop.kind === "out" && nop.exclusion === "not_a_fit" && nop.text === "Not for nurture: deal marked Not our product", nop.text);
  const noMail = nurtureStatus(person({ email: "not an email" }), NOW);
  check("no usable email: says so", noMail.kind === "out" && noMail.text === "Not for nurture: No usable email address", noMail.text);
  // Every classification maps to a status of the same verdict.
  const people = [person(), person({ lastTouchAt: ago(3) }), person({ emailSubscribed: false }), person({ activeProgram: "lost" }), person({ apps: [app({ stage: "underwriting" })] })];
  check("status kind always agrees with classify()", people.every((c) => {
    const k = classify(c, NOW); const st = nurtureStatus(c, NOW);
    return k.program ? st.kind === "ready" && st.program === k.program : k.exclusion === "enrolled" ? st.kind === "in" : st.kind === "out" && st.exclusion === k.exclusion;
  }), "");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
