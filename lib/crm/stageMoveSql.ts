/**
 * The two statements that move a deal's stage, for app/crm/actions.ts.
 *
 * The move only lands if the deal is STILL in the stage the caller read
 * (audit 30 Sep 2026). Two open tabs, a double-click, or a bulk move racing a
 * single one used to both write: two history rows, and the broker emailed
 * twice. Now the UPDATE carries `stage = <what was read>`: under Postgres row
 * locking the second writer waits, re-checks, finds the stage changed and
 * writes nothing.
 *
 * ORDER MATTERS. Run both in ONE db.batch (one transaction), UPDATE first.
 * The history row is inserted only if THIS move's update landed, recognised by
 * the exact stage_entered_at it stamped, which no other move shares. So a
 * refused move leaves no phantom history either. The caller checks the
 * UPDATE's RETURNING rows: none means "refused, refresh".
 *
 * Pure (no db import), so the Postgres harness runs exactly these statements.
 */
import { sql, type SQL } from "drizzle-orm";

export type StageMove = {
  applicationId: string;
  from: string;
  to: string;
  at: Date;
  by: string;
  reason: string;
  lostReason?: string;
};

export function stageMoveSql(m: StageMove): [SQL, SQL] {
  const at = m.at.toISOString();
  const lost = m.lostReason !== undefined ? sql`, lost_reason = ${m.lostReason}` : sql``;
  return [
    sql`
      UPDATE applications
      SET stage = ${m.to}::stage, stage_entered_at = ${at}::timestamptz, updated_at = ${at}::timestamptz ${lost}
      WHERE id = ${m.applicationId}::uuid AND stage = ${m.from}::stage
      RETURNING id
    `,
    sql`
      INSERT INTO stage_transitions (application_id, from_stage, to_stage, changed_at, changed_by, reason)
      SELECT a.id, ${m.from}::stage, ${m.to}::stage, ${at}::timestamptz, ${m.by}, ${m.reason}
      FROM applications a
      WHERE a.id = ${m.applicationId}::uuid AND a.stage = ${m.to}::stage AND a.stage_entered_at = ${at}::timestamptz
    `,
  ];
}
