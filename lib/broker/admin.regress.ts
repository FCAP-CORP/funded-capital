/**
 * Regression suite for firm administration and deal claiming.
 *
 * `scope.regress.ts` covers what a broker may READ once the data is in place.
 * This covers how it gets in place — and that is the more dangerous half,
 * because attaching a deal to the wrong broker is a write, it is one-way, and
 * the result looks entirely normal afterwards.
 *
 * Built around the six ways a claim goes wrong rather than around the happy
 * path, with Legacy HML as the fixture because it is the real first firm.
 */

import {
  normaliseEmail,
  sameEmail,
  validateFirmName,
  isBrokerRole,
  isBrokerStatus,
  sortBrokerQueue,
  canClaimDeal,
  claimPatch,
  firmLabel,
  dealCountLabel,
  FIRM_NAME_MAX,
  BROKER_ROLES,
  ROLE_DESCRIPTION,
  type ClaimableDeal,
  type ClaimingBroker,
  type BrokerQueueRow,
} from "./admin";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const LEGACY = "firm_legacy_hml";
const FBC = "firm_funded_business_capital";

const jasson: ClaimingBroker = {
  id: "bu_jasson",
  clerkUserId: "user_jasson",
  email: "jasson@legacyhml.com",
  firmId: LEGACY,
  status: "active",
};

/** Registered this morning, not yet linked to anything. The normal first day. */
const newcomer: ClaimingBroker = {
  id: "bu_new",
  clerkUserId: "user_new",
  email: "someone@newbrokerage.com",
  firmId: null,
  status: "active",
};

/** One of Jasson's real Sheet deals, backfilled and still unattached. */
const elizabeth: ClaimableDeal = {
  applicationId: "app_elizabeth",
  submittedByUserId: null,
  brokerFirmId: null,
  brokerEmail: "jasson@legacyhml.com",
};

/** A borrower who came to Funded Capital directly. No broker on it at all. */
const houseLead: ClaimableDeal = {
  applicationId: "app_house",
  submittedByUserId: null,
  brokerFirmId: null,
  brokerEmail: null,
};

console.log("\n=== 1. normaliseEmail: one spelling, and nothing clever ===");
check("lowercases", normaliseEmail("Jasson@LegacyHML.com") === "jasson@legacyhml.com", "jasson@legacyhml.com");
check("trims", normaliseEmail("  jasson@legacyhml.com \n") === "jasson@legacyhml.com", "trimmed");
check("empty is null", normaliseEmail("") === null, "null");
check("whitespace is null", normaliseEmail("   ") === null, "null");
check("undefined is null", normaliseEmail(undefined) === null, "null");
check("null is null", normaliseEmail(null) === null, "null");
check("a string with no @ is null", normaliseEmail("jasson") === null, "null");
check(
  "plus-addressing is NOT stripped",
  normaliseEmail("jasson+deals@legacyhml.com") === "jasson+deals@legacyhml.com",
  "kept verbatim",
);
check(
  "dots are NOT folded",
  normaliseEmail("ja.sson@legacyhml.com") === "ja.sson@legacyhml.com",
  "kept verbatim",
);

console.log("\n=== 2. sameEmail: exact, never partial ===");
check("same address matches", sameEmail("jasson@legacyhml.com", "JASSON@legacyhml.com"), "match");
check("different local part does not", !sameEmail("jasson@legacyhml.com", "hector@legacyhml.com"), "no match");
check("same domain alone does not", !sameEmail("anyone@legacyhml.com", "jasson@legacyhml.com"), "no match");
check("a prefix does not match", !sameEmail("jasson@legacyhml.com", "jasson@legacyhml.com.evil.net"), "no match");
check("a suffix does not match", !sameEmail("son@legacyhml.com", "jasson@legacyhml.com"), "no match");
check("plus-address is a DIFFERENT person", !sameEmail("jasson+x@legacyhml.com", "jasson@legacyhml.com"), "no match");
check("null never matches null", !sameEmail(null, null), "no match");
check("null never matches a real address", !sameEmail(null, "jasson@legacyhml.com"), "no match");
check("empty never matches empty", !sameEmail("", ""), "no match");
check("a bare @ pair does not collapse", !sameEmail("a", "b"), "no match");

console.log("\n=== 3. Firm names ===");
const good = validateFirmName("  Legacy   HML  ");
check("trims and collapses whitespace", good.ok && good.value === "Legacy HML", good.ok ? good.value : good.error);
check("blank is refused", !validateFirmName("   ").ok, "refused");
check("null is refused", !validateFirmName(null).ok, "refused");
check("a long name is refused", !validateFirmName("x".repeat(FIRM_NAME_MAX + 1)).ok, "refused");
check("a name at the cap is allowed", validateFirmName("x".repeat(FIRM_NAME_MAX)).ok, "allowed");

console.log("\n=== 4. Role and status guards reject anything off the list ===");
check("owner is a role", isBrokerRole("owner"), "yes");
check("lead is a role", isBrokerRole("lead"), "yes");
check("member is a role", isBrokerRole("member"), "yes");
check("admin is NOT a role", !isBrokerRole("admin"), "rejected");
check("staff is NOT a role", !isBrokerRole("staff"), "rejected");
check("empty is not a role", !isBrokerRole(""), "rejected");
check("a number is not a role", !isBrokerRole(1), "rejected");
check("an object is not a role", !isBrokerRole({ role: "owner" }), "rejected");
check("active is a status", isBrokerStatus("active"), "yes");
check("suspended is a status", isBrokerStatus("suspended"), "yes");
check("deleted is NOT a status", !isBrokerStatus("deleted"), "rejected");
check(
  "every role has a description shown next to the picker",
  BROKER_ROLES.every((r) => Boolean(ROLE_DESCRIPTION[r])),
  `${BROKER_ROLES.length} roles`,
);
check(
  "member's description says own deals only",
  /only/i.test(ROLE_DESCRIPTION.member),
  ROLE_DESCRIPTION.member,
);

console.log("\n=== 5. canClaimDeal: the six refusals ===");
check("a matching, unattached deal is claimable", canClaimDeal(jasson, elizabeth).ok, "ok");

const suspended = canClaimDeal({ ...jasson, status: "suspended" }, elizabeth);
check("a suspended broker cannot claim", !suspended.ok, suspended.ok ? "" : suspended.reason);

const noFirm = canClaimDeal(newcomer, { ...elizabeth, brokerEmail: newcomer.email });
check("a broker with NO FIRM cannot claim", !noFirm.ok, noFirm.ok ? "" : noFirm.reason);
check(
  "...and the reason says to assign the firm first",
  !noFirm.ok && /firm first/i.test(noFirm.reason),
  "explains the fix",
);

const house = canClaimDeal(jasson, houseLead);
check("a HOUSE LEAD can never be claimed", !house.ok, house.ok ? "" : house.reason);

const taken = canClaimDeal(jasson, { ...elizabeth, submittedByUserId: "user_hector" });
check("an already-attached deal cannot be re-pointed", !taken.ok, taken.ok ? "" : taken.reason);

const firmed = canClaimDeal(jasson, { ...elizabeth, brokerFirmId: FBC });
check("a deal already stamped with a firm is refused", !firmed.ok, firmed.ok ? "" : firmed.reason);

const wrong = canClaimDeal(jasson, { ...elizabeth, brokerEmail: "hector@legacyhml.com" });
check("a colleague's deal is refused on the email check", !wrong.ok, wrong.ok ? "" : wrong.reason);
check(
  "...even though the colleague is at the SAME firm",
  !canClaimDeal(jasson, { ...elizabeth, brokerEmail: "wilson@legacyhml.com" }).ok,
  "refused",
);

const otherFirm = canClaimDeal(jasson, { ...elizabeth, brokerEmail: "jared@fundedbusiness.com" });
check("another firm's deal is refused", !otherFirm.ok, otherFirm.ok ? "" : otherFirm.reason);

check(
  "case and whitespace on the deal's email still match",
  canClaimDeal(jasson, { ...elizabeth, brokerEmail: "  JASSON@LegacyHML.COM  " }).ok,
  "ok",
);

console.log("\n=== 6. claimPatch stamps the firm from the broker's row ===");
const patch = claimPatch(jasson);
check("submittedByUserId is the CLERK id, not the row id", patch.submittedByUserId === "user_jasson", patch.submittedByUserId);
check("brokerFirmId is the broker's current firm", patch.brokerFirmId === LEGACY, patch.brokerFirmId);
let threw = false;
try { claimPatch(newcomer); } catch { threw = true; }
check("a firmless broker throws rather than stamping null", threw, "threw");

console.log("\n=== 7. The queue puts unassigned brokers first ===");
const rows: BrokerQueueRow[] = [
  { id: "1", email: "jasson@legacyhml.com", name: "Jasson", firmId: LEGACY, firmName: "Legacy HML", role: "lead", status: "active", deals: 2, firstSeenAt: "2026-08-03T00:00:00Z" },
  { id: "2", email: "new2@x.com", name: "Newer", firmId: null, firmName: null, role: "member", status: "active", deals: 0, firstSeenAt: "2026-09-20T00:00:00Z" },
  { id: "3", email: "abe@fundedbusiness.com", name: "Abe", firmId: FBC, firmName: "Funded Business Capital", role: "owner", status: "active", deals: 1, firstSeenAt: "2026-07-01T00:00:00Z" },
  { id: "4", email: "new1@x.com", name: "Older", firmId: null, firmName: null, role: "member", status: "active", deals: 0, firstSeenAt: "2026-09-01T00:00:00Z" },
];
const sorted = sortBrokerQueue(rows).map((r) => r.id);
check("both unassigned come first", sorted.slice(0, 2).sort().join(",") === "2,4", sorted.join(","));
check("newest unassigned is at the very top", sorted[0] === "2", sorted[0]);
check("assigned are grouped by firm name", sorted.slice(2).join(",") === "3,1", sorted.slice(2).join(","));
check("the input array is not mutated", rows[0].id === "1", "unmutated");

console.log("\n=== 8. Labels ===");
check("a null firm reads as Unassigned", firmLabel(null) === "Unassigned", "Unassigned");
check("a blank firm reads as Unassigned", firmLabel("   ") === "Unassigned", "Unassigned");
check("a real firm reads as itself", firmLabel("Legacy HML") === "Legacy HML", "Legacy HML");
check("zero deals", dealCountLabel(0) === "No deals yet", dealCountLabel(0));
check("one deal is singular", dealCountLabel(1) === "1 deal", dealCountLabel(1));
check("two deals is plural", dealCountLabel(2) === "2 deals", dealCountLabel(2));
check("thousands are grouped", dealCountLabel(1200) === "1,200 deals", dealCountLabel(1200));

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail > 0 ? 1 : 0);
