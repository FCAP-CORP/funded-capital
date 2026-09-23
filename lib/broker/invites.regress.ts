/**
 * Regression suite for broker invitations.
 *
 * An invitation is the thing that decides whether a stranger gets into the
 * portal at all, and — because it carries a firm — which pipeline they land in.
 * Both halves are worth locking down, and the second is the one that could go
 * wrong quietly: an invite that moves an existing broker between firms would
 * change what they can read without anyone choosing that.
 */

import {
  inviteStatus,
  validateInvite,
  canAcceptInvite,
  inviteToBrokerFields,
  shouldApplyInviteToExistingBroker,
  sortInvites,
  inviteAgeDays,
  INVITE_STATUS_LABEL,
  type BrokerInvite,
} from "./invites";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};

const LEGACY = "firm_legacy_hml";

const pending: BrokerInvite = {
  id: "inv_1",
  email: "jasson@legacyhml.com",
  firmId: LEGACY,
  role: "lead",
  note: null,
  invitedAt: "2026-09-22T20:00:00Z",
  acceptedAt: null,
  acceptedByUserId: null,
  revokedAt: null,
};

console.log("\n=== 1. Status, and revoked beating accepted ===");
check("a fresh invite is pending", inviteStatus(pending) === "pending", "pending");
check(
  "an accepted invite is accepted",
  inviteStatus({ acceptedAt: "2026-09-23T10:00:00Z", revokedAt: null }) === "accepted",
  "accepted",
);
check(
  "a revoked invite is revoked",
  inviteStatus({ acceptedAt: null, revokedAt: "2026-09-23T10:00:00Z" }) === "revoked",
  "revoked",
);
check(
  "REVOKED WINS over accepted — it is the later decision",
  inviteStatus({ acceptedAt: "2026-09-23T10:00:00Z", revokedAt: "2026-09-24T10:00:00Z" }) === "revoked",
  "revoked",
);
check(
  "every status has a label for the screen",
  Boolean(INVITE_STATUS_LABEL.pending && INVITE_STATUS_LABEL.accepted && INVITE_STATUS_LABEL.revoked),
  "3 labels",
);

console.log("\n=== 2. Validation ===");
const good = validateInvite("  Jasson@LegacyHML.com ", LEGACY, "lead", "  Legacy HML principal  ");
check("email is lowercased and trimmed", good.ok && good.value.email === "jasson@legacyhml.com", good.ok ? good.value.email : good.error);
check("firm is carried", good.ok && good.value.firmId === LEGACY, "carried");
check("role is carried", good.ok && good.value.role === "lead", "lead");
check("note is trimmed", good.ok && good.value.note === "Legacy HML principal", "trimmed");

const noFirm = validateInvite("a@b.com", "", "member");
check("an EMPTY firm select means no firm, not an empty-string id", noFirm.ok && noFirm.value.firmId === null, "null");
const nullFirm = validateInvite("a@b.com", null, "member");
check("a null firm is also null", nullFirm.ok && nullFirm.value.firmId === null, "null");
check("an empty note becomes null", noFirm.ok && noFirm.value.note === null, "null");

check("a blank email is refused", !validateInvite("", LEGACY, "lead").ok, "refused");
check("a string with no @ is refused", !validateInvite("jasson", LEGACY, "lead").ok, "refused");
check("an unknown role is refused", !validateInvite("a@b.com", LEGACY, "admin").ok, "refused");
check("a missing role is refused", !validateInvite("a@b.com", LEGACY, undefined).ok, "refused");
check("an over-long note is refused", !validateInvite("a@b.com", LEGACY, "lead", "x".repeat(281)).ok, "refused");
check("a note at the cap is allowed", validateInvite("a@b.com", LEGACY, "lead", "x".repeat(280)).ok, "allowed");

console.log("\n=== 3. Accepting — the email is the whole security property ===");
check("the invited address can accept", canAcceptInvite(pending, "jasson@legacyhml.com").ok, "ok");
check(
  "case and whitespace still match",
  canAcceptInvite(pending, "  JASSON@LegacyHML.COM ").ok,
  "ok",
);

const wrongPerson = canAcceptInvite(pending, "hector@legacyhml.com");
check("a COLLEAGUE cannot use it", !wrongPerson.ok, wrongPerson.ok ? "" : wrongPerson.reason);

const sameDomain = canAcceptInvite(pending, "anyone@legacyhml.com");
check("...nor can anyone else at the same domain", !sameDomain.ok, "refused");

const lookalike = canAcceptInvite(pending, "jasson@legacyhml.com.evil.net");
check("a look-alike domain cannot use it", !lookalike.ok, "refused");

check("no invite at all is refused", !canAcceptInvite(null, "jasson@legacyhml.com").ok, "refused");
check("no signed-in email is refused", !canAcceptInvite(pending, null).ok, "refused");
check("an empty signed-in email is refused", !canAcceptInvite(pending, "").ok, "refused");

const revoked = canAcceptInvite({ ...pending, revokedAt: "2026-09-23T00:00:00Z" }, "jasson@legacyhml.com");
check("a revoked invite is refused", !revoked.ok, revoked.ok ? "" : revoked.reason);

const used = canAcceptInvite(
  { ...pending, acceptedAt: "2026-09-23T00:00:00Z", acceptedByUserId: "user_jasson" },
  "jasson@legacyhml.com",
);
check("an already-used invite cannot be used twice", !used.ok, used.ok ? "" : used.reason);
check(
  "...not even by the SAME person, so a shared link cannot be replayed",
  !canAcceptInvite({ ...pending, acceptedAt: "2026-09-23T00:00:00Z", acceptedByUserId: "user_jasson" }, "jasson@legacyhml.com").ok,
  "refused",
);

console.log("\n=== 4. What a new broker inherits ===");
const fields = inviteToBrokerFields(pending);
check("firm comes from the invite", fields.firmId === LEGACY, fields.firmId ?? "null");
check("role comes from the invite", fields.role === "lead", fields.role);
const openFields = inviteToBrokerFields({ ...pending, firmId: null, role: "member" });
check("an invite with no firm lands them unassigned", openFields.firmId === null, "null");
check("...with the role still honoured", openFields.role === "member", "member");

console.log("\n=== 5. An invite NEVER moves an existing broker ===");
check(
  "a stale invite cannot re-home someone already in a firm",
  shouldApplyInviteToExistingBroker() === false,
  "false",
);

console.log("\n=== 6. Pending invites sort to the top ===");
const rows = [
  { email: "c@x.com", invitedAt: "2026-09-01T00:00:00Z", acceptedAt: "2026-09-02T00:00:00Z", revokedAt: null },
  { email: "a@x.com", invitedAt: "2026-09-20T00:00:00Z", acceptedAt: null, revokedAt: null },
  { email: "d@x.com", invitedAt: "2026-09-10T00:00:00Z", acceptedAt: null, revokedAt: "2026-09-11T00:00:00Z" },
  { email: "b@x.com", invitedAt: "2026-09-22T00:00:00Z", acceptedAt: null, revokedAt: null },
];
const sorted = sortInvites(rows).map((r) => r.email);
check("both pending come first", sorted.slice(0, 2).join(",") === "b@x.com,a@x.com", sorted.join(","));
check("newest pending is at the very top", sorted[0] === "b@x.com", sorted[0]);
check("accepted before revoked", sorted[2] === "c@x.com" && sorted[3] === "d@x.com", sorted.slice(2).join(","));
check("the input array is not mutated", rows[0].email === "c@x.com", "unmutated");

console.log("\n=== 7. Age, for nudging only — invites never expire on a timer ===");
const now = new Date("2026-09-25T00:00:00Z");
check("three days reads as 3", inviteAgeDays("2026-09-22T00:00:00Z", now) === 3, "3");
check("same day reads as 0", inviteAgeDays("2026-09-25T00:00:00Z", now) === 0, "0");
check("a future date clamps to 0, never negative", inviteAgeDays("2026-09-30T00:00:00Z", now) === 0, "0");
check("a missing date is null", inviteAgeDays(null, now) === null, "null");
check("an unparseable date is null", inviteAgeDays("not a date", now) === null, "null");
check(
  "a very old invite is still ACCEPTABLE — age is a nudge, not an expiry",
  canAcceptInvite({ ...pending, invitedAt: "2025-01-01T00:00:00Z" }, "jasson@legacyhml.com").ok,
  "ok",
);

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail > 0 ? 1 : 0);
