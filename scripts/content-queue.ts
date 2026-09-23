/**
 * The fulfilment side of the marketing queue.
 *
 * `/crm/marketing` writes rows. This is what reads them and writes back — run
 * by a scheduled Claude task (through the device bridge) or by hand.
 *
 * WHY A SCRIPT RATHER THAN AN API ROUTE. The work is done by a Claude session
 * using the brand-voice and research skills, not by the web app, so the app
 * never needs a model API key and there is one definition of the voice rather
 * than two. The session needs a way to read the queue and report back; this is
 * it.
 *
 * THE BRANCH TRAP. `.env.local` points at the Neon DEV branch. The real queue is
 * in PRODUCTION. A run against the wrong one silently does nothing and looks
 * like an empty queue — the exact shape of the invitation mistake, where work
 * done on localhost never reached a real person. So this script PRINTS THE HOST
 * ON EVERY RUN and refuses to be quiet about it. Use --env .env.vercel (pulled
 * by fc-content-queue-prod.bat) to work the production queue.
 *
 * Usage:
 *   npx tsx scripts/content-queue.ts list  [--json] [--env <file>]
 *   npx tsx scripts/content-queue.ts queue --file <path> [--dry-run]
 *   npx tsx scripts/content-queue.ts claim     <id> --by <who>
 *   npx tsx scripts/content-queue.ts drafted   <id> --url <url> [--summary <text>]
 *   npx tsx scripts/content-queue.ts failed    <id> --error <text>
 *   npx tsx scripts/content-queue.ts published <id> [--url <url>]
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config as loadEnv } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";
import {
  CHANNEL_SPEC,
  STATUS_LABEL,
  canTransition,
  validateRequest,
  type ContentChannel,
  type ContentStatus,
} from "../lib/marketing/requests";

const ROOT = process.cwd();

/** The production Neon endpoint, named so a run can say which side it is on. */
const PRODUCTION_ENDPOINT = "ep-calm-grass-aw5jrvyn";

type Row = Record<string, unknown>;
/** Through `unknown` deliberately — a direct cast is TS2352. See CLAUDE.md. */
const rowsOf = (r: unknown): Row[] => (r as { rows?: Row[] }).rows ?? (r as Row[]);
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}
const has = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  /*
   * Env first, before anything that reads DATABASE_URL is imported. Every other
   * script in this folder does the same; the one that did not appeared to work
   * for me and then failed for Luis, because I had tested it with the variable
   * already set on the command line.
   */
  const envFile = arg("env") ?? ".env.local";
  loadEnv({ path: join(ROOT, envFile) });
  loadEnv({ path: join(ROOT, ".env") });

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(`\n  DATABASE_URL is not set (looked in ${envFile}). Run fc-db.bat first.\n`);
    process.exit(1);
  }

  const host = url.split("@")[1]?.split("/")[0] ?? "unknown";
  const isProd = url.includes(PRODUCTION_ENDPOINT);

  console.log(`\n================  marketing queue  ================`);
  console.log(`  Host: ${host}`);
  console.log(`  Branch: ${isProd ? "PRODUCTION — these are real requests" : "DEV BRANCH — not the real queue"}`);
  if (!isProd) {
    console.log(`  To work the real queue: fc-content-queue-prod.bat`);
  }
  console.log("");

  const db = drizzle(neon(url));
  const command = process.argv[2] ?? "list";
  const id = process.argv[3];

  if (command === "list") {
    const result = await db.execute(sql`
      SELECT id, channel::text AS channel, topic, notes, status::text AS status,
             requested_at, claimed_at, draft_url
      FROM content_requests
      WHERE status IN ('requested', 'in_progress')
      ORDER BY requested_at ASC
    `);
    const rows = rowsOf(result);

    if (has("json")) {
      console.log(JSON.stringify(rows, null, 2));
      process.exit(0);
    }

    if (!rows.length) {
      console.log("  Nothing waiting.\n");
      process.exit(0);
    }

    for (const r of rows) {
      const channel = str(r.channel) as ContentChannel;
      const status = str(r.status) as ContentStatus;
      console.log(`  ${str(r.id)}`);
      console.log(`    ${CHANNEL_SPEC[channel]?.label ?? channel} · ${STATUS_LABEL[status] ?? status}`);
      console.log(`    ${str(r.topic)}`);
      if (r.notes) console.log(`    notes: ${str(r.notes)}`);
      console.log(`    produces: ${CHANNEL_SPEC[channel]?.produces ?? "unknown"}`);
      console.log("");
    }
    console.log(`  ${rows.length} open.\n`);
    process.exit(0);
  }

  /* -- Bulk queue from a file. ------------------------------------------- *
   *
   * A file rather than command-line arguments because thirty topics is a thing
   * you READ before you commit to it. The file is pipe-delimited so it opens in
   * Notepad and a typo is obvious; blank lines and lines starting with # are
   * ignored so it can carry its own headings.
   *
   *   channel | topic | notes
   *
   * Every row is validated with the SAME rules the web form uses, and a bad row
   * stops the whole run BEFORE anything is inserted. Half a queue is worse than
   * none: you cannot tell by looking which half made it.
   */
  if (command === "queue") {
    const file = arg("file");
    if (!file) {
      console.error(`  "queue" needs --file pointing at a pipe-delimited list.\n`);
      process.exit(1);
    }

    const raw = readFileSync(file, "utf8").split(/\r?\n/);
    const rows: { channel: string; topic: string; notes: string | null }[] = [];
    const problems: string[] = [];

    raw.forEach((line, i) => {
      const text = line.trim();
      if (!text || text.startsWith("#")) return;
      const [channel, topic, notes] = text.split("|").map((x) => (x ?? "").trim());
      const check = validateRequest(channel, topic, notes || null);
      if (!check.ok) {
        problems.push(`  line ${i + 1}: ${check.error}\n    ${text.slice(0, 90)}`);
        return;
      }
      rows.push({ channel: check.value.channel, topic: check.value.topic, notes: check.value.notes });
    });

    if (problems.length) {
      console.error(`  ${problems.length} line(s) would not queue. NOTHING was inserted:\n`);
      console.error(problems.join("\n") + "\n");
      process.exit(1);
    }

    console.log(`  ${rows.length} to queue from ${file}:\n`);
    for (const r of rows) console.log(`    ${CHANNEL_SPEC[r.channel as ContentChannel].label.padEnd(9)} ${r.topic}`);

    if (has("dry-run")) {
      console.log(`\n  DRY RUN — nothing was written.\n`);
      process.exit(0);
    }

    let inserted = 0;
    for (const r of rows) {
      await db.execute(sql`
        INSERT INTO content_requests (channel, topic, notes, requested_by)
        VALUES (${r.channel}::content_channel, ${r.topic}, ${r.notes}, ${arg("by") ?? "bulk-queue"})
      `);
      inserted++;
    }
    console.log(`\n  Queued ${inserted}. The scheduled task takes one per run.\n`);
    process.exit(0);
  }

  if (!id) {
    console.error(`  "${command}" needs a request id. Run "list" first.\n`);
    process.exit(1);
  }

  /* -- Every write re-reads the row and re-checks the move. ---------------- */
  const current = await db.execute(sql`
    SELECT status::text AS status FROM content_requests WHERE id = ${id}
  `);
  const existing = rowsOf(current)[0];
  if (!existing) {
    console.error(`  No request with id ${id}.\n`);
    process.exit(1);
  }
  const from = String(existing.status) as ContentStatus;

  const TARGET: Record<string, ContentStatus> = {
    claim: "in_progress",
    drafted: "drafted",
    failed: "failed",
    published: "published",
  };
  const to = TARGET[command];
  if (!to) {
    console.error(`  Unknown command "${command}". Use list, queue, claim, drafted, failed or published.\n`);
    process.exit(1);
  }

  /*
   * The SAME rule the screen uses — imported, not restated. A script with its
   * own idea of which moves are legal is a second source of truth that will
   * drift from the first one silently.
   */
  if (!canTransition(from, to)) {
    console.error(`  A request that is "${from}" cannot become "${to}".\n`);
    process.exit(1);
  }

  const now = new Date().toISOString();
  let updated: unknown;

  if (to === "in_progress") {
    const by = arg("by") ?? "claude-scheduled-task";
    // The `status = from` condition is what stops two runs claiming one job.
    updated = await db.execute(sql`
      UPDATE content_requests
      SET status = 'in_progress', claimed_at = ${now}, claimed_by = ${by}, updated_at = ${now}
      WHERE id = ${id} AND status = ${from}
      RETURNING id
    `);
  } else if (to === "drafted") {
    const draftUrl = arg("url");
    if (!draftUrl) {
      console.error(`  "drafted" needs --url pointing at the draft. A draft nobody can open is not a draft.\n`);
      process.exit(1);
    }
    updated = await db.execute(sql`
      UPDATE content_requests
      SET status = 'drafted', drafted_at = ${now}, draft_url = ${draftUrl},
          draft_summary = ${arg("summary")}, error = NULL, updated_at = ${now}
      WHERE id = ${id} AND status = ${from}
      RETURNING id
    `);
  } else if (to === "failed") {
    const message = arg("error");
    if (!message) {
      console.error(`  "failed" needs --error saying what went wrong, in words Luis can act on.\n`);
      process.exit(1);
    }
    updated = await db.execute(sql`
      UPDATE content_requests
      SET status = 'failed', error = ${message}, updated_at = ${now}
      WHERE id = ${id} AND status = ${from}
      RETURNING id
    `);
  } else {
    updated = await db.execute(sql`
      UPDATE content_requests
      SET status = 'published', published_at = ${now}, published_url = ${arg("url")},
          error = NULL, updated_at = ${now}
      WHERE id = ${id} AND status = ${from}
      RETURNING id
    `);
  }

  if (!rowsOf(updated).length) {
    console.error(`  Nothing changed — the request moved while this was running. Re-run "list".\n`);
    process.exit(1);
  }

  console.log(`  ${id}: ${from} -> ${to}\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error("\n  The queue script failed to run:\n", err);
  process.exit(1);
});
