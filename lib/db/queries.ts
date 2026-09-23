import "server-only";
import { desc, sql as dsql, eq, type SQL, type AnyColumn } from "drizzle-orm";
import { db } from "./index";
import { activities, applications, contacts, participants, properties } from "./schema";
import { assertCrmStaff } from "@/lib/crm/access";
import type { DashboardApplication } from "@/lib/crm/dashboard";

/**
 * Read queries for the CRM.
 *
 * Every row shape here is a flat, serialisable projection — only the columns the
 * grid actually shows. The client filters and sorts a hydrated set, so anything
 * selected here is shipped to the browser: selecting `*` would put borrower
 * notes and consent records into the page source for no reason.
 *
 * The row shapes are `type` aliases, not `interface`s, and that is load-bearing.
 * TypeScript gives a type alias an implicit index signature but does not give one
 * to an interface, so only the alias form satisfies the `Record<string, unknown>`
 * constraint the generic grid uses. Rewriting these as interfaces breaks the
 * build at every DataTable call site.
 */

/**
 * Newest real correspondence with a contact, and which way it went.
 *
 * Correlated subqueries rather than a join, because a contact has many
 * activities and joining would multiply the rows before we could collapse them.
 * `activities_contact_idx` covers the lookup.
 *
 * Restricted to email_in / email_out on purpose: a form submission is the
 * borrower raising their hand, not a conversation, and counting it would put
 * every untouched lead back under a reassuring "last contacted" date — which is
 * the illusion this column exists to destroy.
 */
const LAST_CONTACT_AT = (contactId: SQL | AnyColumn) => dsql<Date | null>`(
  SELECT max(a.occurred_at) FROM ${activities} a
  WHERE a.contact_id = ${contactId} AND a.kind IN ('email_in', 'email_out')
)`;

const LAST_CONTACT_DIR = (contactId: SQL | AnyColumn) => dsql<string | null>`(
  SELECT a.kind FROM ${activities} a
  WHERE a.contact_id = ${contactId} AND a.kind IN ('email_in', 'email_out')
  ORDER BY a.occurred_at DESC LIMIT 1
)`;

/**
 * Reading raw rows back out of drizzle.
 *
 * The cast goes through `unknown` deliberately: `NeonHttpQueryResult` does not
 * structurally overlap with a hand-written `{ rows: ... }`, so a direct `as` is
 * a TS2352 error. Same pattern as lib/broker/admin.server.ts.
 */
type Row = Record<string, unknown>;
const rowsOf = (r: unknown): Row[] => (r as { rows?: Row[] }).rows ?? (r as Row[]);
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const iso = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

export type PipelineRow = {
  id: string;
  stage: string;
  product: string;
  leadSource: string;
  channel: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  contactId: string | null;
  requestedAmount: string | null;
  bindingRatio: string | null;
  ltc: string | null;
  ltarv: string | null;
  propertyAddress: string | null;
  submittedAt: string | null;
  stageEnteredAt: string | null;
  notes: string | null;
  borrowerMessage: string | null;
  lastContactAt: string | null;
  lastContactDirection: string | null;
}

/**
 * ONE ROW PER APPLICATION. This is not a detail — it was a live defect.
 *
 * The previous version joined `participants` straight onto `applications`. A
 * person may hold more than one role on the same deal (the unique index is
 * application + contact + ROLE), and a broker who is also the borrower on their
 * own file therefore produced TWO rows for one application. The grid showed the
 * deal twice, and — worse, because nobody would question it — the stats above
 * the grid counted it twice.
 *
 * That is how the Pipeline screen came to report "135 open files, 130 all
 * time" on 23 Sep 2026: 135 is impossible when there are only 130 applications,
 * and the requested-value total was inflated by the same six deals. A number
 * that cannot be true is the lucky case; the same bug on a chart nobody
 * cross-checks just reads as a good month.
 *
 * The LATERAL below picks exactly one contact per application — the borrower
 * when there is one, otherwise whoever was attached first — so the multiplicity
 * is fixed at the source rather than deduplicated by every caller in turn.
 * `LEFT JOIN LATERAL ... ON true` keeps applications that have no participant
 * at all; those still render as "(unlinked)", as they did before.
 */
export async function getPipeline(): Promise<PipelineRow[]> {
  const result = await db.execute(dsql`
    SELECT
      a.id,
      a.stage,
      a.product,
      a.lead_source,
      a.channel,
      a.requested_amount,
      a.binding_ratio,
      a.ltc,
      a.ltarv,
      a.submitted_at,
      a.stage_entered_at,
      a.notes,
      a.borrower_message,
      pr.address_line1        AS property_address,
      c.contact_id,
      c.first_name,
      c.last_name,
      c.email,
      c.phone,
      (SELECT max(ac.occurred_at) FROM activities ac
        WHERE ac.contact_id = c.contact_id AND ac.kind IN ('email_in','email_out')) AS last_contact_at,
      (SELECT ac.kind FROM activities ac
        WHERE ac.contact_id = c.contact_id AND ac.kind IN ('email_in','email_out')
        ORDER BY ac.occurred_at DESC LIMIT 1) AS last_contact_direction
    FROM applications a
    LEFT JOIN properties pr ON pr.id = a.property_id
    LEFT JOIN LATERAL (
      SELECT ct.id AS contact_id, ct.first_name, ct.last_name, ct.email, ct.phone
      FROM participants p
      JOIN contacts ct ON ct.id = p.contact_id
      WHERE p.application_id = a.id
      -- Borrower first; then oldest attachment, so the choice is stable across
      -- reloads rather than whatever the planner happens to return.
      ORDER BY (p.role = 'borrower') DESC, p.created_at ASC, ct.id ASC
      LIMIT 1
    ) c ON true
    ORDER BY a.submitted_at DESC, a.created_at DESC
  `);

  return rowsOf(result).map((r): PipelineRow => ({
    id: String(r.id),
    stage: String(r.stage),
    product: String(r.product),
    leadSource: String(r.lead_source),
    channel: str(r.channel),
    // Pre-joined so the grid can search and sort one field rather than two.
    name: [str(r.first_name), str(r.last_name)].filter(Boolean).join(" ").trim() || "(unlinked)",
    email: str(r.email),
    phone: str(r.phone),
    contactId: str(r.contact_id),
    requestedAmount: str(r.requested_amount),
    bindingRatio: str(r.binding_ratio),
    ltc: str(r.ltc),
    ltarv: str(r.ltarv),
    propertyAddress: str(r.property_address),
    submittedAt: iso(r.submitted_at),
    stageEnteredAt: iso(r.stage_entered_at),
    notes: str(r.notes),
    borrowerMessage: str(r.borrower_message),
    lastContactAt: iso(r.last_contact_at),
    lastContactDirection: str(r.last_contact_direction),
  }));
}

export type ContactRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  phoneRaw: string | null;
  leadSource: string;
  targetMarket: string | null;
  state: string | null;
  creditBand: string | null;
  tags: string[];
  deals: number;
  createdAt: string | null;
  notes: string | null;
  lastContactAt: string | null;
  lastContactDirection: string | null;
}

export async function getContacts(): Promise<ContactRow[]> {
  const rows = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      phone: contacts.phone,
      phoneRaw: contacts.phoneRaw,
      leadSource: contacts.leadSource,
      targetMarket: contacts.targetMarket,
      state: contacts.state,
      creditBand: contacts.creditBand,
      tags: contacts.tags,
      createdAt: contacts.createdAt,
      notes: contacts.notes,
      deals: dsql<number>`(
        SELECT count(*)::int FROM ${participants} p WHERE p.contact_id = ${contacts.id}
      )`,
      lastContactAt: LAST_CONTACT_AT(contacts.id),
      lastContactDirection: LAST_CONTACT_DIR(contacts.id),
    })
    .from(contacts)
    .orderBy(desc(contacts.createdAt));

  return rows.map((r) => ({
    id: r.id,
    name: [r.firstName, r.lastName].filter(Boolean).join(" ").trim() || "(no name)",
    email: r.email,
    phone: r.phone,
    phoneRaw: r.phoneRaw,
    leadSource: r.leadSource,
    targetMarket: r.targetMarket,
    state: r.state,
    creditBand: r.creditBand,
    tags: r.tags ?? [],
    deals: Number(r.deals ?? 0),
    createdAt: r.createdAt ? r.createdAt.toISOString() : null,
    notes: r.notes,
    lastContactAt: r.lastContactAt ? new Date(r.lastContactAt).toISOString() : null,
    lastContactDirection: r.lastContactDirection,
  }));
}

export interface CrmCounts {
  contacts: number;
  applications: number;
  noApplication: number;
  openPipeline: number;
  /** Contacts with no email either way. The Angel Tellez detector. */
  neverContacted: number;
}

export async function getCounts(): Promise<CrmCounts> {
  const [c] = await db.select({ n: dsql<number>`count(*)::int` }).from(contacts);
  const [a] = await db.select({ n: dsql<number>`count(*)::int` }).from(applications);
  const [linked] = await db
    .select({ n: dsql<number>`count(DISTINCT ${participants.contactId})::int` })
    .from(participants);
  const [open] = await db
    .select({ n: dsql<number>`count(*)::int` })
    .from(applications)
    .where(dsql`${applications.stage} NOT IN ('closed_lost', 'payoff')`);

  const [never] = await db
    .select({ n: dsql<number>`count(*)::int` })
    .from(contacts)
    .where(dsql`NOT EXISTS (
      SELECT 1 FROM ${activities} a
      WHERE a.contact_id = ${contacts.id} AND a.kind IN ('email_in', 'email_out')
    )`);

  return {
    contacts: Number(c.n),
    neverContacted: Number(never.n),
    applications: Number(a.n),
    // Contacts with no deal at all — the aged-prospect pool, 96% of the book.
    noApplication: Number(c.n) - Number(linked.n),
    openPipeline: Number(open.n),
  };
}

/* ------------------------------------------------------------- dashboard */

/**
 * Every application, shaped for `lib/crm/dashboard.ts`.
 *
 * ONE ROW PER APPLICATION, for the same reason `getPipeline` now is — a KPI
 * built on multiplied rows is wrong in the direction that flatters you, and a
 * work queue built on them lists the same borrower twice.
 *
 * THIS ONE ASSERTS STAFF ITSELF, unlike its neighbours in this file, which
 * still rely on their calling page to have checked. It reads the whole book,
 * including every borrower's email and what they asked for, so "the caller
 * already checked" is not an assumption worth making for it. The older
 * functions here are a separate cleanup, noted in CLAUDE.md.
 */
export async function getDashboardApplications(): Promise<DashboardApplication[]> {
  await assertCrmStaff();

  const result = await db.execute(dsql`
    SELECT
      a.id,
      a.stage,
      a.stage_entered_at,
      a.submitted_at,
      a.created_at,
      a.requested_amount,
      a.decisioned_at,
      a.term_sheet_issued_at,
      a.term_sheet_signed_at,
      /*
       * Funded date, from whichever source has it.
       *
       * funded_at is what the legacy migration wrote; stage_transitions is what
       * the UI writes when a deal is moved. Neither covers the whole book on its
       * own, and preferring one silently would undercount half of it -- which
       * reads exactly like a bad month rather than like a missing join.
       */
      COALESCE(
        a.funded_at,
        (SELECT min(st.changed_at) FROM stage_transitions st
          WHERE st.application_id = a.id AND st.to_stage = 'funded')
      ) AS funded_at,
      c.contact_id,
      c.first_name,
      c.last_name,
      c.email,
      (SELECT max(ac.occurred_at) FROM activities ac
        WHERE ac.contact_id = c.contact_id AND ac.kind IN ('email_in','email_out')) AS last_contact_at,
      (SELECT ac.kind FROM activities ac
        WHERE ac.contact_id = c.contact_id AND ac.kind IN ('email_in','email_out')
        ORDER BY ac.occurred_at DESC LIMIT 1) AS last_contact_direction
    FROM applications a
    LEFT JOIN LATERAL (
      SELECT ct.id AS contact_id, ct.first_name, ct.last_name, ct.email
      FROM participants p
      JOIN contacts ct ON ct.id = p.contact_id
      WHERE p.application_id = a.id
      ORDER BY (p.role = 'borrower') DESC, p.created_at ASC, ct.id ASC
      LIMIT 1
    ) c ON true
  `);

  return rowsOf(result).map((r): DashboardApplication => ({
    id: String(r.id),
    stage: String(r.stage),
    stageEnteredAt: iso(r.stage_entered_at),
    submittedAt: iso(r.submitted_at),
    createdAt: iso(r.created_at),
    requestedAmount: str(r.requested_amount),
    contactId: str(r.contact_id),
    name: [str(r.first_name), str(r.last_name)].filter(Boolean).join(" ").trim() || "(unlinked)",
    email: str(r.email),
    fundedAt: iso(r.funded_at),
    decisionedAt: iso(r.decisioned_at),
    termSheetIssuedAt: iso(r.term_sheet_issued_at),
    termSheetSignedAt: iso(r.term_sheet_signed_at),
    lastContactAt: iso(r.last_contact_at),
    lastContactDirection: str(r.last_contact_direction),
  }));
}
