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
import { OUTREACH_WHERE, RESPONSE_WHERE } from "@/lib/db/contactKinds";
import { STAGE_ORDER, type NurtureApp, type NurtureContact } from "./nurture";

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
 * Every contact — with a deal or without (the old spreadsheet's contacts are
 * the "contacts" programme, 26 Sep 2026) — or only `ids` when given.
 * `"contacts"."id"` is written out by hand: drizzle renders a select-list
 * column unqualified, and a bare "id" inside a correlated subquery binds to
 * the INNER table (the 24 Sep 2026 "0 deals" bug, lib/db/contactSubqueries.ts).
 */
export function nurtureContactsSql(ids?: string[]): SQL {
  const only = ids ? sql`AND c.id = ANY(${uuidArray(ids)})` : sql``;
  return sql`
    SELECT
      c.id, c.first_name, c.last_name, c.email, c.email_subscribed, c.lead_source, c.state, c.created_at, c.tags,
      (SELECT array_agg(DISTINCT p.role::text) FROM participants p WHERE p.contact_id = c.id) AS roles,
      (SELECT max(ac.occurred_at) FROM activities ac
        WHERE ac.contact_id = c.id AND ${RESPONSE_WHERE}) AS last_response_at,
      (SELECT max(ac.occurred_at) FROM activities ac
        WHERE ac.contact_id = c.id AND ${OUTREACH_WHERE}) AS last_outreach_at,
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
    WHERE true
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
    lastResponseAt: iso(r.last_response_at),
    lastOutreachAt: iso(r.last_outreach_at),
    priorPrograms: arr(r.prior_programs),
    activeProgram: str(r.active_program),
    staffStopped: r.staff_stopped === true || r.staff_stopped === "t",
    addedAt: iso(r.created_at),
    tags: arr(r.tags),
  };
}

/** A list of stage names as a bound text[] (drizzle sql.join, one parameter each). */
const textArray = (xs: readonly string[]): SQL => sql`ARRAY[${sql.join(xs.map((x) => sql`${x}`), sql`, `)}]::text[]`;

/**
 * What each ACTIVE enrolment needs for the auto-stop check. Inbound, Luis's
 * own outreach, new enquiries and forward stage moves — each the latest one —
 * and when the person joined the Klaviyo list, for "finished".
 *
 * FORWARD means nurture.ts isForwardMove, in SQL: into a stage later in
 * STAGE_ORDER than where it came from, or out of closed_lost (a reopen). A
 * move INTO closed_lost is excluded on purpose — marking a quiet lead lost is
 * exactly who nurture is for — and so is a step backwards: before 30 Sep 2026
 * a correction (underwriting back to lead) stopped the programme and counted
 * as a win.
 */
export function activeSignalsSql(): SQL {
  const order = textArray(STAGE_ORDER);
  return sql`
    SELECT
      e.id, e.contact_id, e.program, e.enrolled_at, e.sync_state, e.synced_at, e.released_at,
      c.email, c.email_subscribed,
      (SELECT max(ac.occurred_at) FROM activities ac
        WHERE ac.contact_id = e.contact_id AND ${RESPONSE_WHERE}) AS last_inbound_at,
      (SELECT max(COALESCE(a.submitted_at, a.created_at)) FROM applications a
        WHERE a.id IN (SELECT p.application_id FROM participants p WHERE p.contact_id = e.contact_id)) AS last_arrival_at,
      (SELECT max(st.changed_at) FROM stage_transitions st
        WHERE st.from_stage IS NOT NULL
          AND st.to_stage <> 'closed_lost'
          AND array_position(${order}, st.to_stage::text) IS NOT NULL
          AND (st.from_stage = 'closed_lost'
               OR array_position(${order}, st.to_stage::text) > array_position(${order}, st.from_stage::text))
          AND st.application_id IN (SELECT p.application_id FROM participants p WHERE p.contact_id = e.contact_id)) AS last_forward_move_at
    FROM nurture_enrollments e
    JOIN contacts c ON c.id = e.contact_id
    WHERE e.status = 'active'
  `;
}

export { iso as isoOf, str as strOf };

/**
 * Each programme's flow length in days — the last email's `afterDays` in the
 * stored snapshot — for finishing enrolments (cockpit.ts finishAt). Computed
 * in SQL so the every-run auto-stop does not pull the rendered previews
 * (up to 200 KB an email) out of the database. Null when no email is stored.
 */
export function flowDaysSql(): SQL {
  return sql`
    SELECT np.program,
      (SELECT max((em->>'afterDays')::float8)
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(np.flow_snapshot->'emails') = 'array'
                                       THEN np.flow_snapshot->'emails' ELSE '[]'::jsonb END) em
        WHERE jsonb_typeof(em->'afterDays') = 'number') AS flow_days
    FROM nurture_programs np
  `;
}

/* ------------------------------------------------ the cockpit (28 Sep 2026) */

/**
 * Enrol `ids` into one programme as QUEUED — waiting for the warm-up to
 * release them — with a timeline entry each, in one statement. Shared by
 * Luis's Enrol button (nurture.server.ts, after its staff check and fresh
 * re-classify) and the automatic morning enrolment (sync.server.ts, after its
 * own fresh classify), so the two can never write different rows.
 * ON CONFLICT DO NOTHING covers both unique rules: never the same programme
 * twice, never two active programmes.
 */
export function enrolQueuedSql(p: { program: string; listId: string; ids: string[]; by: string; subject: string }): SQL {
  return sql`
    WITH ins AS (
      INSERT INTO nurture_enrollments (contact_id, program, enrolled_by, klaviyo_list_id, sync_state)
      SELECT x, ${p.program}, ${p.by}, ${p.listId}, 'queued'
      FROM unnest(${uuidArray(p.ids)}) AS x
      ON CONFLICT DO NOTHING
      RETURNING id, contact_id
    ), act AS (
      INSERT INTO activities (contact_id, kind, source, subject, dedup_key)
      SELECT contact_id, 'automation', 'nurture', ${p.subject}, 'nurture:in:' || id::text
      FROM ins
      ON CONFLICT (dedup_key) DO NOTHING
    )
    SELECT count(*)::int AS n FROM ins
  `;
}

/**
 * How many people were released to Klaviyo today (New York day `today`), and
 * on how many earlier days in the last 30 a release happened — the warm-up's
 * position (lib/nurture/cockpit.ts dailyCap). Measured against the caller's
 * `now`, the same instant the release decision uses, not the database clock.
 */
export function releaseCountsSql(today: string, now: Date): SQL {
  return sql`
    SELECT
      count(*) FILTER (WHERE (released_at AT TIME ZONE 'America/New_York')::date = ${today}::date)::int AS released_today,
      count(DISTINCT (released_at AT TIME ZONE 'America/New_York')::date)
        FILTER (WHERE (released_at AT TIME ZONE 'America/New_York')::date < ${today}::date
                  AND released_at >= ${now.toISOString()}::timestamptz - interval '30 days')::int AS prior_release_days
    FROM nurture_enrollments
    WHERE released_at IS NOT NULL
  `;
}

/**
 * Nurture email events of each kind in the last `days` before `now` — the
 * deliverability guard's input — or since Luis last resumed sending, if that
 * is more recent: a week of old bounces must not re-pause the moment he
 * resumes after fixing the cause.
 */
export function healthCountsSql(days: number, now: Date): SQL {
  return sql`
    SELECT
      count(*) FILTER (WHERE kind = 'sent')::int AS sent,
      count(*) FILTER (WHERE kind = 'bounce')::int AS bounce,
      count(*) FILTER (WHERE kind = 'spam')::int AS spam,
      count(*) FILTER (WHERE kind = 'unsub')::int AS unsub
    FROM nurture_events
    WHERE occurred_at >= GREATEST(
      ${now.toISOString()}::timestamptz - make_interval(days => ${days}),
      COALESCE((SELECT health_since FROM nurture_control WHERE id = 1), '-infinity'::timestamptz))
  `;
}
