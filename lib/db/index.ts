/**
 * Database client.
 *
 * WHICH CONNECTION STRING, AND WHY IT MATTERS:
 * Neon hands Vercel two URLs. DATABASE_URL is POOLED and goes through Neon's
 * connection pooler; DATABASE_URL_UNPOOLED is a direct connection.
 *
 * Serverless functions open and close connections constantly — one per request,
 * potentially hundreds concurrently. A direct connection per invocation exhausts
 * Postgres' connection limit under any real traffic, and the failure looks like
 * random 500s rather than anything obviously connection-related. So the app
 * ALWAYS uses the pooled URL.
 *
 * The unpooled URL is for schema migrations only (drizzle-kit), which need a
 * session-level connection the pooler cannot provide.
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    "DATABASE_URL is not set. It is provisioned automatically by the Neon " +
    "integration in the Vercel dashboard (Storage tab). For local work run " +
    "`vercel env pull .env.local` to fetch it."
  );
}

export const db = drizzle(neon(url), { schema });
export { schema };
export * from "./schema";
