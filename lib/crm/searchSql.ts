/**
 * The two statements behind ⌘K search, as drizzle `sql` objects.
 *
 * NO DATABASE ACCESS IN THIS FILE — it only builds statements. The one caller
 * is app/api/crm/search/route.ts, which asserts staff before it runs them; a
 * statement on its own reads nothing. Kept separate from the route so the exact
 * SQL the route sends can be rendered and run against a real Postgres in a
 * test (see the report in the kit hand-off), and so lib/crm/guards.ui.regress.ts
 * can check which tables it names.
 *
 * EVERY VALUE IS A BOUND PARAMETER. `${q.pattern}` inside drizzle's `sql`
 * template becomes `$1`, never text spliced into the statement, so a query of
 * `'; DROP TABLE contacts; --` is searched for, literally, and finds nothing.
 *
 * FOUR TABLES AND NO OTHERS: applications, participants, contacts, properties.
 * No broker table, no documents, no activities — search needs none of them,
 * and guards.ui.regress.ts fails the build if one appears.
 */

import { sql, type SQL } from "drizzle-orm";
import { SEARCH_LIMIT, type ParsedQuery } from "./search";

type Q = Extract<ParsedQuery, { ok: true }>;

/**
 * Deals whose borrower (name, email, phone) or property (street, city, state,
 * ZIP) matches.
 *
 * ONE CONTACT PER APPLICATION, by the same `LEFT JOIN LATERAL … LIMIT 1` as
 * getPipeline and the dashboard: the borrower when there is one, else the
 * earliest attachment. A plain join would list a deal twice when one person
 * holds two roles on it — the bug that showed "135 open of 130" on 23 Sep.
 */
export function dealSearchSql(q: Q): SQL {
  return sql`
    SELECT
      a.id               AS application_id,
      a.stage            AS stage,
      a.requested_amount AS requested_amount,
      c.contact_id, c.first_name, c.last_name, c.email, c.phone,
      pr.address_line1, pr.city, pr.state
    FROM applications a
    LEFT JOIN properties pr ON pr.id = a.property_id
    LEFT JOIN LATERAL (
      SELECT ct.id AS contact_id, ct.first_name, ct.last_name, ct.email, ct.phone, ct.phone_raw
      FROM participants p
      JOIN contacts ct ON ct.id = p.contact_id
      WHERE p.application_id = a.id
      ORDER BY (p.role = 'borrower') DESC, p.created_at ASC, ct.id ASC
      LIMIT 1
    ) c ON true
    WHERE
         concat_ws(' ', c.first_name, c.last_name) ILIKE ${q.pattern}::text
      OR c.email ILIKE ${q.pattern}::text
      OR pr.address_line1 ILIKE ${q.pattern}::text
      OR concat_ws(' ', pr.city, pr.state, pr.postal_code) ILIKE ${q.pattern}::text
      OR (${q.digitsPattern}::text <> '' AND (
           regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g') LIKE ${q.digitsPattern}::text
        OR regexp_replace(coalesce(c.phone_raw, ''), '[^0-9]', '', 'g') LIKE ${q.digitsPattern}::text
      ))
    ORDER BY COALESCE(a.submitted_at, a.created_at) DESC NULLS LAST, a.id
    LIMIT ${sql.raw(String(SEARCH_LIMIT))}
  `;
}

/** People by name, email or phone — including the ones with no deal at all. */
export function contactSearchSql(q: Q): SQL {
  return sql`
    SELECT
      ct.id AS contact_id, ct.first_name, ct.last_name, ct.email, ct.phone, ct.phone_raw,
      (SELECT count(*)::int FROM participants p WHERE p.contact_id = ct.id) AS deals
    FROM contacts ct
    WHERE
         concat_ws(' ', ct.first_name, ct.last_name) ILIKE ${q.pattern}::text
      OR ct.email ILIKE ${q.pattern}::text
      OR (${q.digitsPattern}::text <> '' AND (
           regexp_replace(coalesce(ct.phone, ''), '[^0-9]', '', 'g') LIKE ${q.digitsPattern}::text
        OR regexp_replace(coalesce(ct.phone_raw, ''), '[^0-9]', '', 'g') LIKE ${q.digitsPattern}::text
      ))
    ORDER BY ct.created_at DESC, ct.id
    LIMIT ${sql.raw(String(SEARCH_LIMIT))}
  `;
}
