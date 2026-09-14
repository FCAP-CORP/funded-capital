#!/usr/bin/env node
/**
 * Report what is actually in the database, and write it where Claude can read it.
 *
 * WHY: Cowork sessions cannot query the database and cannot see a console window
 * that has closed. This connects, inspects, and writes .fc-check/db-status.md —
 * the same pattern as fc-check.bat. No credentials are ever printed.
 */

import { config as loadEnv } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * dotenv reads `.env` by default. This project keeps its credentials in
 * `.env.local` — the Next.js convention, which dotenv knows nothing about — so
 * the path has to be explicit. Loading `.env.local` first means it wins;
 * dotenv never overwrites a variable that is already set.
 */
loadEnv({ path: join(process.cwd(), ".env.local") });
loadEnv({ path: join(process.cwd(), ".env") });

const EXPECTED_TABLES = [
  "contacts", "entities", "properties", "applications",
  "participants", "stage_transitions", "activities", "documents",
];
const EXPECTED_ENUMS = [
  "stage", "lead_source", "product", "participant_role", "activity_kind",
];

const OUT_DIR = join(process.cwd(), ".fc-check");
const REPORT = join(OUT_DIR, "db-status.md");

function bail(lines, ok = false) {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(REPORT, lines.join("\n"), "utf8");
  console.log(lines.join("\n"));
  console.log(`\n  Report written to .fc-check/db-status.md`);
  process.exit(ok ? 0 : 1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  bail([
    "# Database status — NO CREDENTIALS",
    "",
    "`DATABASE_URL` is not set. Either `.env.local` is missing it — re-run fc-db.bat —",
    "or this script was run from outside the repo folder, so it could not find the file.",
  ]);
}

/** Identify the host without ever exposing the password. */
let host = "unknown";
try { host = new URL(url).host; } catch { /* ignore */ }

const sql = neon(url);
const lines = [];

try {
  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name`;
  const found = tables.map((r) => r.table_name);

  const enums = await sql`
    SELECT t.typname AS name, count(e.enumlabel)::int AS labels
    FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
    GROUP BY t.typname ORDER BY t.typname`;

  const missing = EXPECTED_TABLES.filter((t) => !found.includes(t));
  const extra = found.filter((t) => !EXPECTED_TABLES.includes(t) && t !== "__drizzle_migrations");
  const missingEnums = EXPECTED_ENUMS.filter((e) => !enums.some((x) => x.name === e));

  const healthy = missing.length === 0 && missingEnums.length === 0;

  lines.push(`# Database status — ${healthy ? "READY" : "INCOMPLETE"}`);
  lines.push("");
  lines.push(`- **When:** ${new Date().toISOString()}`);
  lines.push(`- **Host:** \`${host}\``);
  lines.push(`- **Tables found:** ${found.length} of ${EXPECTED_TABLES.length} expected`);
  lines.push(`- **Enums found:** ${enums.length} of ${EXPECTED_ENUMS.length} expected`);
  lines.push("");

  if (found.length === 0) {
    lines.push("The database is reachable but **completely empty** — `drizzle-kit push` did not run,");
    lines.push("or it exited before applying anything. Re-run fc-db.bat.");
    lines.push("");
  }

  if (found.length > 0) {
    lines.push("## Tables");
    lines.push("");
    lines.push("| Table | Columns | Rows |");
    lines.push("|---|---:|---:|");
    for (const t of found) {
      const cols = await sql`
        SELECT count(*)::int AS n FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${t}`;
      // Table names come from information_schema, not user input, so this is safe.
      const rows = await sql(`SELECT count(*)::int AS n FROM "${t}"`);
      lines.push(`| \`${t}\` | ${cols[0].n} | ${rows[0].n} |`);
    }
    lines.push("");
  }

  if (enums.length) {
    lines.push("## Enums");
    lines.push("");
    lines.push(enums.map((e) => `\`${e.name}\` (${e.labels})`).join(" · "));
    lines.push("");
  }

  if (missing.length) {
    lines.push("## Missing tables");
    lines.push("");
    for (const t of missing) lines.push(`- \`${t}\``);
    lines.push("");
    lines.push("Re-run fc-db.bat to create them.");
    lines.push("");
  }
  if (missingEnums.length) {
    lines.push("## Missing enums");
    lines.push("");
    for (const e of missingEnums) lines.push(`- \`${e}\``);
    lines.push("");
  }
  if (extra.length) {
    lines.push("## Unexpected tables");
    lines.push("");
    lines.push("Not part of the Lending OS schema — worth a look before migrating:");
    for (const t of extra) lines.push(`- \`${t}\``);
    lines.push("");
  }

  if (healthy) {
    lines.push("Schema matches `lib/db/schema.ts`. Ready for the migration.");
    lines.push("");
  }

  bail(lines, healthy);
} catch (err) {
  bail([
    "# Database status — CANNOT CONNECT",
    "",
    `- **Host:** \`${host}\``,
    `- **Error:** ${err?.message ?? String(err)}`,
    "",
    "The credentials are present but the connection failed. Common causes: the Neon",
    "database was paused (it wakes on the next attempt — try again), or the project",
    "is not connected to this database in Vercel.",
  ]);
}
