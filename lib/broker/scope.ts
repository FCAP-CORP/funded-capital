/**
 * Who, at a broker firm, may see and touch which application.
 *
 * This is the first multi-tenant rule in the system. Until now there was one
 * tenant — Funded Capital — and `lib/crm/access.ts` answered the only question
 * that mattered: staff or not. From here, brokerages share one database, and
 * the cost of a mistake changes character entirely: not "someone saw something
 * internal" but "Legacy HML saw a competitor's borrower pipeline". That is
 * commercially fatal to a lender's broker relationships and a GLBA problem on
 * top of it.
 *
 * So the rules live here, pure and fully tested, and nothing queries the
 * database without going through them.
 *
 * DELIBERATELY ORTHOGONAL TO STAFF ACCESS. Luis's access is decided by
 * lib/crm/access.ts and nothing in this file grants it. Two independent gates
 * that cannot be confused for one another: a bug here can never hand someone
 * the whole book, and a bug there can never put a staff member inside a firm.
 */

export type BrokerRole = "owner" | "lead" | "member";
export type BrokerStatus = "active" | "suspended";

export interface BrokerViewer {
  /** Clerk user id of the person asking. */
  userId: string;
  /**
   * Null until Luis assigns them. Brokers sign up for the portal themselves and
   * sit unassigned until he links them to a firm, so this is the normal state
   * of a broker's first day, not an error.
   */
  firmId: string | null;
  role: BrokerRole;
  status: BrokerStatus;
}

/** The only three fields of an application this decision is allowed to read. */
export interface ApplicationOwnership {
  applicationId: string;
  /** Clerk user id of whoever submitted it, when a broker did. */
  submittedByUserId: string | null;
  /** The firm it was submitted under. Null for website and BiggerPockets leads. */
  brokerFirmId: string | null;
}

/** Roles that can see across their whole firm rather than just their own desk. */
const FIRM_WIDE: ReadonlySet<BrokerRole> = new Set<BrokerRole>(["owner", "lead"]);

function usable(v: BrokerViewer | null | undefined): v is BrokerViewer {
  // Fails closed. A viewer with no user id cannot be matched to anything, and
  // the safe reading of a missing id is "no access" rather than "match all".
  // A missing FIRM id is different: it is legitimate, and it costs them only
  // the firm-wide grant below, never their own work.
  if (!v) return false;
  if (!v.userId) return false;
  return v.status === "active";
}

/**
 * Can this person see this application at all?
 *
 * Two independent grounds, and nothing else:
 *
 *  1. THEY SUBMITTED IT. True even when the application has no firm — a broker
 *     who registers today and submits before being assigned to a firm must
 *     still see their own work. Without this they file a deal and it vanishes.
 *
 *  2. IT BELONGS TO THEIR FIRM, and they are an owner or a lead. Note that a
 *     null firm never matches a null firm: a website lead has no brokerFirmId,
 *     and `null === null` would otherwise hand every unassigned lead to every
 *     firm-wide broker in the system. That comparison is guarded explicitly.
 */
export function canViewApplication(
  viewer: BrokerViewer | null | undefined,
  app: ApplicationOwnership,
): boolean {
  if (!usable(viewer)) return false;

  if (app.submittedByUserId && app.submittedByUserId === viewer.userId) return true;

  if (!FIRM_WIDE.has(viewer.role)) return false;
  // Both null guards are load-bearing — see the note above. An owner who has
  // not been assigned a firm matches no firm at all, rather than matching every
  // application that also has no firm.
  if (!viewer.firmId || !app.brokerFirmId) return false;
  return app.brokerFirmId === viewer.firmId;
}

/**
 * Can this person add notes, upload documents, respond to conditions?
 *
 * Currently identical to viewing, because a firm owner who can see a deal was
 * asked to be able to work it. Kept as its own function anyway: the day acting
 * needs to be narrower than seeing, that is an edit here rather than an audit
 * of every call site.
 */
export function canActOnApplication(
  viewer: BrokerViewer | null | undefined,
  app: ApplicationOwnership,
): boolean {
  return canViewApplication(viewer, app);
}

/**
 * How to filter a query for this viewer, decided before any SQL is written.
 *
 * Returning a description rather than a WHERE clause keeps this module free of
 * the database and testable, and means the caller cannot accidentally widen the
 * scope by forgetting a condition — there is exactly one shape per case.
 */
export type QueryScope =
  | { kind: "nothing" }
  | { kind: "own"; userId: string }
  | { kind: "firm-or-own"; firmId: string; userId: string };

export function queryScope(viewer: BrokerViewer | null | undefined): QueryScope {
  if (!usable(viewer)) return { kind: "nothing" };
  if (FIRM_WIDE.has(viewer.role) && viewer.firmId) {
    return { kind: "firm-or-own", firmId: viewer.firmId, userId: viewer.userId };
  }
  // Includes an owner with no firm yet: they fall back to their own desk until
  // they are assigned, rather than to nothing or to everything.
  return { kind: "own", userId: viewer.userId };
}

/**
 * Filter a list in memory using the same rules the query uses.
 *
 * A second line of defence, not a substitute for scoping the query: if a future
 * query is ever written too broadly, this still refuses to render another
 * firm's rows. Cheap at this size and the failure it prevents is expensive.
 */
export function visibleApplications<T extends ApplicationOwnership>(
  viewer: BrokerViewer | null | undefined,
  apps: T[],
): T[] {
  if (!usable(viewer)) return [];
  return apps.filter((a) => canViewApplication(viewer, a));
}
