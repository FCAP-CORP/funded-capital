/**
 * Resolve the signed-in broker to the viewer that scoping decisions are made
 * from.
 *
 * Deliberately the ONLY place a `BrokerViewer` is constructed from a request.
 * Every field comes from the session or from that user's own `broker_users`
 * row; nothing is read from the request body. A firm id that a caller could
 * supply is a firm id a caller could guess.
 */

import { auth } from "@clerk/nextjs/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import type { BrokerViewer, BrokerRole, BrokerStatus } from "./scope";

/**
 * Null when there is no session, no broker record, or no database — and null
 * means "sees nothing", because `queryScope` fails closed on it.
 *
 * A signed-in user with no `broker_users` row is NOT given a default viewer.
 * They have never submitted anything, so there is nothing for them to see, and
 * inventing a viewer would mean inventing a scope.
 */
export async function resolveBrokerViewer(): Promise<BrokerViewer | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const url = process.env.DATABASE_URL;
  if (!url) return null;

  try {
    const db = drizzle(neon(url), { schema });
    const rows = await db
      .select({
        firmId: schema.brokerUsers.firmId,
        role: schema.brokerUsers.role,
        status: schema.brokerUsers.status,
      })
      .from(schema.brokerUsers)
      .where(eq(schema.brokerUsers.clerkUserId, userId))
      .limit(1);

    if (!rows.length) return null;

    return {
      userId,
      firmId: rows[0].firmId,
      role: rows[0].role as BrokerRole,
      status: rows[0].status as BrokerStatus,
    };
  } catch (err) {
    console.error("[broker/viewer] lookup failed:", err);
    return null;
  }
}
