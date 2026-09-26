/**
 * The one query that reads a person the way lib/nurture/nurture.ts needs them,
 * shared by the staff page (nurture.server.ts) and the sync (sync.server.ts)
 * so the two can never disagree about who someone is.
 *
 * SQL ONLY — no database import, so it can be rendered and checked without a
 * connection. Dates come back as ISO strings via `toNurtureContact`.
 *
 * ARRIVAL = submitted_at, else — for a deal from the legacy spreadsheet, whose
 * created_at is the day of the import — the contact's own "Date Added", else
 * created_at. Without the middle step every legacy lead with no submission
 * date would look like it arrived on 14 Sep 2026, and so would be "recent"
 * and never offered.
 */

import { sql, type SQL } from "drizzle-orm";
import { CONTACT_KINDS } from "@/lib/db/contactKinds";
import type { NurtureApp, NurtureContact } from "./nurture";

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const iso = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const arr = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.filter((x) => x !== null && x !== undefined).map(String);
  // Postgres text[] can arrive as "{a,b}" through some drivers.
  if (typeof v === "string" && v.startsWith("{")) return v.slice(1, -1).split(",").filter(Boolean).map((s) => s.replace(/^"|"$/g, ""));
  return [];
};

/** A uuid list as a SQL array literal of bound parameters. Empty list → matches nothing. */
export function uuidArray(ids: string[]): SQL {
  if (ids.length === 0) return sql`ARRAY[]::uuid[]`;
  return sql`ARRAY[${sql.join(ids.map((id) => sql`${id}`), sql`, `)}]::uuid[]`;
}

/**
 * Every person on at least one application, or only `ids` when given.
 * `"contacts"."id"` is written out by hand: drizzle renders a select-list
 * column unqualified, and a bare "id" inside a correlated subquery binds to
 * the INNER table (the 24 Sep 2026 "0 deals" bug, lib/db/contactSubqueries.ts).
 */
export function nurtureContactsSql(ids?: string[]): SQL {
  const only = ids ? sql`AND c.id = ANY(${uuidArray(ids)})` : sql``;
  return sql`
    SELECT
      c.id, c.first_name, c.last_name, c.email, c.email_subscribed, c.lead_source, c.state,
      (SELECT array_agg(DISTINCT p.role::text) FROM participants p WHERE p.contact_id = c.id) AS roles,
      (SELECT max(ac.occurred_at) FROM activities ac
        WHERE ac.contact_id = c.id AND ac.kind IN ${CONTACT_KINDS}) AS last_touch_at,
      (SELECT array_agg(DISTINCT e.program) FROM nurture_enrollments e WHERE e.contact_id = c.id) AS prior_programs,
      (SELECT e.program FROM nurture_enrollments e WHERE e.contact_id = c.id AND e.status = 'active' LIMIT 1) AS active_program,
      EXISTS (SELECT 1 FROM nurture_enrollments e
        WHERE e.contact_id = c.id AND e.stop_reason = 'stopped_by_staff') AS staff_stopped,
      (SELECT json_agg(json_build_object(
          'id', a.id,
          'stage', a.stage,
          'lead_source', a.lead_source,
          'product', a.product,
          'arrived_at', COALESCE(a.submitted_at, CASE WHEN a.legacy_source IS NOT NULL THEN c.created_at END, a.created_at),
          'first_term_sheet_at', COALESCE(
            (SELECT min(st.changed_at) FROM stage_transitions st
              WHERE st.application_id = a.id AND st.to_stage = 'term_sheet_issued'),
            a.term_sheet_issued_at),
          'funded_at', COALESCE(a.funded_at,
            (SELECT min(st.changed_at) FROM stage_transitions st
              WHERE st.application_id = a.id AND st.to_stage = 'funded')),
          'lost_at', CASE WHEN a.stage = 'closed_lost' THEN COALESCE(
            (SELECT max(st.changed_at) FROM stage_transitions st
              WHERE st.application_id = a.id AND st.to_stage = 'closed_lost'),
            a.stage_entered_at) END,
          'lost_reason', a.lost_reason))
        FROM applications a
        WHERE a.id IN (SELECT p.application_id FROM participants p WHERE p.contact_id = c.id)) AS apps
    FROM contacts c
    WHERE EXISTS (SELECT 1 FROM participants p WHERE p.contact_id = c.id)
    ${only}
  `;
}

function toApp(v: unknown): NurtureApp | null {
  if (!v || typeof v !== "object") return null;
  const a = v as Row;
  if (a.id === null || a.id === undefined) return null;
  return {
    id: String(a.id),
    stage: String(a.stage ?? "lead"),
    leadSource: String(a.lead_source ?? "unknown"),
    product: String(a.product ?? "unknown"),
    arrivedAt: iso(a.arrived_at),
    firstTermSheetAt: iso(a.first_term_sheet_at),
    fundedAt: iso(a.funded_at),
    lostAt: iso(a.lost_at),
    lostReason: str(a.lost_reason),
  };
}

export function toNurtureContact(r: Row): NurtureContact {
  let apps: unknown = r.apps;
  if (typeof apps === "string") {
    try { apps = JSON.parse(apps); } catch { apps = []; }
  }
  return {
    id: String(r.id),
    firstName: str(r.first_name),
    lastName: str(r.last_name),
    email: str(r.email),
    emailSubscribed: r.email_subscribed === null || r.email_subscribed === undefined ? null : r.email_subscribed === true || r.email_subscribed === "t",
    leadSource: String(r.lead_source ?? "unknown"),
    state: str(r.state),
    roles: arr(r.roles),
    apps: (Array.isArray(apps) ? apps : []).map(toApp).filter((a): a is NurtureApp => a !== null),
    lastTouchAt: iso(r.last_touch_at),
    priorPrograms: arr(r.prior_programs),
    activeProgram: str(r.active_program),
    staffStopped: r.staff_stopped === true || r.staff_stopped === "t",
  };
}

/**
 * What each ACTIVE enrolment needs for the auto-stop check. Inbound, Luis's
 * own outreach, new enquiries and forward stage moves — each the latest one.
 * A move INTO closed_lost is excluded on purpose: marking a quiet lead lost
 * is exactly who nurture is for.
 */
export function activeSignalsSql(): SQL {
  return sql`
    SELECT
      e.id, e.contact_id, e.program, e.enrolled_at, e.sync_state,
      c.email, c.email_subscribed,
      (SELECT max(ac.occurred_at) FROM activities ac
        WHERE ac.contact_id = e.contact_id AND ac.kind IN ('email_in', 'sms_in')) AS last_inbound_at,
      (SELECT max(ac.occurred_at) FROM activities ac
        WHERE ac.contact_id = e.contact_id AND ac.kind IN ('email_out', 'sms_out', 'call')) AS last_outbound_at,
      (SELECT max(COALESCE(a.submitted_at, a.created_at)) FROM applications a
        WHERE a.id IN (SELECT p.application_id FROM participants p WHERE p.contact_id = e.contact_id)) AS last_arrival_at,
      (SELECT max(st.changed_at) FROM stage_transitions st
        WHERE st.to_stage <> 'closed_lost'
          AND st.from_stage IS NOT NULL
          AND st.application_id IN (SELECT p.application_id FROM participants p WHERE p.contact_id = e.contact_id)) AS last_forward_move_at
    FROM nurture_enrollments e
    JOIN contacts c ON c.id = e.contact_id
    WHERE e.status = 'active'
  `;
}

export { iso as isoOf, str as strOf };
