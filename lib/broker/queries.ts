/**
 * What a broker's dashboard reads — from Postgres, scoped by lib/broker/scope.ts.
 *
 * This replaces a Google Sheet read. The Sheet could only ever show what was
 * written into it at submission time, so a broker saw "Submitted" forever while
 * Luis moved the deal through underwriting in a system they could not see. Now
 * the stage on their screen is the stage in the CRM.
 *
 * EVERY QUERY IS SCOPED FROM THE SESSION. The viewer comes from Clerk and their
 * firm comes from their own `broker_users` row; nothing here accepts a firm id
 * from a caller, because a firm id that can be passed in is a firm id that can
 * be guessed. `queryScope` decides the filter and there is exactly one shape
 * per case — see lib/broker/scope.ts for why that matters.
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";
import { queryScope, type BrokerViewer } from "./scope";

export interface BrokerDeal {
  applicationId: string;
  borrower: string | null;
  product: string;
  /** Subject property. For a portfolio, the first of several. */
  property: string | null;
  isPortfolio: boolean;
  propertyCount: number | null;
  loanAmount: number | null;
  /** The raw CRM stage. Callers render it through stageView, never directly. */
  stage: string;
  submittedAt: string | null;
  stageEnteredAt: string | null;
  driveFolder: string | null;
  /** True when this deal was filed by someone else at the same firm. */
  submittedByOther: boolean;
}

type Row = Record<string, unknown>;

const str = (v: unknown) => (v === null || v === undefined ? null : String(v));
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/**
 * The deals this viewer may see, newest first.
 *
 * Never throws: a dashboard that errors is worse than a dashboard that is
 * briefly empty, and the caller has no better recovery than showing nothing.
 */
export async function getBrokerPipeline(viewer: BrokerViewer | null): Promise<BrokerDeal[]> {
  const scope = queryScope(viewer);
  if (scope.kind === "nothing") return [];

  const url = process.env.DATABASE_URL;
  if (!url) return [];

  try {
    const db = drizzle(neon(url));

    /**
     * The scope clause is built from the ONE shape `queryScope` returned, and
     * the ids are parameters rather than interpolated text. A firm id spliced
     * into SQL as a string is how a scoping bug becomes an injection bug.
     */
    const where = scope.kind === "own"
      ? sql`a.submitted_by_user_id = ${scope.userId}`
      : sql`(a.broker_firm_id = ${scope.firmId} OR a.submitted_by_user_id = ${scope.userId})`;

    const result = await db.execute(sql`
      SELECT
        a.id,
        a.stage,
        a.product,
        a.is_portfolio,
        a.property_count,
        a.requested_amount,
        a.submitted_at,
        a.stage_entered_at,
        a.submitted_by_user_id,
        p.address_line1,
        c.first_name,
        c.last_name,
        (
          SELECT act.metadata->>'driveFolder'
          FROM activities act
          WHERE act.application_id = a.id
            AND act.kind = 'form_submission'
            AND act.metadata->>'driveFolder' IS NOT NULL
          ORDER BY act.occurred_at DESC
          LIMIT 1
        ) AS drive_folder
      FROM applications a
      LEFT JOIN properties p ON p.id = a.property_id
      LEFT JOIN participants pt ON pt.application_id = a.id AND pt.role = 'borrower'
      LEFT JOIN contacts c ON c.id = pt.contact_id
      WHERE ${where}
      ORDER BY a.submitted_at DESC NULLS LAST, a.created_at DESC
      LIMIT 200
    `);

    const rows: Row[] = (result as { rows?: Row[] }).rows ?? (result as unknown as Row[]);
    const viewerId = viewer?.userId ?? null;

    return rows.map((r): BrokerDeal => {
      const first = str(r.first_name);
      const last = str(r.last_name);
      const borrower = [first, last].filter(Boolean).join(" ").trim() || null;
      return {
        applicationId: String(r.id),
        borrower,
        product: str(r.product) ?? "unknown",
        property: str(r.address_line1),
        isPortfolio: r.is_portfolio === true,
        propertyCount: num(r.property_count),
        loanAmount: num(r.requested_amount),
        stage: str(r.stage) ?? "lead",
        submittedAt: str(r.submitted_at),
        stageEnteredAt: str(r.stage_entered_at),
        driveFolder: str(r.drive_folder),
        // Only meaningful for owners and leads, who can see colleagues' work.
        submittedByOther: Boolean(viewerId && str(r.submitted_by_user_id) && str(r.submitted_by_user_id) !== viewerId),
      };
    });
  } catch (err) {
    console.error("[broker/queries] getBrokerPipeline failed:", err);
    return [];
  }
}
