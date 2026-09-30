/**
 * Regression suite for the nurture cockpit (lib/nurture/cockpit.ts).
 *
 * What must never happen, in the order it would hurt:
 *   §1  people are released to a flow that is off, while paused, outside the
 *       weekday-morning window, or faster than the warm-up allows;
 *   §2  the deliverability guard misses a bad week (or cries wolf on one bounce);
 *   §3  a newsletter event, a bot click or an unsubscribe click is counted as interest;
 *   §4  a flow that would not stop emailing someone removed from the list reads as safe;
 *   §5  the report divides by the wrong people.
 */
import {
  BOUNCE_STOP, FLOW_FRESH_MINUTES, STEADY_DAILY_CAP, WARMUP_RAMP,
  afterLabel, carryPreviews, dailyCap, deliverability, eventsFrom, flowIsLive, flowProblems, inReleaseWindow,
  nextReleaseLabel, nurtureReport, nyClock, parseFlow, parseMode, planRelease, previewsStale, snapshotOf,
  toNurtureEvent, warmupStatus,
  type KlaviyoEventLite, type NurtureReportRow, type QueuedLite,
} from "./cockpit";
import { PROGRAMS, stateAfterStop } from "./nurture";
import * as cockpitMod from "./cockpit";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};

// Monday 28 Sep 2026, 10:00 New York (EDT, UTC-4).
const MON_10 = new Date("2026-09-28T14:00:00.000Z");
const MON_9_29 = new Date("2026-09-28T13:29:00.000Z");
const MON_9_30 = new Date("2026-09-28T13:30:00.000Z");
const MON_12 = new Date("2026-09-28T16:00:00.000Z");
const SAT_10 = new Date("2026-10-03T14:00:00.000Z");
const FRI_15 = new Date("2026-10-02T19:00:00.000Z");
// Winter: Monday 7 Dec 2026, 9:45 New York (EST, UTC-5).
const DEC_MON_945 = new Date("2026-12-07T14:45:00.000Z");

console.log("\n=== 1. Release: window, flow live, pause, warm-up ===");
{
  check("New York clock reads Monday 10:00", nyClock(MON_10).weekday === 1 && nyClock(MON_10).minutes === 600 && nyClock(MON_10).day === "2026-09-28", JSON.stringify(nyClock(MON_10)));
  check("window: Monday 9:29 is closed", !inReleaseWindow(MON_9_29), "closed");
  check("window: Monday 9:30 is open", inReleaseWindow(MON_9_30), "open");
  check("window: Monday 12:00 is closed", !inReleaseWindow(MON_12), "closed");
  check("window: Saturday 10:00 is closed", !inReleaseWindow(SAT_10), "weekend");
  check("window follows daylight saving (Dec 9:45 EST open)", inReleaseWindow(DEC_MON_945), "EST");
  check("next release before 9:30 is today", nextReleaseLabel(MON_9_29) === "today at 9:30am", nextReleaseLabel(MON_9_29));
  check("next release Friday afternoon is Monday", nextReleaseLabel(FRI_15) === "Monday at 9:30am", nextReleaseLabel(FRI_15));
  check("next release Saturday is Monday", nextReleaseLabel(SAT_10) === "Monday at 9:30am", nextReleaseLabel(SAT_10));
  check("next release Monday noon is tomorrow", nextReleaseLabel(MON_12) === "tomorrow at 9:30am", nextReleaseLabel(MON_12));

  check("ramp starts at 20", dailyCap(0) === 20, String(dailyCap(0)));
  check("ramp climbs each sending day", WARMUP_RAMP.every((v, i) => i === 0 || v > WARMUP_RAMP[i - 1]), WARMUP_RAMP.join(","));
  check("ramp ends at the steady cap", dailyCap(WARMUP_RAMP.length) === STEADY_DAILY_CAP && dailyCap(99) === STEADY_DAILY_CAP, String(STEADY_DAILY_CAP));
  check("negative input is day 1", dailyCap(-3) === 20, "20");
  check("warm-up status day 3 of 8", warmupStatus(2).day === 3 && warmupStatus(2).of === 8 && warmupStatus(2).warming, JSON.stringify(warmupStatus(2)));
  check("warm-up complete after the ramp", !warmupStatus(8).warming, "done");

  const checked = new Date(MON_10.getTime() - 10 * 60_000).toISOString();
  check("flow live when checked 10 minutes ago", flowIsLive("live", checked, MON_10), "live");
  check("flow NOT live when the check is stale", !flowIsLive("live", new Date(MON_10.getTime() - (FLOW_FRESH_MINUTES + 1) * 60_000).toISOString(), MON_10), "stale");
  check("draft is not live", !flowIsLive("draft", checked, MON_10), "draft");
  check("manual is not live", !flowIsLive("manual", checked, MON_10), "manual");
  check("never checked is not live", !flowIsLive("live", null, MON_10), "null");

  const q = (id: string, program: string, days: number): QueuedLite => ({ id, program, enrolledAt: new Date(MON_10.getTime() - days * 86_400_000).toISOString() });
  const queued = [q("c1", "contacts", 9), q("q1", "quiet", 2), q("p1", "past_borrower", 1), q("q2", "quiet", 5), q("l1", "lost", 3)];
  const allLive = new Set(PROGRAMS.map((p) => p.key));
  const base = { queued, now: MON_10, paused: false, livePrograms: allLive, releasedToday: 0, priorReleaseDays: 0 };
  const plan = planRelease(base);
  check("releases in priority order, oldest first", plan.ids.join(",") === "p1,q2,q1,l1,c1", plan.ids.join(","));
  check("paused releases nobody", planRelease({ ...base, paused: true }).ids.length === 0 && planRelease({ ...base, paused: true }).blocked === "paused", "paused");
  check("outside the window releases nobody", planRelease({ ...base, now: SAT_10 }).blocked === "outside_window" && planRelease({ ...base, now: SAT_10 }).ids.length === 0, "weekend");
  const onlyQuiet = planRelease({ ...base, livePrograms: new Set(["quiet"]) });
  check("only programmes with a live flow are released", onlyQuiet.ids.join(",") === "q2,q1", onlyQuiet.ids.join(","));
  check("no live flow → blocked, nobody released", planRelease({ ...base, livePrograms: new Set() }).blocked === "no_live_flow", "blocked");
  const capped = planRelease({ ...base, releasedToday: 18 });
  check("cap counts today's earlier releases", capped.ids.length === 2 && capped.left === 2, `${capped.ids.length} released`);
  check("cap reached → nobody", planRelease({ ...base, releasedToday: 20 }).blocked === "cap_reached", "cap");
  const many = Array.from({ length: 300 }, (_, i) => q(`x${i}`, "quiet", i % 40));
  check("never more than the day's cap in one go", planRelease({ ...base, queued: many, priorReleaseDays: 3 }).ids.length === 60, "60 on day 4");
  check("unknown programme is never released", planRelease({ ...base, queued: [q("z", "newsletter", 1)] }).ids.length === 0, "ignored");
  check("stopping a queued row needs no Klaviyo call", stateAfterStop("queued") === "removed", stateAfterStop("queued"));
  check("stopping an added row removes it from the list", stateAfterStop("added") === "pending_remove", stateAfterStop("added"));
}

console.log("\n=== 2. Deliverability guard ===");
{
  const h = (sent: number, bounce: number, spam: number) => deliverability({ sent, bounce, spam, unsub: 0 });
  check("clean week is ok", h(200, 1, 0).level === "ok", h(200, 1, 0).level);
  check("bounce over 2% stops", h(200, 5, 0).level === "stop", `${h(200, 5, 0).reason}`);
  check("bounce exactly 2% does not stop", h(200, 4, 0).level !== "stop", h(200, 4, 0).level);
  check("bounce 1.5% is watch", h(200, 3, 0).level === "watch", h(200, 3, 0).level);
  check("spam over 0.3% stops", h(500, 0, 2).level === "stop", h(500, 0, 2).level);
  check("one complaint in 300 (0.33%) stops", h(300, 0, 1).level === "stop", h(300, 0, 1).level);
  check("one complaint in 1,000 is watch, not stop", h(1000, 0, 1).level === "watch", h(1000, 0, 1).level);
  check("one bounce in the first 10 emails does not stop", h(10, 1, 0).level === "ok", h(10, 1, 0).level);
  check("five bounces in the first 20 emails stops", h(20, 5, 0).level === "stop", h(20, 5, 0).level);
  check("two complaints in the first 20 emails stops", h(20, 0, 2).level === "stop", h(20, 0, 2).level);
  check("nothing sent is ok with no rate", h(0, 0, 0).level === "ok" && h(0, 0, 0).bounceRate === null, "null");
  check("stop reason is a sentence Luis can read", /Bounces at 2\.5%/.test(h(200, 5, 0).reason ?? ""), h(200, 5, 0).reason ?? "");
  check("the bounce line is 2%", BOUNCE_STOP === 0.02, String(BOUNCE_STOP));
}

console.log("\n=== 3. Events: ours only, real interest only ===");
{
  const quietFlow = PROGRAMS.find((p) => p.key === "quiet")!.klaviyoFlowId;
  const ev = (props: Record<string, unknown>, o: Partial<KlaviyoEventLite> = {}): KlaviyoEventLite =>
    ({ id: "E1", datetime: "2026-09-29T14:00:00+00:00", profileId: "P1", properties: props, ...o });
  const click = toNurtureEvent("click", ev({ $flow: quietFlow, $message: "M1", URL: "https://www.fundedcapital.com/apply", Subject: "Still working on that deal?" }));
  check("a real click on a nurture flow is kept", click?.program === "quiet" && click.url === "https://www.fundedcapital.com/apply" && click.flowMessageId === "M1", JSON.stringify(click));
  check("a newsletter (campaign) event is dropped", toNurtureEvent("sent", ev({ $campaign: "X", Subject: "Newsletter" })) === null, "no $flow");
  check("another flow's event is dropped", toNurtureEvent("sent", ev({ $flow: "ZZZZZZ" })) === null, "foreign flow");
  check("a bot click is dropped", toNurtureEvent("click", ev({ $flow: quietFlow, "Bot Click": true, URL: "https://x" })) === null, "bot");
  check("an unsubscribe-link click is dropped", toNurtureEvent("click", ev({ $flow: quietFlow, URL: "https://manage.kmail-lists.com/subscriptions/unsubscribe?a=1" })) === null, "unsub link");
  check("a preferences-link click is dropped", toNurtureEvent("click", ev({ $flow: quietFlow, URL: "https://x/manage-preferences" })) === null, "prefs");
  check("an Apple privacy open is dropped", toNurtureEvent("open", ev({ $flow: quietFlow, "Machine Open": true })) === null, "machine open");
  check("a person-less event is dropped", toNurtureEvent("sent", ev({ $flow: quietFlow }, { profileId: null })) === null, "no profile");
  check("an undated event is dropped", toNurtureEvent("sent", ev({ $flow: quietFlow }, { datetime: null })) === null, "no date");
  check("sent events carry no URL", toNurtureEvent("sent", ev({ $flow: quietFlow, URL: "https://x" }))?.url === null, "null url");
  const long = toNurtureEvent("click", ev({ $flow: quietFlow, URL: "https://x/" + "a".repeat(900) }));
  check("URLs are clipped", (long?.url?.length ?? 0) === 500, String(long?.url?.length));
  check("every programme's flow maps back", PROGRAMS.every((p) => toNurtureEvent("sent", ev({ $flow: p.klaviyoFlowId }))?.program === p.key), "5/5");
  check("flow ids are the five built on 26 Sep", PROGRAMS.map((p) => p.klaviyoFlowId).sort().join(",") === "SQQjV4,TWFaDN,UTRYvx,WSv8R7,YqFvfY", PROGRAMS.map((p) => p.klaviyoFlowId).join(","));

  const now = MON_10;
  check("first read goes back 30 days", Math.round((now.getTime() - eventsFrom(null, now).getTime()) / 86_400_000) === 30, eventsFrom(null, now).toISOString());
  const cur = new Date(now.getTime() - 15 * 60_000).toISOString();
  check("later reads overlap the cursor by 2 hours", now.getTime() - eventsFrom(cur, now).getTime() === 135 * 60_000, eventsFrom(cur, now).toISOString());
  check("an ancient cursor is capped at 60 days", Math.round((now.getTime() - eventsFrom("2020-01-01T00:00:00Z", now).getTime()) / 86_400_000) === 60, "60");
  check("a future cursor never skips ahead", eventsFrom("2030-01-01T00:00:00Z", now).getTime() < now.getTime(), "clamped");
}

console.log("\n=== 4. Flows ===");
{
  const LIST = "S2b2zL", FLOW = "UTRYvx";
  const flow = (o: { triggerList?: string; filterList?: string | null; status?: string } = {}) => ({
    data: {
      type: "flow", id: FLOW,
      attributes: {
        name: "Lending OS · Investor contacts", status: o.status ?? "draft",
        definition: {
          triggers: [{ type: "list", id: o.triggerList ?? LIST }],
          profile_filter: { condition_groups: o.filterList === null ? [] : [{ conditions: [{ type: "profile-group-membership", is_member: true, group_ids: [o.filterList ?? LIST] }] }] },
          entry_action_id: "1",
          actions: [
            { id: "1", type: "send-email", data: { status: "draft", message: { id: "M1", name: "C1", subject_line: "What we fund, from Luis", preview_text: "p1", template_id: "T1" } }, links: { next: "2" } },
            { id: "2", type: "time-delay", data: { unit: "days", value: 14 }, links: { next: "3" } },
            { id: "3", type: "send-email", data: { status: "draft", message: { id: "M2", name: "S3", subject_line: "Banks said no?", preview_text: "p2", template_id: "T2" } }, links: { next: "4" } },
            { id: "4", type: "time-delay", data: { unit: "days", value: 30 }, links: { next: "5" } },
            { id: "5", type: "send-email", data: { status: "draft", message: { id: "M3", name: "S5", subject_line: "Still investing this year?", preview_text: "p3", template_id: "T3" } }, links: { next: null } },
          ],
        },
      },
    },
  });
  const snap = parseFlow(flow(), { flowId: FLOW, listId: LIST });
  check("parses three emails in send order", snap?.emails.map((e) => e.subject).join(" | ") === "What we fund, from Luis | Banks said no? | Still investing this year?", snap?.emails.map((e) => e.subject).join(" | ") ?? "null");
  check("adds up the waits (0, 14, 44 days)", snap?.emails.map((e) => e.afterDays).join(",") === "0,14,44", snap?.emails.map((e) => e.afterDays).join(",") ?? "");
  check("safe flow has no problems", flowProblems(snap).length === 0, flowProblems(snap).join(" "));
  check("a different flow id is rejected", parseFlow(flow(), { flowId: "OTHER", listId: LIST }) === null, "null");
  check("garbage is rejected", parseFlow({ errors: [] }, { flowId: FLOW, listId: LIST }) === null, "null");
  check("wrong trigger list is a problem", flowProblems(parseFlow(flow({ triggerList: "XXXX" }), { flowId: FLOW, listId: LIST })).length === 1, "trigger");
  check("missing 'is in list' filter is a problem (removal would not stop emails)", /not stop their emails/.test(flowProblems(parseFlow(flow({ filterList: null }), { flowId: FLOW, listId: LIST })).join(" ")), "filter");
  check("filter on a different list is a problem", flowProblems(parseFlow(flow({ filterList: "XXXX" }), { flowId: FLOW, listId: LIST })).length === 1, "filter");
  check("unread flow is a problem", flowProblems(null).length === 1, "null");
  const cyc = flow(); (cyc.data.attributes.definition.actions[4].links as { next: string | null }).next = "1";
  check("a looping definition terminates", (parseFlow(cyc, { flowId: FLOW, listId: LIST })?.emails.length ?? 0) === 3, "3");

  const withHtml = { ...snap!, emails: snap!.emails.map((e, i) => ({ ...e, html: i === 0 ? "<p>one</p>" : null })) };
  const carried = carryPreviews(withHtml, snap!);
  check("previews carry over for unchanged templates", carried.emails[0].html === "<p>one</p>" && carried.emails[1].html === null, "carried");
  const changed = carryPreviews(withHtml, { ...snap!, emails: snap!.emails.map((e, i) => (i === 0 ? { ...e, templateId: "T9" } : e)) });
  check("a changed template drops its old preview", changed.emails[0].html === null, "dropped");
  const full = { ...snap!, emails: snap!.emails.map((e) => ({ ...e, html: "<p/>" })) };
  check("missing previews are stale", previewsStale(carried, new Date().toISOString(), MON_10), "stale");
  check("fresh complete previews are not stale", !previewsStale(full, new Date(MON_10.getTime() - 3_600_000).toISOString(), MON_10), "fresh");
  check("day-old previews are stale", previewsStale(full, new Date(MON_10.getTime() - 25 * 3_600_000).toISOString(), MON_10), "old");
  check("snapshot survives a JSON round trip", JSON.stringify(snapshotOf(JSON.stringify(full))) === JSON.stringify(full), "round trip");
  check("snapshotOf refuses junk", snapshotOf("{nope") === null && snapshotOf({ a: 1 }) === null, "null");
  check("day labels", afterLabel(0) === "Straight away" && afterLabel(14) === "Day 14", `${afterLabel(0)} / ${afterLabel(14)}`);
  check("mode parse", parseMode("auto") === "auto" && parseMode("review") === "review" && parseMode("live") === null, "strict");
}

console.log("\n=== 5. Report ===");
{
  const w = { start: Date.parse("2026-09-01T00:00:00Z"), end: Date.parse("2026-09-30T00:00:00Z") };
  const row = (o: Partial<NurtureReportRow>): NurtureReportRow => ({ program: "quiet", releasedAt: "2026-09-10T14:00:00Z", status: "active", stopReason: null, sent: 1, opened: 0, clicked: 0, dealWithin90: false, ...o });
  const rows = [
    row({ opened: 1, clicked: 1, stopReason: "replied", status: "stopped" }),
    row({ opened: 1 }),
    row({ sent: 0 }),
    row({ dealWithin90: true, stopReason: "new_deal", status: "stopped" }),
    row({ program: "lost", stopReason: "unsubscribed", status: "stopped" }),
    row({ releasedAt: "2026-08-01T00:00:00Z", clicked: 5 }),
    row({ releasedAt: null }),
  ];
  const r = nurtureReport(rows, w);
  const quiet = r.lines.find((l) => l.key === "quiet")!;
  check("cohort = released in window", quiet.released === 4, String(quiet.released));
  check("reached = sent at least one email", quiet.reached === 3, String(quiet.reached));
  check("open rate is of people reached", quiet.openPct === 67, String(quiet.openPct));
  check("click rate is of people reached", quiet.clickPct === 33, String(quiet.clickPct));
  check("replies and deals counted", quiet.replied === 1 && quiet.deals === 1, `${quiet.replied}/${quiet.deals}`);
  check("unsubscribes counted per programme", r.lines.find((l) => l.key === "lost")!.unsubscribed === 1, "1");
  check("total line covers everyone released in window", r.total?.released === 5, String(r.total?.released));
  check("no cohort → no total", nurtureReport([], w).total === null, "null");
  check("all five programmes always listed", r.lines.length === 5, String(r.lines.length));
  check("rates never exceed 100%", r.lines.every((l) => (l.openPct ?? 0) <= 100 && (l.clickPct ?? 0) <= 100), "bounded");
}

{
  console.log("\n=== Opt-outs from anyone in Klaviyo (30 Sep 2026) ===");
  const oc = cockpitMod;
  check("reads unsubscribes and spam complaints, nothing else", oc.OPT_OUT_METRICS.map((m) => m.kind).sort().join(",") === "spam,unsub", oc.OPT_OUT_METRICS.map((m) => m.kind).join(","));
  const now = new Date("2026-09-30T12:00:00Z");
  check("first read goes back far enough for the newsletter years", oc.optOutsFrom(null, now).getTime() <= now.getTime() - 700 * 86_400_000, oc.optOutsFrom(null, now).toISOString());
  check("later reads start just before the cursor", oc.optOutsFrom("2026-09-30T10:00:00Z", now).toISOString() === "2026-09-30T08:00:00.000Z", oc.optOutsFrom("2026-09-30T10:00:00Z", now).toISOString());
  check("a future cursor is clamped to now", oc.optOutsFrom("2027-01-01T00:00:00Z", now).getTime() < now.getTime(), "");
  const em = oc.optOutEmails([{ email: " Tony@Example.com " }, { email: "tony@example.com" }, { email: null }, {}, { email: "not an email" }, { email: "a@b.co" }, { email: "x@y" }]);
  check("addresses are lower-cased, de-duplicated, odd ones skipped", JSON.stringify(em) === JSON.stringify(["a@b.co", "tony@example.com"]), JSON.stringify(em));
}

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail > 0 ? 1 : 0);
