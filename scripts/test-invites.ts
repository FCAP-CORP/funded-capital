/**
 * End-to-end test of broker admission, against the DEV BRANCH database.
 *
 * WHY THIS EXISTS RATHER THAN A CLICK-THROUGH. The gate cannot be exercised in
 * a browser by Luis, because staff bypass it by design and his account already
 * has a `broker_users` row from earlier testing, which grandfathers him through.
 * Testing it by hand would mean juggling a second Clerk account and editing
 * environment variables between every step, and would still only cover one path.
 *
 * This calls the REAL `admitBroker` against the REAL database and exercises
 * every branch, including the ones that are hard to reach by hand: a replayed
 * invitation, a revoked one, and the grandfather case.
 *
 * WHAT IT DOES NOT COVER. `createInvite` asserts staff access, which needs a
 * Clerk request context that does not exist in a script. So invitations here are
 * inserted directly. The issuing UI is what Luis clicks; this covers the half
 * that decides who gets in, which is the half with the security consequences.
 *
 * Run it with `fc-test-invites.bat`. It refuses to touch production, uses
 * `.invalid` addresses that can never belong to a real person, and deletes
 * everything it created before it exits — including on failure.
 */

import { join } from "node:path";
import { config as loadEnv } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";

/**
 * Load .env.local BEFORE importing anything that reads DATABASE_URL.
 *
 * `lib/db` throws at import time when DATABASE_URL is unset, and `provision.ts`
 * imports it — so these two lines have to run first. Every other script in this
 * folder does the same thing for the same reason.
 */
const ROOT = process.cwd();
loadEnv({ path: join(ROOT, ".env.local") });
loadEnv({ path: join(ROOT, ".env") });

/** The production endpoint. This script must never run against it. */
const PRODUCTION_ENDPOINT = "ep-calm-grass-aw5jrvyn";

type Row = Record<string, unknown>;

/**
 * Read rows out of a drizzle result.
 *
 * The cast goes through `unknown` deliberately. `NeonHttpQueryResult` does not
 * structurally overlap with a hand-written `{ rows: ... }` shape, so a direct
 * cast is a TS2352 error — which the production build catches and `tsx` does
 * not, because tsx strips types with esbuild and never typechecks. Running this
 * script successfully proves nothing about its types.
 */
const rowsOf = (r: unknown): Row[] => (r as { rows?: Row[] }).rows ?? (r as Row[]);

/** COUNT(*)::int comes back as a number or a string depending on the driver. */
const countOf = (r: unknown): number => Number(rowsOf(r)[0]?.n ?? 0);

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};

const STAMP = Date.now();
const INVITED = `invited.${STAMP}@funded-capital-test.invalid`;
const UNINVITED = `uninvited.${STAMP}@funded-capital-test.invalid`;
const REVOKED = `revoked.${STAMP}@funded-capital-test.invalid`;
const LEGACY = `legacy.${STAMP}@funded-capital-test.invalid`;

async function main() {
  /**
   * Imported HERE, not at the top of the file, for two reasons.
   *
   * 1. `lib/db` throws at import time when DATABASE_URL is unset, so this must
   *    come after the dotenv calls above.
   * 2. A top-level `await import(...)` is a BUILD ERROR — tsx compiles these
   *    scripts to CommonJS, where top-level await does not exist. CLAUDE.md
   *    says exactly this and points at scripts/migrate-crm.ts as the pattern;
   *    I wrote it wrong anyway and esbuild caught it with
   *    "Top-level await is currently not supported with the cjs output format".
   */
  const { admitBroker } = await import("../lib/broker/provision");

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("\n  DATABASE_URL is not set. Run fc-db.bat first.\n");
    process.exit(1);
  }

  /* -- Guard. Never production. ---------------------------------------- */
  if (url.includes(PRODUCTION_ENDPOINT)) {
    console.error(
      `\n  REFUSING TO RUN.\n\n  DATABASE_URL points at the PRODUCTION endpoint (${PRODUCTION_ENDPOINT}).\n` +
      `  This test writes and deletes rows. Switch to the dev branch with\n` +
      `  fc-use-dev-db.bat and try again.\n`,
    );
    process.exit(1);
  }

  const host = url.split("@")[1]?.split("/")[0] ?? "unknown";
  console.log(`\n================  broker admission  ================`);
  console.log(`  Host: ${host}`);
  console.log(`  Test addresses end in .invalid and are deleted at the end.\n`);

  const db = drizzle(neon(url));

  // A firm to land in, so we can prove the invite carries it through.
  const firmId = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO broker_firms (id, name, status)
    VALUES (${firmId}, ${`TEST FIRM ${STAMP}`}, 'active')
  `);

  try {
    console.log("=== 1. An uninvited address is refused, and creates NO row ===");
    const u = await admitBroker(`user_uninvited_${STAMP}`, UNINVITED, "Nobody");
    check("refused", !u.admitted, u.admitted ? "ADMITTED" : u.reason);

    const strayRows = await db.execute(sql`
      SELECT COUNT(*)::int AS n FROM broker_users WHERE email = ${UNINVITED}
    `);
    const stray = countOf(strayRows);
    check("no broker_users row was created", stray === 0, `${stray} rows`);

    console.log("\n=== 2. An invited address is admitted INTO ITS FIRM ===");
    await db.execute(sql`
      INSERT INTO broker_invites (email, firm_id, role, invited_by)
      VALUES (${INVITED}, ${firmId}, 'lead', 'test-script')
    `);

    const clerkId = `user_invited_${STAMP}`;
    const a = await admitBroker(clerkId, INVITED, "Invited Broker");
    check("admitted", a.admitted, a.admitted ? "yes" : a.reason);
    check("row was created", a.admitted && a.created, a.admitted ? String(a.created) : "n/a");

    const madeRows = await db.execute(sql`
      SELECT firm_id, role, status FROM broker_users WHERE clerk_user_id = ${clerkId}
    `);
    const made = rowsOf(madeRows)[0];
    check("firm came from the invitation", String(made?.firm_id) === firmId, String(made?.firm_id));
    check("role came from the invitation", String(made?.role) === "lead", String(made?.role));
    check("status is active", String(made?.status) === "active", String(made?.status));

    const usedRows = await db.execute(sql`
      SELECT accepted_at, accepted_by_user_id FROM broker_invites WHERE email = ${INVITED}
    `);
    const used = rowsOf(usedRows)[0];
    check("invitation is stamped accepted", Boolean(used?.accepted_at), used?.accepted_at ? "stamped" : "NOT stamped");
    check(
      "...and records WHICH account used it",
      String(used?.accepted_by_user_id) === clerkId,
      String(used?.accepted_by_user_id),
    );

    console.log("\n=== 3. The same invitation cannot be used by a second person ===");
    const replay = await admitBroker(`user_replay_${STAMP}`, INVITED, "Forwarded Link");
    check("refused", !replay.admitted, replay.admitted ? "ADMITTED" : replay.reason);
    const replayRows = await db.execute(sql`
      SELECT COUNT(*)::int AS n FROM broker_users WHERE clerk_user_id = ${`user_replay_${STAMP}`}
    `);
    check("no second row was created", countOf(replayRows) === 0, "0 rows");

    console.log("\n=== 4. A revoked invitation is refused ===");
    await db.execute(sql`
      INSERT INTO broker_invites (email, firm_id, role, invited_by, revoked_at, revoked_by)
      VALUES (${REVOKED}, ${firmId}, 'member', 'test-script', now(), 'test-script')
    `);
    const r = await admitBroker(`user_revoked_${STAMP}`, REVOKED, "Revoked");
    check("refused", !r.admitted, r.admitted ? "ADMITTED" : r.reason);

    console.log("\n=== 5. An existing broker is grandfathered, invitation or not ===");
    const legacyClerk = `user_legacy_${STAMP}`;
    await db.execute(sql`
      INSERT INTO broker_users (clerk_user_id, email, name, status)
      VALUES (${legacyClerk}, ${LEGACY}, 'Grandfathered', 'active')
    `);
    const g = await admitBroker(legacyClerk, LEGACY, "Grandfathered");
    check("admitted with no invitation at all", g.admitted, g.admitted ? "yes" : g.reason);
    check("no new row was created", g.admitted && !g.created, g.admitted ? String(g.created) : "n/a");

    console.log("\n=== 6. A case-different address still matches its invitation ===");
    const caseClerk = `user_case_${STAMP}`;
    const CASED = `Cased.${STAMP}@Funded-Capital-Test.INVALID`;
    await db.execute(sql`
      INSERT INTO broker_invites (email, firm_id, role, invited_by)
      VALUES (${CASED.toLowerCase()}, ${firmId}, 'member', 'test-script')
    `);
    const c = await admitBroker(caseClerk, CASED, "Mixed Case");
    check("admitted", c.admitted, c.admitted ? "yes" : c.reason);
  } finally {
    /* -- Clean up, even if something above threw. ----------------------
     *
     * Wrapped in its own try/catch: if the connection is what failed, these
     * DELETEs fail too, and an exception thrown from a finally block REPLACES
     * the original error — so the real cause would vanish and the message on
     * screen would be about cleanup.
     */
    try {
    console.log("\n=== Cleaning up ===");
    const del = await db.execute(sql`
      DELETE FROM broker_users WHERE email LIKE ${`%${STAMP}@funded-capital-test.invalid`}
    `);
    void del;
    await db.execute(sql`
      DELETE FROM broker_invites WHERE email LIKE ${`%${STAMP}@funded-capital-test.invalid`}
    `);
    await db.execute(sql`DELETE FROM broker_firms WHERE id = ${firmId}`);

    const leftRows = await db.execute(sql`
      SELECT
        (SELECT COUNT(*)::int FROM broker_users   WHERE email LIKE '%@funded-capital-test.invalid') AS users,
        (SELECT COUNT(*)::int FROM broker_invites WHERE email LIKE '%@funded-capital-test.invalid') AS invites
    `);
    const left = rowsOf(leftRows)[0];
    console.log(`  Test rows remaining anywhere: ${left?.users} broker_users, ${left?.invites} broker_invites`);
    if (Number(left?.users ?? 0) > 0) {
      console.log("  (Any left over are from EARLIER test runs, not this one.)");
    }
    } catch (cleanupErr) {
      console.error("  Cleanup could not run:", cleanupErr instanceof Error ? cleanupErr.message : cleanupErr);
      console.error("  Test rows ending in .invalid may remain on the dev branch.");
    }
  }

  console.log(`\n================  ${pass} passed, ${fail} failed  ================\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("\n  The test itself failed to run:\n", err);
  process.exit(1);
});
