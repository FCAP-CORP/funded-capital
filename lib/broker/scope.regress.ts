/**
 * Regression suite for broker scoping.
 *
 * This is the highest-consequence pure module in the project. `access.ts`
 * decides whether someone is staff; this decides which slice of the borrower
 * book a signed-in broker may see. A bug here does not throw and does not look
 * broken — it renders a tidy, plausible table containing a competitor's deals.
 *
 * So the suite is built around the leaks rather than around the happy path.
 * Legacy HML is used as the fixture because it is real and because it has three
 * people in it, which is exactly the shape that separates "member" from "lead".
 */

import {
  canViewApplication,
  canActOnApplication,
  queryScope,
  visibleApplications,
  type BrokerViewer,
  type ApplicationOwnership,
} from "./scope";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};

// ---------------------------------------------------------------------------
// Fixtures. Two real brokerages and the people in them.
// ---------------------------------------------------------------------------

const LEGACY = "firm_legacy_hml";
const FBC = "firm_funded_business_capital";

const marylen: BrokerViewer = { userId: "user_marylen", firmId: LEGACY, role: "owner", status: "active" };
const jasson: BrokerViewer = { userId: "user_jasson", firmId: LEGACY, role: "lead", status: "active" };
const processing: BrokerViewer = { userId: "user_processing", firmId: LEGACY, role: "member", status: "active" };
const jared: BrokerViewer = { userId: "user_jared", firmId: FBC, role: "owner", status: "active" };

/** Unassigned: registered on the portal, Luis has not linked them to a firm yet. */
const unassigned: BrokerViewer | null = null;

const app = (id: string, by: string | null, firm: string | null): ApplicationOwnership => ({
  applicationId: id, submittedByUserId: by, brokerFirmId: firm,
});

const jassonsDeal = app("app_1", "user_jasson", LEGACY);
const processingsDeal = app("app_2", "user_processing", LEGACY);
const jaredsDeal = app("app_3", "user_jared", FBC);
/** A BiggerPockets or website lead. Belongs to Funded Capital, to no brokerage. */
const houseLead = app("app_4", null, null);

console.log("\n=== 1. The leak that ends broker relationships: across firms ===");
check("owner cannot see another firm's deal", !canViewApplication(marylen, jaredsDeal), "denied");
check("lead cannot see another firm's deal", !canViewApplication(jasson, jaredsDeal), "denied");
check("member cannot see another firm's deal", !canViewApplication(processing, jaredsDeal), "denied");
check("and not in reverse either", !canViewApplication(jared, jassonsDeal), "denied");
check("no acting across firms", !canActOnApplication(marylen, jaredsDeal), "denied");

console.log("\n=== 2. House leads belong to nobody but Funded Capital ===");
// If this ever passes, every broker in the system sees every BiggerPockets lead.
// `null === null` is the bug that would do it.
check("owner cannot see a house lead", !canViewApplication(marylen, houseLead), "denied");
check("lead cannot see a house lead", !canViewApplication(jasson, houseLead), "denied");
check("member cannot see a house lead", !canViewApplication(processing, houseLead), "denied");

console.log("\n=== 3. Inside one firm, role decides ===");
check("owner sees a colleague's deal", canViewApplication(marylen, jassonsDeal), "allowed");
check("lead sees a colleague's deal", canViewApplication(jasson, processingsDeal), "allowed");
check("MEMBER does not see a colleague's deal", !canViewApplication(processing, jassonsDeal), "denied");
check("member sees their own", canViewApplication(processing, processingsDeal), "allowed");
check("lead sees their own", canViewApplication(jasson, jassonsDeal), "allowed");

console.log("\n=== 4. Team leads can act, not just look — Luis asked for this ===");
check("owner can act on a team deal", canActOnApplication(marylen, jassonsDeal), "allowed");
check("lead can act on a team deal", canActOnApplication(jasson, processingsDeal), "allowed");
check("member cannot act on a colleague's", !canActOnApplication(processing, jassonsDeal), "denied");
check("member can act on their own", canActOnApplication(processing, processingsDeal), "allowed");

console.log("\n=== 5. A broker with no firm yet still sees their own work ===");
// They sign up, submit, and wait for Luis to link them to a firm. Their firmId
// is genuinely null in that window. If their own deal vanished until he got
// round to it, the portal would look broken on their first ever use.
const newBroker: BrokerViewer = { userId: "user_new", firmId: null, role: "member", status: "active" };
const theirOwn = app("app_5", "user_new", null);
check("own deal before firm assignment", canViewApplication(newBroker, theirOwn), "allowed");
check("can act on their own", canActOnApplication(newBroker, theirOwn), "allowed");
check("but still not someone else's", !canViewApplication(newBroker, jassonsDeal), "denied");
check("and still not a house lead", !canViewApplication(newBroker, houseLead), "denied");
check("unassigned scope is own-only", queryScope(newBroker).kind === "own", "own");

// The nastiest case in the file. An OWNER with no firm must not match every
// application that also has no firm — that is every website and BiggerPockets
// lead in the book, handed over by a stray `null === null`.
const unassignedOwner: BrokerViewer = { userId: "user_pending", firmId: null, role: "owner", status: "active" };
check("unassigned OWNER cannot see a house lead", !canViewApplication(unassignedOwner, houseLead), "denied");
check("unassigned owner cannot see another's null-firm deal", !canViewApplication(unassignedOwner, theirOwn), "denied");
check("unassigned owner cannot see a firm deal", !canViewApplication(unassignedOwner, jassonsDeal), "denied");
check("unassigned owner scope is own-only", queryScope(unassignedOwner).kind === "own", "own");

console.log("\n=== 6. Fails closed on every missing piece ===");
check("no membership at all", !canViewApplication(unassigned, jassonsDeal), "denied");
check("undefined membership", !canViewApplication(undefined, jassonsDeal), "denied");
check("suspended owner sees nothing", !canViewApplication({ ...marylen, status: "suspended" }, jassonsDeal), "denied");
check("suspended owner cannot act", !canActOnApplication({ ...marylen, status: "suspended" }, jassonsDeal), "denied");
check("suspended, not even their own", !canViewApplication({ ...jasson, status: "suspended" }, jassonsDeal), "denied");
check("empty userId", !canViewApplication({ ...marylen, userId: "" }, jassonsDeal), "denied");
check("blank firmId grants no firm access", !canViewApplication({ ...marylen, firmId: "" }, jassonsDeal), "denied");
check("null firmId grants no firm access", !canViewApplication({ ...marylen, firmId: null }, jassonsDeal), "denied");

console.log("\n=== 7. An unattributed deal is not everyone's deal ===");
// A firm deal whose submitter was never recorded: firm-wide roles see it
// because it carries their firm id, a member does not, and nobody matches on
// a null submitter.
const orphan = app("app_6", null, LEGACY);
check("owner sees an unattributed firm deal", canViewApplication(marylen, orphan), "allowed");
check("member does NOT", !canViewApplication(processing, orphan), "denied");
check("null submitter matches no one", !canViewApplication({ ...processing, userId: "" }, orphan), "denied");

console.log("\n=== 8. queryScope says the same thing the row check says ===");
const sOwner = queryScope(marylen);
const sMember = queryScope(processing);
const sNone = queryScope(unassigned);
check("owner gets firm-or-own", sOwner.kind === "firm-or-own", sOwner.kind);
check("lead gets firm-or-own", queryScope(jasson).kind === "firm-or-own", "firm-or-own");
check("member gets own only", sMember.kind === "own", sMember.kind);
check("no membership gets nothing", sNone.kind === "nothing", sNone.kind);
check("suspended gets nothing", queryScope({ ...marylen, status: "suspended" }).kind === "nothing", "nothing");
check("owner scope carries the right firm", sOwner.kind === "firm-or-own" && sOwner.firmId === LEGACY, LEGACY);
check("member scope carries the right user", sMember.kind === "own" && sMember.userId === "user_processing", "user_processing");

console.log("\n=== 9. The list filter, as a second line of defence ===");
const everything = [jassonsDeal, processingsDeal, jaredsDeal, houseLead, orphan];
const forOwner = visibleApplications(marylen, everything).map((a) => a.applicationId);
const forMember = visibleApplications(processing, everything).map((a) => a.applicationId);
const forNobody = visibleApplications(unassigned, everything);
check("owner sees only their firm's three", forOwner.join(",") === "app_1,app_2,app_6", forOwner.join(",") || "none");
check("member sees only their own one", forMember.join(",") === "app_2", forMember.join(",") || "none");
check("no membership sees none", forNobody.length === 0, "0 rows");
check("nothing from another firm leaked", !forOwner.includes("app_3"), "app_3 absent");
check("no house lead leaked", !forOwner.includes("app_4") && !forMember.includes("app_4"), "app_4 absent");

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail > 0 ? 1 : 0);
