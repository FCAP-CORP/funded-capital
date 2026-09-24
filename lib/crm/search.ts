/**
 * The ⌘K search: what a query means, and what comes back.
 *
 * Pure — no database, no React — and covered by lib/crm/search.regress.ts.
 * The SQL lives in ./searchSql.ts and the only thing that runs it is the
 * staff-only route app/api/crm/search/route.ts.
 */

/** Fewer characters than this and nothing is searched (and nothing is sent). */
export const SEARCH_MIN = 2;
/** Longer than this is not a search, it is a paste. */
export const SEARCH_MAX_LENGTH = 80;
/** The most results one search ever returns, deals and contacts together. */
export const SEARCH_LIMIT = 20;
/** Up to this many of those are kept for people with no deal on screen. */
export const CONTACT_SLOTS = 8;

export type ParsedQuery =
  | { ok: false }
  | {
      ok: true;
      text: string;
      /** For ILIKE: `%text%` with the text's own % _ \ escaped. */
      pattern: string;
      /** The digits typed, when there are enough of them to be a phone search. */
      digits: string;
      /** For LIKE against a phone with its formatting stripped, or '' when not a phone search. */
      digitsPattern: string;
    };

/**
 * `%` and `_` are wildcards in LIKE, and `\` is the escape character. Someone
 * searching for "100%" or "a_b" means those characters literally. Escaping them
 * is not a security measure — the value is always a bound parameter, never
 * spliced into the SQL — it is about returning what was actually asked for.
 */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => "\\" + c);
}

export function parseSearchQuery(raw: unknown): ParsedQuery {
  if (typeof raw !== "string") return { ok: false };
  // Collapse whitespace and drop control characters; a NUL byte would make
  // Postgres reject the parameter outright.
  const text = raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (text.length < SEARCH_MIN || text.length > SEARCH_MAX_LENGTH) return { ok: false };
  const digits = text.replace(/\D/g, "");
  // A phone search needs a few digits AND to look like a number rather than an
  // address ("123 Main St" has digits but is not a phone number).
  const phoneLike = digits.length >= 3 && /^[\d\s()+.\-]+$/.test(text);
  return {
    ok: true,
    text,
    pattern: `%${escapeLike(text)}%`,
    digits: phoneLike ? digits : "",
    digitsPattern: phoneLike ? `%${digits}%` : "",
  };
}

/* ------------------------------------------------------------ results */

export type DealResult = {
  kind: "deal";
  applicationId: string;
  contactId: string | null;
  name: string;
  /** Email, else phone — the second line under the name. */
  contact: string | null;
  address: string | null;
  stage: string;
  requestedAmount: string | null;
};

export type ContactResult = {
  kind: "contact";
  contactId: string;
  name: string;
  contact: string | null;
  deals: number;
  /** What to put in the Contacts page's search box to find exactly this person. */
  lookup: string;
};

export type SearchResult = DealResult | ContactResult;

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (v === null || v === undefined || v === "" ? null : String(v));
const nameOf = (r: Row, fallback: string) =>
  [str(r.first_name), str(r.last_name)].filter(Boolean).join(" ").trim() || fallback;

export function toDealResult(r: Row): DealResult {
  const address = [str(r.address_line1), [str(r.city), str(r.state)].filter(Boolean).join(", ")]
    .filter((s) => s && s.length > 0)
    .join(", ");
  return {
    kind: "deal",
    applicationId: String(r.application_id),
    contactId: str(r.contact_id),
    name: nameOf(r, "(unlinked)"),
    contact: str(r.email) ?? str(r.phone),
    address: address || null,
    stage: String(r.stage ?? ""),
    requestedAmount: str(r.requested_amount),
  };
}

export function toContactResult(r: Row): ContactResult {
  const email = str(r.email);
  const phone = str(r.phone) ?? str(r.phone_raw);
  const name = nameOf(r, "(no name)");
  return {
    kind: "contact",
    contactId: String(r.contact_id),
    name,
    contact: email ?? phone,
    deals: Number(r.deals ?? 0) || 0,
    // Email is unique per contact, so it finds exactly one row on the Contacts
    // page; the name is a fallback for someone with no email.
    lookup: email ?? phone ?? name,
  };
}

/**
 * One list, never longer than `limit`.
 *
 * Deals first — a deal opens the full record card — then people, minus anyone
 * already shown as the borrower on one of those deals (the same person twice
 * in a list of twenty is noise). Up to CONTACT_SLOTS places are kept for people
 * even when twenty deals match, so a search for a common surname still shows
 * the prospect with no deal yet; when fewer people match, deals take the room.
 */
export function mergeResults(dealRows: Row[], contactRows: Row[], limit = SEARCH_LIMIT): SearchResult[] {
  const cap = Math.max(0, Math.min(limit, SEARCH_LIMIT));
  const deals = dealRows.map(toDealResult);
  const onDeals = new Set(deals.map((d) => d.contactId).filter(Boolean));
  const seen = new Set<string>();
  const people: ContactResult[] = [];
  for (const r of contactRows) {
    const c = toContactResult(r);
    if (onDeals.has(c.contactId) || seen.has(c.contactId)) continue;
    seen.add(c.contactId);
    people.push(c);
  }
  const peopleShown = people.slice(0, Math.max(cap - deals.length, Math.min(CONTACT_SLOTS, people.length, cap)));
  const dealsShown = deals.slice(0, cap - peopleShown.length);
  return [...dealsShown, ...peopleShown];
}
