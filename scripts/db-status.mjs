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
  // Phase 2. Absent until migrations 0001-0004 have been applied.
  "broker_firms", "broker_users", "application_properties",
];
const EXPECTED_ENUMS = [
  "stage", "lead_source", "product", "participant_role", "activity_kind",
  "broker_role", "broker_status",
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
    lines.push("Schema matches `lib/db/schema.ts`.");
    lines.push("");
  }

  // The five newest applications, with who they belong to. This is how a live
  // lead submission is verified end to end: if /api/lead wrote the row, it
  // appears here with source `web:contact` or `web:apply`.
  if (found.includes("applications")) {
    const recent = await sql`
      SELECT a.created_at, a.stage::text AS stage, a.product::text AS product,
             a.legacy_source, a.channel, a.binding_ratio,
             a.requested_amount, a.notes,
             c.first_name, c.last_name, c.email, c.phone,
             c.sms_consent_version,
             p.address_line1,
             (SELECT count(*)::int FROM activities ac WHERE ac.application_id = a.id) AS activities,
             (SELECT count(*)::int FROM stage_transitions st WHERE st.application_id = a.id) AS transitions
      FROM applications a
      LEFT JOIN participants pt ON pt.application_id = a.id
      LEFT JOIN contacts c ON c.id = pt.contact_id
      LEFT JOIN properties p ON p.id = a.property_id
      ORDER BY a.created_at DESC
      LIMIT 5`;

    lines.push("## Five newest applications");
    lines.push("");
    if (recent.length === 0) {
      lines.push("None yet.");
    } else {
      lines.push("| Created (UTC) | Who | Source | Product | Stage | Acts | Trans |");
      lines.push("|---|---|---|---|---|---:|---:|");
      for (const r of recent) {
        const who = [r.first_name, r.last_name].filter(Boolean).join(" ") || "(unlinked)";
        const when = new Date(r.created_at).toISOString().replace("T", " ").slice(0, 16);
        lines.push(`| ${when} | ${who} | \`${r.legacy_source ?? "—"}\` | ${r.product} | ${r.stage} | ${r.activities} | ${r.transitions} |`);
      }
      lines.push("");
      const newest = recent[0];
      const viaWeb = String(newest.legacy_source ?? "").startsWith("web:");
      lines.push(`### Newest — ${viaWeb ? "**arrived through /api/lead**" : "from the migration, not a live submission"}`);
      lines.push("");
      lines.push("| Field | Value |");
      lines.push("|---|---|");
      lines.push(`| Name | ${[newest.first_name, newest.last_name].filter(Boolean).join(" ") || "—"} |`);
      lines.push(`| Email | ${newest.email ?? "—"} |`);
      lines.push(`| Phone (E.164) | ${newest.phone ?? "—"} |`);
      lines.push(`| SMS consent version | ${newest.sms_consent_version ?? "not opted in"} |`);
      lines.push(`| Product | ${newest.product} |`);
      lines.push(`| Channel | ${newest.channel ?? "—"} |`);
      lines.push(`| Requested | ${newest.requested_amount ?? "—"} |`);
      lines.push(`| Binding ratio | ${newest.binding_ratio ?? "—"} |`);
      lines.push(`| Property | ${newest.address_line1 ?? "—"} |`);
      lines.push(`| Notes | ${newest.notes ?? "—"} |`);
      lines.push(`| Activities / transitions | ${newest.activities} / ${newest.transitions} |`);
      lines.push("");
      if (viaWeb) {
        lines.push("The live path is working: contact, application, stage history and the");
        lines.push("submission activity were all written at submit time.");
      } else {
        lines.push("**No web submission has reached the database yet.** Either the deploy had not");
        lines.push("finished when the form was submitted, or the write failed — check the Vercel");
        lines.push("logs for `[api/lead] DB WRITE FAILED`.");
      }
      lines.push("");
    }
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
