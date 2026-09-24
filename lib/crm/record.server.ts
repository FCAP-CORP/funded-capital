/**
 * Everything the record card shows about one deal, in one database round trip.
 *
 * STAFF-ONLY, AND IT SAYS SO ITSELF. This reads a borrower's whole file —
 * contact details, consent state, what they told us, every logged call — so it
 * calls `assertCrmStaff()` before anything else rather than trusting the page
 * that rendered it. It is listed in STAFF_ONLY_MODULES in guards.regress.ts, so
 * removing that line fails the build.
 *
 * ONE ROUND TRIP. The eight reads go out as a single `db.batch`, which the
 * neon-http driver sends as one HTTP request. Eight awaits in a row would be
 * eight trips to Neon on every card open; `Promise.all` would still be eight
 * requests. The batch is read-only, so running it inside the transaction the
 * driver wraps it in costs nothing.
 *
 * WHICH CONTACT'S HISTORY. An activity can be filed against the deal, or only
 * against the person — the Gmail sync deliberately leaves `application_id`
 * empty because a borrower with three deals gives no honest way to say which
 * one an email was about (see lib/crm/activity.ts, rule 3). So the timeline is
 * this deal's own rows PLUS the unattributed rows of the deal's primary
 * contact, chosen exactly as the pipeline and dashboard choose it — borrower
 * first, then earliest attached — so the card and the grid name the same
 * person. Rows attributed to the person's OTHER deals stay on those deals.
 *
 * NO FILE CONTENTS. `documents` is metadata only, and only the name, type and
 * dates are read here. Not even the Drive id leaves this module.
 */

import "server-only";
import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  activities,
  applicationProperties,
  applications,
  brokerFirms,
  brokerUsers,
  contacts,
  crmTasks,
  documents,
  entities,
  participants,
  properties,
  stageTransitions,
} from "@/lib/db/schema";
import { assertCrmStaff } from "@/lib/crm/access";
import { TIMELINE_LIMIT, type ActivityInput, type TransitionInput } from "./record";
import { isUuid, type TaskLike } from "./tasks";

const iso = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

export type RecordContact = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  phoneRaw: string | null;
  leadSource: string;
  state: string | null;
  targetMarket: string | null;
  creditBand: string | null;
  ownerName: string | null;
  notes: string | null;
  claimedDeals: number | null;
  verifiedDeals: number | null;
  emailSubscribed: boolean | null;
  smsConsentAt: string | null;
  smsConsentVersion: string | null;
  smsOptedOut: boolean;
};

export type RecordParticipant = {
  contactId: string;
  role: string;
  name: string;
  email: string | null;
  phone: string | null;
};

export type RecordProperty = {
  id: string;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  propertyType: string | null;
  units: number | null;
  purchasePrice: string | null;
  asIsValue: string | null;
  rehabBudget: string | null;
  arv: string | null;
  arvSource: string | null;
  monthlyRent: string | null;
  estimatedPayoff: string | null;
  lienPosition: number | null;
};

export type RecordTask = TaskLike & { createdBy: string | null };

export type RecordDocument = {
  id: string;
  name: string;
  docType: string | null;
  requestedAt: string | null;
  receivedAt: string | null;
  expiresOn: string | null;
};

export type RecordCardData = {
  app: {
    id: string;
    stage: string;
    stageEnteredAt: string | null;
    product: string;
    leadSource: string;
    channel: string | null;
    ownerName: string | null;
    requestedAmount: string | null;
    downPayment: string | null;
    ltc: string | null;
    ltarv: string | null;
    ltv: string | null;
    bindingRatio: string | null;
    isPortfolio: boolean;
    propertyCount: number | null;
    loanPurpose: string | null;
    exitStrategy: string | null;
    timeline: string | null;
    termSheetIssuedAt: string | null;
    termSheetSignedAt: string | null;
    decisionedAt: string | null;
    fundedAt: string | null;
    lostReason: string | null;
    borrowerMessage: string | null;
    notes: string | null;
    submittedAt: string | null;
    createdAt: string | null;
    nextActionAt: string | null;
    nextActionSetAt: string | null;
    nextActionNote: string | null;
  };
  entity: { name: string; entityType: string | null; formationState: string | null } | null;
  broker: { name: string | null; email: string; phone: string | null; firmName: string | null } | null;
  /** The person the card is named after. Null for an unlinked application. */
  contact: RecordContact | null;
  /** Everyone attached, with their role — one row per role held. */
  participants: RecordParticipant[];
  properties: RecordProperty[];
  activities: ActivityInput[];
  totalActivities: number;
  transitions: TransitionInput[];
  totalTransitions: number;
  tasks: RecordTask[];
  documents: RecordDocument[];
};

/** The primary contact, chosen exactly as getPipeline and the dashboard choose it. */
const primaryContactOf = (applicationId: string) => sql`(
  SELECT p.contact_id FROM participants p
  WHERE p.application_id = ${applicationId}
  ORDER BY (p.role = 'borrower') DESC, p.created_at ASC, p.contact_id ASC
  LIMIT 1
)`;

/**
 * The card's data, or null when there is no such deal.
 *
 * An id that is not a uuid is "no such deal" rather than a thrown Postgres
 * error: it arrives from the address bar, and a mistyped link should render
 * "not found", not break the page around it.
 */
export async function getRecordCard(applicationId: string): Promise<RecordCardData | null> {
  await assertCrmStaff();
  if (!isUuid(applicationId)) return null;

  const id = applicationId;
  const timelineScope = or(
    eq(activities.applicationId, id),
    and(isNull(activities.applicationId), eq(activities.contactId, primaryContactOf(id))),
  );

  const [
    appRows,
    peopleRows,
    propertyRows,
    activityRows,
    activityCount,
    transitionRows,
    transitionCount,
    taskRows,
    docRows,
  ] = await db.batch([
    db
      .select({
        app: applications,
        entityName: entities.name,
        entityType: entities.entityType,
        entityState: entities.formationState,
        brokerName: brokerUsers.name,
        brokerEmail: brokerUsers.email,
        brokerPhone: brokerUsers.phone,
        firmName: brokerFirms.name,
      })
      .from(applications)
      .leftJoin(entities, eq(entities.id, applications.entityId))
      .leftJoin(brokerUsers, eq(brokerUsers.clerkUserId, applications.submittedByUserId))
      .leftJoin(brokerFirms, eq(brokerFirms.id, applications.brokerFirmId))
      .where(eq(applications.id, id))
      .limit(1),

    db
      .select({ role: participants.role, contact: contacts })
      .from(participants)
      .innerJoin(contacts, eq(contacts.id, participants.contactId))
      .where(eq(participants.applicationId, id))
      .orderBy(desc(sql`(${participants.role} = 'borrower')`), asc(participants.createdAt), asc(contacts.id)),

    /*
     * Every property on the deal in the order the broker entered them, plus the
     * subject property for a deal filed before application_properties existed.
     * A single-property deal has the same id in both places and appears once.
     */
    db
      .select({ property: properties, position: sql<number>`coalesce(${applicationProperties.position}, -1)` })
      .from(properties)
      .leftJoin(
        applicationProperties,
        and(eq(applicationProperties.propertyId, properties.id), eq(applicationProperties.applicationId, id)),
      )
      .where(
        or(
          eq(applicationProperties.applicationId, id),
          eq(properties.id, sql`(SELECT a.property_id FROM applications a WHERE a.id = ${id})`),
        ),
      )
      .orderBy(asc(sql`coalesce(${applicationProperties.position}, -1)`), asc(properties.createdAt)),

    db
      .select({
        id: activities.id,
        kind: activities.kind,
        occurredAt: activities.occurredAt,
        source: activities.source,
        subject: activities.subject,
        body: activities.body,
      })
      .from(activities)
      .where(timelineScope)
      .orderBy(desc(activities.occurredAt), desc(activities.id))
      .limit(TIMELINE_LIMIT),

    db.select({ n: sql<number>`count(*)::int` }).from(activities).where(timelineScope),

    db
      .select({
        id: stageTransitions.id,
        fromStage: stageTransitions.fromStage,
        toStage: stageTransitions.toStage,
        changedAt: stageTransitions.changedAt,
        reason: stageTransitions.reason,
      })
      .from(stageTransitions)
      .where(eq(stageTransitions.applicationId, id))
      .orderBy(desc(stageTransitions.changedAt), desc(stageTransitions.id))
      .limit(TIMELINE_LIMIT),

    db
      .select({ n: sql<number>`count(*)::int` })
      .from(stageTransitions)
      .where(eq(stageTransitions.applicationId, id)),

    db
      .select({
        id: crmTasks.id,
        title: crmTasks.title,
        dueOn: crmTasks.dueOn,
        createdAt: crmTasks.createdAt,
        completedAt: crmTasks.completedAt,
        createdBy: crmTasks.createdBy,
      })
      .from(crmTasks)
      .where(and(eq(crmTasks.applicationId, id), isNull(crmTasks.deletedAt)))
      .orderBy(asc(crmTasks.createdAt)),

    db
      .select({
        id: documents.id,
        name: documents.name,
        docType: documents.docType,
        requestedAt: documents.requestedAt,
        receivedAt: documents.receivedAt,
        expiresOn: documents.expiresOn,
      })
      .from(documents)
      .where(eq(documents.applicationId, id))
      .orderBy(asc(documents.name)),
  ]);

  const row = appRows[0];
  if (!row) return null;
  const a = row.app;

  const people: RecordParticipant[] = peopleRows.map((p) => ({
    contactId: p.contact.id,
    role: p.role,
    name: [p.contact.firstName, p.contact.lastName].filter(Boolean).join(" ").trim() || "(no name)",
    email: p.contact.email,
    phone: p.contact.phone,
  }));

  const primary = peopleRows[0]?.contact ?? null;

  // A property can match both branches of the OR only once — it is one row —
  // but keep the first of any duplicate id, in case the join ever fans out.
  const seen = new Set<string>();
  const props: RecordProperty[] = [];
  for (const { property: p } of propertyRows) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    props.push({
      id: p.id,
      addressLine1: p.addressLine1,
      city: p.city,
      state: p.state,
      postalCode: p.postalCode,
      propertyType: p.propertyType,
      units: p.units,
      purchasePrice: p.purchasePrice,
      asIsValue: p.asIsValue,
      rehabBudget: p.rehabBudget,
      arv: p.arv,
      arvSource: p.arvSource,
      monthlyRent: p.monthlyRent,
      estimatedPayoff: p.estimatedPayoff,
      lienPosition: p.lienPosition,
    });
  }

  return {
    app: {
      id: a.id,
      stage: a.stage,
      stageEnteredAt: iso(a.stageEnteredAt),
      product: a.product,
      leadSource: a.leadSource,
      channel: a.channel,
      ownerName: a.ownerName,
      requestedAmount: a.requestedAmount,
      downPayment: a.downPayment,
      ltc: a.ltc,
      ltarv: a.ltarv,
      ltv: a.ltv,
      bindingRatio: a.bindingRatio,
      isPortfolio: a.isPortfolio,
      propertyCount: a.propertyCount,
      loanPurpose: a.loanPurpose,
      exitStrategy: a.exitStrategy,
      timeline: a.timeline,
      termSheetIssuedAt: iso(a.termSheetIssuedAt),
      termSheetSignedAt: iso(a.termSheetSignedAt),
      decisionedAt: iso(a.decisionedAt),
      fundedAt: iso(a.fundedAt),
      lostReason: a.lostReason,
      borrowerMessage: a.borrowerMessage,
      notes: a.notes,
      submittedAt: iso(a.submittedAt),
      createdAt: iso(a.createdAt),
      nextActionAt: iso(a.nextActionAt),
      nextActionSetAt: iso(a.nextActionSetAt),
      nextActionNote: a.nextActionNote,
    },
    entity: row.entityName
      ? { name: row.entityName, entityType: row.entityType, formationState: row.entityState }
      : null,
    broker: row.brokerEmail
      ? { name: row.brokerName, email: row.brokerEmail, phone: row.brokerPhone, firmName: row.firmName }
      : null,
    contact: primary
      ? {
          id: primary.id,
          name: [primary.firstName, primary.lastName].filter(Boolean).join(" ").trim() || "(no name)",
          email: primary.email,
          phone: primary.phone,
          phoneRaw: primary.phoneRaw,
          leadSource: primary.leadSource,
          state: primary.state,
          targetMarket: primary.targetMarket,
          creditBand: primary.creditBand,
          ownerName: primary.ownerName,
          notes: primary.notes,
          claimedDeals: primary.claimedDeals,
          verifiedDeals: primary.verifiedDeals,
          emailSubscribed: primary.emailSubscribed,
          smsConsentAt: iso(primary.smsConsentAt),
          smsConsentVersion: primary.smsConsentVersion,
          smsOptedOut: primary.smsOptedOut,
        }
      : null,
    participants: people,
    properties: props,
    activities: activityRows.map((r) => ({
      id: r.id,
      kind: r.kind,
      occurredAt: iso(r.occurredAt) ?? new Date(0).toISOString(),
      source: r.source,
      subject: r.subject,
      body: r.body,
    })),
    totalActivities: Number(activityCount[0]?.n ?? 0),
    transitions: transitionRows.map((r) => ({
      id: r.id,
      fromStage: r.fromStage,
      toStage: r.toStage,
      changedAt: iso(r.changedAt) ?? new Date(0).toISOString(),
      reason: r.reason,
    })),
    totalTransitions: Number(transitionCount[0]?.n ?? 0),
    tasks: taskRows.map((r) => ({
      id: r.id,
      title: r.title,
      dueOn: str(r.dueOn),
      createdAt: iso(r.createdAt) ?? new Date(0).toISOString(),
      completedAt: iso(r.completedAt),
      createdBy: r.createdBy,
    })),
    documents: docRows.map((r) => ({
      id: r.id,
      name: r.name,
      docType: r.docType,
      requestedAt: iso(r.requestedAt),
      receivedAt: iso(r.receivedAt),
      expiresOn: iso(r.expiresOn),
    })),
  };
}
