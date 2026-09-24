import { sql } from "drizzle-orm";
import { CONTACT_KINDS } from "./contactKinds";
import { activities, participants } from "./schema";

/**
 * Per-contact subqueries for the Contacts list.
 *
 * WHY THE CONTACT ID IS WRITTEN OUT BY HAND:
 * In a single-table select, drizzle renders a column in the SELECT LIST
 * without its table name — `${contacts.id}` becomes plain `"id"`. Inside a
 * correlated subquery Postgres resolves a bare `"id"` to the INNER table first,
 * so `p.contact_id = "id"` compared a participant's contact id with the
 * participant's own id and matched nothing. From the day /crm/contacts shipped
 * until 24 Sep 2026 every contact showed 0 deals and "never" contacted, and the
 * page said "0 have had a deal". It looked like data, not like a bug.
 *
 * (The same `${contacts.id}` inside a WHERE clause IS qualified, which is why
 * the "never contacted" count on /crm was right while this was wrong.)
 *
 * `"contacts"."id"` is unambiguous wherever drizzle puts it.
 * `contactSubqueries.regress.ts` renders the real query and fails if a bare
 * `"id"` ever comes back.
 *
 * This module imports no database client, so the test can build SQL without a
 * connection.
 */
export const CONTACT_ID = sql.raw(`"contacts"."id"`);

/** Newest real correspondence (see CONTACT_KINDS for what counts). */
export const lastContactAt = () => sql<Date | null>`(
  SELECT max(a.occurred_at) FROM ${activities} a
  WHERE a.contact_id = ${CONTACT_ID} AND a.kind IN ${CONTACT_KINDS}
)`;

/** Which kind that newest correspondence was — sets the direction arrow. */
export const lastContactKind = () => sql<string | null>`(
  SELECT a.kind FROM ${activities} a
  WHERE a.contact_id = ${CONTACT_ID} AND a.kind IN ${CONTACT_KINDS}
  ORDER BY a.occurred_at DESC LIMIT 1
)`;

/**
 * Applications this person is attached to, in ANY role. DISTINCT because one
 * person can hold two roles on one deal (broker and borrower on their own
 * file) — the same double count fixed on the Pipeline page on 23 Sep 2026.
 */
export const dealCount = () => sql<number>`(
  SELECT count(DISTINCT p.application_id)::int FROM ${participants} p
  WHERE p.contact_id = ${CONTACT_ID}
)`;
