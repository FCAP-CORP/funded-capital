/**
 * Regression suite for tasks on a deal.
 *
 * `now` is fixed so the suite means the same thing every day it runs. The
 * evening cases are the ones that matter: at 9pm in New York it is already
 * tomorrow in UTC, and a task rule counting UTC days gets "overdue" wrong for
 * four hours every night.
 */

import {
  MAX_TASK_DUE_DAYS,
  MAX_TASK_TITLE,
  RECENT_DONE_LIMIT,
  arrangeTasks,
  dayDiff,
  dueLabel,
  isIsoDay,
  isUuid,
  nyToday,
  parseDueDate,
  parseTaskTitle,
  taskState,
  type TaskLike,
} from "./tasks";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};

/** Thursday 24 September 2026, 14:00 UTC = 10:00 in New York. */
const MORNING = new Date("2026-09-24T14:00:00.000Z");
/** Thursday 24 September 2026, 21:30 in New York = Friday 01:30 UTC. */
const EVENING = new Date("2026-09-25T01:30:00.000Z");

console.log("\n=== 1. Titles ===");
const t1 = parseTaskTitle("  Order the appraisal  ");
check("surrounding space is trimmed", t1.ok && t1.value === "Order the appraisal", t1.ok ? `"${t1.value}"` : t1.error);
const t2 = parseTaskTitle("Chase\n\nthe   binder");
check("inner whitespace collapses to one line", t2.ok && t2.value === "Chase the binder", t2.ok ? `"${t2.value}"` : t2.error);
check("empty is refused", !parseTaskTitle("").ok, "refused");
check("whitespace only is refused", !parseTaskTitle("   \n ").ok, "refused");
check("a non-string is refused", !parseTaskTitle(42).ok, "refused");
check("undefined is refused", !parseTaskTitle(undefined).ok, "refused");
check("exactly the limit is accepted", parseTaskTitle("x".repeat(MAX_TASK_TITLE)).ok, `${MAX_TASK_TITLE} chars`);
check("one over the limit is refused", !parseTaskTitle("x".repeat(MAX_TASK_TITLE + 1)).ok, "refused");
check("the limit is 200, matching the database CHECK", MAX_TASK_TITLE === 200, String(MAX_TASK_TITLE));

console.log("\n=== 2. The New York calendar ===");
check("morning: today is the 24th", nyToday(MORNING) === "2026-09-24", nyToday(MORNING));
check("9:30pm New York is STILL the 24th (UTC says the 25th)", nyToday(EVENING) === "2026-09-24", nyToday(EVENING));
check("winter offset too: 11pm EST 31 Dec is still 31 Dec", nyToday(new Date("2027-01-01T04:00:00Z")) === "2026-12-31", nyToday(new Date("2027-01-01T04:00:00Z")));
check("day diff forward", dayDiff("2026-09-24", "2026-10-01") === 7, String(dayDiff("2026-09-24", "2026-10-01")));
check("day diff across a DST change is whole days", dayDiff("2026-10-31", "2026-11-02") === 2, String(dayDiff("2026-10-31", "2026-11-02")));
check("day diff backward", dayDiff("2026-09-24", "2026-09-20") === -4, String(dayDiff("2026-09-24", "2026-09-20")));
check("a real date is a date", isIsoDay("2028-02-29"), "leap day");
check("30 February is not", !isIsoDay("2026-02-30"), "refused");
check("a timestamp is not a day", !isIsoDay("2026-09-24T00:00:00Z"), "refused");
check("US order is not a day", !isIsoDay("09/24/2026"), "refused");

console.log("\n=== 3. Due dates ===");
const d0 = parseDueDate("", MORNING);
check("no date is a normal task", d0.ok && d0.value === null, "null");
const dn = parseDueDate(null, MORNING);
check("null is no date", dn.ok && dn.value === null, "null");
const dToday = parseDueDate("2026-09-24", MORNING);
check("TODAY is allowed", dToday.ok && dToday.value === "2026-09-24", dToday.ok ? String(dToday.value) : dToday.error);
const dEveToday = parseDueDate("2026-09-24", EVENING);
check("today is still allowed at 9:30pm New York", dEveToday.ok, dEveToday.ok ? "accepted" : dEveToday.error);
const dYest = parseDueDate("2026-09-23", MORNING);
check("yesterday is refused", !dYest.ok, dYest.ok ? "WRONGLY ACCEPTED" : dYest.error);
const dFar = parseDueDate("2030-01-01", MORNING);
check(`beyond ${MAX_TASK_DUE_DAYS} days is refused`, !dFar.ok, dFar.ok ? "WRONGLY ACCEPTED" : dFar.error);
const dEdge = parseDueDate("2028-09-23", MORNING);
check("just inside two years is accepted", dEdge.ok, dEdge.ok ? "accepted" : dEdge.error);
check("garbage is refused", !parseDueDate("next thursday", MORNING).ok, "refused");
check("a number is refused", !parseDueDate(20260924, MORNING).ok, "refused");
check("an impossible date is refused", !parseDueDate("2026-02-30", MORNING).ok, "refused");

console.log("\n=== 4. State ===");
const open = (dueOn: string | null) => ({ dueOn, completedAt: null });
check("due yesterday is overdue", taskState(open("2026-09-23"), MORNING) === "overdue", taskState(open("2026-09-23"), MORNING));
check("due today is due today", taskState(open("2026-09-24"), MORNING) === "due_today", "due_today");
check("due today is NOT overdue at 9:30pm New York", taskState(open("2026-09-24"), EVENING) === "due_today", taskState(open("2026-09-24"), EVENING));
check("due tomorrow is upcoming", taskState(open("2026-09-25"), MORNING) === "upcoming", "upcoming");
check("no date is no date", taskState(open(null), MORNING) === "no_date", "no_date");
check("a finished task is done even if its date passed", taskState({ dueOn: "2026-01-01", completedAt: "2026-01-02T00:00:00Z" }, MORNING) === "done", "done");

console.log("\n=== 5. Labels ===");
check("today", dueLabel("2026-09-24", MORNING) === "Today", dueLabel("2026-09-24", MORNING));
check("tomorrow", dueLabel("2026-09-25", MORNING) === "Tomorrow", dueLabel("2026-09-25", MORNING));
check("yesterday", dueLabel("2026-09-23", MORNING) === "Yesterday", dueLabel("2026-09-23", MORNING));
check("a named day this year", dueLabel("2026-10-01", MORNING) === "Thu 1 Oct", dueLabel("2026-10-01", MORNING));
check("the year appears only when it differs", dueLabel("2027-01-15", MORNING) === "Fri 15 Jan 2027", dueLabel("2027-01-15", MORNING));
check("the label is the stored day, not shifted a day by timezone", dueLabel("2026-10-01", EVENING) === "Thu 1 Oct", dueLabel("2026-10-01", EVENING));
check("no date", dueLabel(null, MORNING) === "No date", "No date");

console.log("\n=== 6. Order on the card ===");
const mk = (id: string, dueOn: string | null, createdAt: string, completedAt: string | null = null): TaskLike =>
  ({ id, title: id, dueOn, createdAt, completedAt });
const tasks: TaskLike[] = [
  mk("undated-new", null, "2026-09-20T00:00:00Z"),
  mk("upcoming-late", "2026-10-10", "2026-09-01T00:00:00Z"),
  mk("overdue-recent", "2026-09-22", "2026-09-01T00:00:00Z"),
  mk("today", "2026-09-24", "2026-09-01T00:00:00Z"),
  mk("undated-old", null, "2026-09-02T00:00:00Z"),
  mk("upcoming-soon", "2026-09-26", "2026-09-01T00:00:00Z"),
  mk("overdue-oldest", "2026-09-01", "2026-08-01T00:00:00Z"),
  ...Array.from({ length: RECENT_DONE_LIMIT + 2 }, (_, i) =>
    mk(`done-${i}`, null, "2026-08-01T00:00:00Z", `2026-09-${String(10 + i).padStart(2, "0")}T12:00:00Z`)),
];
const arranged = arrangeTasks(tasks, MORNING);
const order = arranged.open.map((x) => x.id).join(",");
check(
  "open: overdue (oldest first), today, upcoming by date, undated by age",
  order === "overdue-oldest,overdue-recent,today,upcoming-soon,upcoming-late,undated-old,undated-new",
  order,
);
check("the overdue count is two", arranged.overdue === 2, String(arranged.overdue));
check(`done is capped at ${RECENT_DONE_LIMIT}`, arranged.done.length === RECENT_DONE_LIMIT, String(arranged.done.length));
check("and the rest are counted, not dropped", arranged.hiddenDone === 2, String(arranged.hiddenDone));
check("done is newest first", arranged.done[0].id === `done-${RECENT_DONE_LIMIT + 1}`, arranged.done[0].id);
check("nothing done leaks into open", arranged.open.every((x) => !x.completedAt), "clean");
check("the input is not mutated", tasks[0].id === "undated-new", tasks[0].id);
const none = arrangeTasks([], MORNING);
check("no tasks is three empty lists", none.open.length === 0 && none.done.length === 0 && none.hiddenDone === 0, "empty");

console.log("\n=== 7. Ids from the browser ===");
check("a uuid is a uuid", isUuid("060b935c-0978-4f43-9cd1-1b993d50beff"), "yes");
check("upper case is fine", isUuid("060B935C-0978-4F43-9CD1-1B993D50BEFF"), "yes");
check("a SQL fragment is not", !isUuid("1' OR '1'='1"), "refused");
check("empty is not", !isUuid(""), "refused");
check("a number is not", !isUuid(123), "refused");
check("a uuid with junk after is not", !isUuid("060b935c-0978-4f43-9cd1-1b993d50beff/x"), "refused");

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail > 0 ? 1 : 0);
