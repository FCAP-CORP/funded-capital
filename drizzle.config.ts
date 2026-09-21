/**
 * Drizzle Kit configuration — schema pushes and migration generation.
 *
 * Uses the UNPOOLED connection. Schema changes need a session-level connection,
 * which Neon's pooler does not provide; pointing this at the pooled URL produces
 * confusing failures partway through a push.
 */

import { config as loadEnv } from "dotenv";
import { join } from "node:path";
import type { Config } from "drizzle-kit";

/**
 * Credentials live in `.env.local`, which dotenv does not read by default — it
 * looks for `.env`. Without these explicit paths drizzle-kit finds no database
 * URL and the push fails before it touches anything.
 */
loadEnv({ path: join(process.cwd(), ".env.local") });
loadEnv({ path: join(process.cwd(), ".env") });

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    "No database URL found. Double-click fc-db.bat to fetch the " +
    "credentials Vercel created when the Neon database was connected.\n\n" +
    "Do NOT run `vercel env pull .env.local` — it OVERWRITES the file rather " +
    "than merging, so every local-only key in it is lost. The refresh script " +
    "pulls to a scratch file, merges, and deletes the scratch."
  );
}

export default {
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
  verbose: true,
  strict: true,
} satisfies Config;
