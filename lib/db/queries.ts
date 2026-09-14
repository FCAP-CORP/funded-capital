import "server-only";
import { desc, sql as dsql, eq } from "drizzle-orm";
import { db } from "./index";
import { applications, contacts, participants, properties } from "./schema";

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
}

export async function getPipeline(): Promise<PipelineRow[]> {
  const rows = await db
    .select({
      id: applications.id,
      stage: applications.stage,
      product: applications.product,
      leadSource: applications.leadSource,
      channel: applications.channel,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      phone: contacts.phone,
      contactId: contacts.id,
      requestedAmount: applications.requestedAmount,
      bindingRatio: applications.bindingRatio,
      ltc: applications.ltc,
      ltarv: applications.ltarv,
      propertyAddress: properties.addressLine1,
      submittedAt: applications.submittedAt,
      stageEnteredAt: applications.stageEnteredAt,
      notes: applications.notes,
      borrowerMessage: applications.borrowerMessage,
    })
    .from(applications)
    .leftJoin(participants, eq(participants.applicationId, applications.id))
    .leftJoin(contacts, eq(contacts.id, participants.contactId))
    .leftJoin(properties, eq(properties.id, applications.propertyId))
    .orderBy(desc(applications.submittedAt), desc(applications.createdAt));

  return rows.map((r) => ({
    id: r.id,
    stage: r.stage,
    product: r.product,
    leadSource: r.leadSource,
    channel: r.channel,
    // Pre-joined so the grid can search and sort one field rather than two.
    name: [r.firstName, r.lastName].filter(Boolean).join(" ").trim() || "(unlinked)",
    email: r.email,
    phone: r.phone,
    contactId: r.contactId,
    requestedAmount: r.requestedAmount,
    bindingRatio: r.bindingRatio,
    ltc: r.ltc,
    ltarv: r.ltarv,
    propertyAddress: r.propertyAddress,
    submittedAt: r.submittedAt ? r.submittedAt.toISOString() : null,
    stageEnteredAt: r.stageEnteredAt ? r.stageEnteredAt.toISOString() : null,
    notes: r.notes,
    borrowerMessage: r.borrowerMessage,
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
  }));
}

export interface CrmCounts {
  contacts: number;
  applications: number;
  noApplication: number;
  openPipeline: number;
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

  return {
    contacts: Number(c.n),
    applications: Number(a.n),
    // Contacts with no deal at all — the aged-prospect pool, 96% of the book.
    noApplication: Number(c.n) - Number(linked.n),
    openPipeline: Number(open.n),
  };
}
