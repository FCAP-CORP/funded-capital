/**
 * What counts as having contacted someone.
 *
 * This is the judgement the CRM got wrong by omission, and the cost was
 * concrete: on 2026-09-16 the pipeline showed twenty BiggerPockets leads as
 * untouched. Nineteen had been worked — one four times, one was mid-negotiation
 * with terms outstanding, one had already been declined. Only Gmail knew.
 *
 * The trap is that a mailbox is full of messages ABOUT a borrower that are not
 * messages TO a borrower. The BiggerPockets alert announcing a new lead is
 * addressed to Luis, not to the investor; counting it would mark every lead as
 * contacted the instant it arrived, which is precisely the false clean bill of
 * health that caused the problem in the first place. So this module decides two
 * things and nothing else: is this message real correspondence, and with whom.
 *
 * Pure — no Gmail, no database — so every rule below is covered by
 * lib/crm/activity.regress.ts.
 */

export type EmailDirection = "email_in" | "email_out";

export interface RawMessage {
  /** Gmail's immutable message id. The dedup key, never a hash of the body. */
  messageId: string;
  threadId?: string | null;
  /** Raw header values; display names and angle brackets are fine. */
  from: string;
  to?: string | null;
  cc?: string | null;
  subject?: string | null;
  /** Epoch milliseconds. */
  dateMs: number;

  /**
   * The headers that settle it.
   *
   * Real correspondence does not carry List-Unsubscribe or `Precedence: bulk`.
   * Marketing does, and it is the only reliable signal — checked against the
   * live mailbox, three bulk senders slipped every name-shaped rule here
   * (Enrollment@wgu.edu, updates-noreply@linkedin.com and a Costa Rican bank's
   * billing address), and no amount of guessing at local parts would have
   * caught the first or the third.
   */
  listUnsubscribe?: string | null;
  precedence?: string | null;
}

export interface ClassifiedMessage {
  messageId: string;
  threadId: string | null;
  direction: EmailDirection;
  /** Lowercased addresses of everyone on the message who is not us. */
  counterparties: string[];
  subject: string | null;
  occurredAt: Date;
}

export type Rejection = { rejected: true; reason: string };
export type Classification = ClassifiedMessage | Rejection;

export function isRejected(c: Classification): c is Rejection {
  return (c as Rejection).rejected === true;
}

/* ------------------------------------------------------------- addressing */

/** Pull the address out of `Luis Fajardo <luis@x.com>`, `<a@b.com>` or `a@b.com`. */
export function parseAddress(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const angled = /<([^>]+)>/.exec(raw);
  const candidate = (angled ? angled[1] : raw).trim().toLowerCase();
  // One @, something either side, and a dot in the domain. Deliberately strict:
  // a malformed address that slips through becomes a phantom contact match.
  if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(candidate)) return null;
  return candidate;
}

/** Split a header that may hold several comma-separated addresses. */
export function parseAddressList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const out: string[] = [];
  // Split on commas that are not inside quotes — display names contain commas
  // ("Fajardo, Luis" <luis@x.com>) and splitting naively loses the address.
  let depth = 0, current = "";
  for (const ch of raw) {
    if (ch === '"') depth = depth ? 0 : 1;
    if (ch === "," && !depth) { out.push(current); current = ""; continue; }
    current += ch;
  }
  out.push(current);

  const seen = new Set<string>();
  const addrs: string[] = [];
  for (const piece of out) {
    const a = parseAddress(piece);
    if (a && !seen.has(a)) { seen.add(a); addrs.push(a); }
  }
  return addrs;
}

/* -------------------------------------------------------- machine senders */

/**
 * Addresses that are systems talking, not people corresponding.
 *
 * `alerts@t.biggerpockets.com` is the important one and the reason this list
 * exists: that message announces a lead, it is not contact with the lead.
 */
const MACHINE_LOCAL = [
  "no-reply", "noreply", "donotreply", "do-not-reply", "mailer-daemon",
  "postmaster", "bounce", "bounces", "notification", "notifications",
  "alerts", "alert", "automated", "auto-confirm",
];

const MACHINE_DOMAIN = [
  "t.biggerpockets.com",
  "mail.anthropic.com",
  "email-marriott.com",
  "convertkit.com",
  "beehiiv.com",
  "sendgrid.net",
  "mailchimp.com",
  "klaviyomail.com",
  "google.com",           // calendar invitations and Drive notices
  "calendar-notification.google.com",
  "docs.google.com",
];

/**
 * Tokens of a local part, including adjacent pairs rejoined.
 *
 * `updates-noreply` must match "noreply" while `alertson` must NOT match
 * "alerts". Splitting on separators gives the first; rejoining neighbours
 * recovers `no-reply` -> "noreply". A plain substring test fails both ways.
 */
function localTokens(local: string): string[] {
  const parts = local.split(/[^a-z0-9]+/i).filter(Boolean);
  const tokens = [local, ...parts];
  for (let i = 0; i < parts.length - 1; i++) tokens.push(parts[i] + parts[i + 1]);
  return tokens;
}

export function isMachineAddress(addr: string | null): boolean {
  if (!addr) return true;
  const [local, domain] = addr.split("@");
  if (!local || !domain) return true;
  if (MACHINE_DOMAIN.some((d) => domain === d || domain.endsWith("." + d))) return true;
  const tokens = localTokens(local);
  return MACHINE_LOCAL.some((m) => tokens.includes(m));
}

/**
 * Bulk mail, by its own admission.
 *
 * RFC 2369's List-Unsubscribe and `Precedence: bulk` are what every mailing
 * platform sets and no person's mail client sets. This catches the marketing
 * that looks hand-addressed.
 */
export function isBulkMail(msg: RawMessage): boolean {
  if (msg.listUnsubscribe && msg.listUnsubscribe.trim() !== "") return true;
  const p = msg.precedence?.trim().toLowerCase();
  return p === "bulk" || p === "list" || p === "junk" || p === "auto_reply";
}

/**
 * Subjects that are the calendar or the tooling talking through a human
 * address. These reach both parties and would otherwise read as outreach.
 */
const MACHINE_SUBJECT = [
  /^appointment booked:/i,
  /^invitation:/i,
  /^updated invitation:/i,
  /^cancelled event:/i,
  /^canceled event:/i,
  /^accepted:/i,
  /^declined:/i,
  /^automatic reply:/i,
  /^out of office/i,
  /^🔔 bp lead:/i,
  /— routine completed$/i,
  /^new lead from biggerpockets/i,
];

export function isMachineSubject(subject: string | null | undefined): boolean {
  if (!subject) return false;
  return MACHINE_SUBJECT.some((re) => re.test(subject.trim()));
}

/* ------------------------------------------------------------- the ruling */

export interface ClassifyOptions {
  /**
   * Every address that is US — the shared mailboxes included. A message whose
   * only counterparty is one of these is internal, not contact.
   */
  selfAddresses: string[];
}

export function classifyMessage(msg: RawMessage, opts: ClassifyOptions): Classification {
  const reject = (reason: string): Rejection => ({ rejected: true, reason });

  if (!msg.messageId) return reject("no message id");
  if (!Number.isFinite(msg.dateMs)) return reject("no usable date");

  const self = new Set(
    opts.selfAddresses.map((a) => parseAddress(a)).filter((a): a is string => a !== null),
  );
  if (self.size === 0) return reject("no self addresses configured");

  const from = parseAddress(msg.from);
  if (!from) return reject("unparseable sender");

  const recipients = [...parseAddressList(msg.to), ...parseAddressList(msg.cc)];
  const outbound = self.has(from);

  // A machine sent it. The BiggerPockets lead alert lands here, which is the
  // whole point — it is news about a borrower, not a word said to one.
  if (!outbound && isMachineAddress(from)) return reject(`automated sender: ${from}`);
  if (!outbound && isBulkMail(msg)) return reject("bulk mail (List-Unsubscribe or Precedence)");
  if (isMachineSubject(msg.subject)) return reject("calendar or tooling notification");

  const counterparties = outbound
    ? recipients.filter((a) => !self.has(a) && !isMachineAddress(a))
    : [from];

  if (counterparties.length === 0) {
    return reject(outbound ? "no external recipient" : "sender is us");
  }

  return {
    messageId: msg.messageId,
    threadId: msg.threadId ?? null,
    direction: outbound ? "email_out" : "email_in",
    counterparties,
    subject: msg.subject?.trim() || null,
    occurredAt: new Date(msg.dateMs),
  };
}

/**
 * The dedup key for an activity row.
 *
 * Gmail's message id, namespaced. The sync is at-least-once by design — a
 * re-run must be free — and `activities.dedup_key` is uniquely indexed, so a
 * repeat insert collides instead of duplicating. Never hash the body: the same
 * message re-fetched must produce the same key.
 */
export function gmailDedupKey(messageId: string, counterparty: string): string {
  return `gmail:${messageId}:${counterparty}`;
}

/** Newest contact time per address, for the "Last contact" column. */
export function latestByCounterparty(
  messages: ClassifiedMessage[],
): Map<string, { at: Date; direction: EmailDirection; subject: string | null }> {
  const out = new Map<string, { at: Date; direction: EmailDirection; subject: string | null }>();
  for (const m of messages) {
    for (const c of m.counterparties) {
      const prev = out.get(c);
      if (!prev || m.occurredAt > prev.at) {
        out.set(c, { at: m.occurredAt, direction: m.direction, subject: m.subject });
      }
    }
  }
  return out;
}

/* ---------------------------------------------------------- write planning */

export interface PlannedActivity {
  contactId: string;
  kind: EmailDirection;
  occurredAt: Date;
  subject: string | null;
  dedupKey: string;
  metadata: { messageId: string; threadId: string | null; counterparty: string };
}

/**
 * Turn classified messages into the rows to insert.
 *
 * Pure, and separated from the route on purpose: this is where a mistake is
 * expensive and invisible. Three rules it enforces —
 *
 *  1. NO CONTACT MATCH, NO ROW. This is the real privacy boundary, not the
 *     machine-sender filter. The sync reads a whole mailbox, and the only
 *     things it may record are exchanges with people already in the CRM.
 *     Personal mail, vendors, newsletters and strangers produce nothing.
 *
 *  2. NO MESSAGE BODIES. Subject, direction and timestamp answer "have we
 *     spoken, and when" — which is the entire question. Bodies would turn the
 *     CRM into a second copy of the mailbox and widen the GLBA surface for no
 *     gain, the same reason documents stay in Drive.
 *
 *  3. `applicationId` stays null. A contact with three deals gives no honest
 *     way to attribute an email to one of them, and a wrong attribution is
 *     worse than none — the timeline joins through the contact instead.
 */
export function planActivityRows(
  messages: ClassifiedMessage[],
  contactIdByEmail: Map<string, string>,
): { rows: PlannedActivity[]; unmatched: string[] } {
  const rows: PlannedActivity[] = [];
  const unmatched = new Set<string>();
  const seen = new Set<string>();

  for (const m of messages) {
    for (const counterparty of m.counterparties) {
      const contactId = contactIdByEmail.get(counterparty.toLowerCase());
      if (!contactId) { unmatched.add(counterparty); continue; }

      const dedupKey = gmailDedupKey(m.messageId, counterparty);
      // A batch can legitimately contain the same message twice (two Gmail
      // queries overlapping). Postgres would reject the second on the unique
      // index and take the whole statement down with it.
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      rows.push({
        contactId,
        kind: m.direction,
        occurredAt: m.occurredAt,
        subject: m.subject,
        dedupKey,
        metadata: { messageId: m.messageId, threadId: m.threadId, counterparty },
      });
    }
  }

  return { rows, unmatched: [...unmatched] };
}
