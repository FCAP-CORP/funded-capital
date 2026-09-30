/**
 * The one INSERT that creates a deal's document list, shared by the automatic
 * start (moveStage, inside its db.batch) and "Create the list" on the record
 * card. SQL only — no connection, no session; the callers are staff-checked.
 *
 * ON CONFLICT DO NOTHING on (application_id, item_key): a second run adds only
 * items that are not there yet, and never revives one Luis removed or waived.
 */
import { sql, type SQL } from "drizzle-orm";
import { checklistFor, type DocItem } from "./docRequests";

export function seedRequestsSql(
  applicationId: string,
  product: string | null | undefined,
  purpose: string | null | undefined,
  by: string | null,
  now: Date,
  /**
   * Inside a stage move: add the list only if THAT move landed (the deal is in
   * `to` with the exact stage_entered_at the move stamped — lib/crm/stageMoveSql.ts).
   * A move refused because the deal changed underneath must not start a list.
   */
  onlyIfMoved?: { to: string; at: Date },
): SQL {
  const items: DocItem[] = checklistFor(product, purpose);
  const values = sql.join(
    items.map((it, i) => sql`(${applicationId}::uuid, ${it.key}, ${it.label}, ${it.hint}, ${(i + 1) * 10}, ${now.toISOString()}::timestamptz, ${by})`),
    sql`, `,
  );
  if (!onlyIfMoved) {
    return sql`
      INSERT INTO document_requests (application_id, item_key, label, hint, sort, requested_at, requested_by)
      VALUES ${values}
      ON CONFLICT (application_id, item_key) DO NOTHING
    `;
  }
  return sql`
    INSERT INTO document_requests (application_id, item_key, label, hint, sort, requested_at, requested_by)
    SELECT v.application_id, v.item_key::text, v.label::text, v.hint::text, v.sort::int, v.requested_at, v.requested_by::text
    FROM (VALUES ${values}) AS v(application_id, item_key, label, hint, sort, requested_at, requested_by)
    WHERE EXISTS (
      SELECT 1 FROM applications a
      WHERE a.id = ${applicationId}::uuid AND a.stage = ${onlyIfMoved.to}::stage
        AND a.stage_entered_at = ${onlyIfMoved.at.toISOString()}::timestamptz
    )
    ON CONFLICT (application_id, item_key) DO NOTHING
  `;
}
