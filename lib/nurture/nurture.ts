/**
 * Lead nurturing — who gets which Klaviyo programme, and when it stops.
 *
 * PURE. No database, no network, no clock except the `now` passed in. Every
 * decision the Nurture page, the enrol action and the sync cron make is a
 * function in this file, pinned by nurture.regress.ts.
 *
 * THE DIVISION OF LABOUR
 *
 *   Lending OS decides WHO: which people qualify, who gets added, and who must
 *   stop hearing from us (they wrote back, a deal started, they unsubscribed).
 *   Klaviyo decides WHAT and WHEN: each programme is a Klaviyo list, and a flow
 *   triggered by "added to list" sends the emails. Klaviyo adds the unsubscribe
 *   link and our postal address to every one (CAN-SPAM), which is why bulk
 *   email goes through Klaviyo and never through Luis's Gmail.
 *
 *   Stopping = removing the person from the list. Each flow carries the filter
 *   "is in list <this list>", so removal takes them out of the flow before the
 *   next email.
 *
 * ONE PERSON, ONE PROGRAMME. A person qualifies for at most one programme at a
 * time, picked by PRIORITY below. Four emails from four programmes in one week
 * is how a lender ends up in the spam folder.
 *
 * NOBODY IN A CONVERSATION GETS MARKETING. Anyone emailed, texted or called —
 * either direction — in the last QUIET_DAYS is left alone, and so is anyone
 * whose deal is being worked (term sheet out through closing).
 *
 * CONSENT FLOWS INBOUND ONLY. Nothing here can make someone emailable who was
 * not. `emailSubscribed === false` (a Klaviyo unsubscribe mirrored in) is a
 * hard stop, and the Klaviyo payload built below never carries a subscription
 * field — adding a profile to a list does not change their consent.
 */

import { PRODUCT_LABEL, SOURCE_LABEL } from "@/lib/crm/view";

/* ----------------------------------------------------------- programmes */

export type ProgramKey = "past_borrower" | "bp_no_term_sheet" | "quiet" | "lost" | "contacts";

export type Program = {
  key: ProgramKey;
  /** What Luis sees on the page. */
  name: string;
  /** One sentence: who is in it. */
  who: string;
  /** One sentence: what they get from Klaviyo. */
  what: string;
  /** The Klaviyo list Lending OS adds people to and removes them from. Not a secret. */
  klaviyoListId: string;
  klaviyoListName: string;
  /**
   * Whether the Ready list starts ticked. False for the old spreadsheet
   * contacts: Luis said that pool is a mix, so every person is a deliberate tick.
   */
  preselect: boolean;
};

export const QUIET_DAYS = 30;
export const LOST_MIN_DAYS = 90;
export const PAST_BORROWER_MIN_DAYS = 180;

/**
 * Checked in this order; the first that fits wins.
 *
 *   past_borrower first — the warmest relationship, and the copy is different
 *                         ("your next deal"), not "are you still looking".
 *   bp_no_term_sheet    — before quiet, so BiggerPockets spend is measured on
 *                         its own line.
 *   quiet               — an open enquiry nobody is working.
 *   lost                — only when nothing else fits.
 *   contacts            — people with NO deal at all: the ~600 from the old
 *                         spreadsheet (added 26 Sep 2026). Luis called that
 *                         pool "a mix", so nobody here is pre-ticked.
 *
 * The list ids were created in Funded Capital's Klaviyo account on 26 Sep 2026
 * for Lending OS alone. Nobody should add people to them by hand: Lending OS
 * treats the list as its own, and a person it did not add is invisible to it.
 */
export const PROGRAMS: readonly Program[] = [
  {
    key: "past_borrower",
    name: "Past borrowers",
    who: `Funded with us ${PAST_BORROWER_MIN_DAYS / 30}+ months ago, nothing in progress now.`,
    what: "A check-in about their next project, then a note every month or so.",
    klaviyoListId: "WwZmFn",
    klaviyoListName: "Lending OS · Past borrowers",
    preselect: true,
  },
  {
    key: "bp_no_term_sheet",
    name: "BiggerPockets, no term sheet",
    who: `Came from BiggerPockets, never got a term sheet, quiet ${QUIET_DAYS}+ days.`,
    what: "A short series on how our loans work, then a note every month or so.",
    klaviyoListId: "VYBzq9",
    klaviyoListName: "Lending OS · BiggerPockets, no term sheet",
    preselect: true,
  },
  {
    key: "quiet",
    name: "Quiet leads",
    who: `Asked about a loan, nothing in progress, nobody in touch for ${QUIET_DAYS}+ days.`,
    what: "A short series picking the conversation back up, then a note every month or so.",
    klaviyoListId: "Yq4vxf",
    klaviyoListName: "Lending OS · Quiet leads",
    preselect: true,
  },
  {
    key: "lost",
    name: "Lost deals",
    who: `Marked Closed – Lost ${LOST_MIN_DAYS}+ days ago (not duplicates or not-a-fit).`,
    what: "A light touch — what's changed since, and an open door — then a note every few months.",
    klaviyoListId: "SW9AEq",
    klaviyoListName: "Lending OS · Lost deals",
    preselect: true,
  },
  {
    key: "contacts",
    name: "Investor contacts",
    who: `In your contacts but never sent us a deal; nobody in touch for ${QUIET_DAYS}+ days.`,
    what: "A short introduction to how we lend, then a note every month or so.",
    klaviyoListId: "S2b2zL",
    klaviyoListName: "Lending OS · Investor contacts",
    preselect: false,
  },
];

export const PROGRAM_KEYS = PROGRAMS.map((p) => p.key);

export function programByKey(key: unknown): Program | null {
  return PROGRAMS.find((p) => p.key === key) ?? null;
}

/* ---------------------------------------------------------------- stages */

/** Being worked right now. Marketing email would talk over Luis. */
export const IN_PROGRESS_STAGES = [
  "term_sheet_issued", "term_sheet_signed", "application_in", "underwriting",
  "conditional_approval", "conditions_clearing", "clear_to_close", "docs_out",
] as const;

/** An enquiry that has not become anything yet. */
export const EARLY_STAGES = ["lead", "qualified"] as const;

/** A loan exists (or existed). */
export const FUNDED_STAGES = ["funded", "active", "draw_cycle", "extension", "payoff"] as const;

const has = (list: readonly string[], v: string) => list.includes(v);

/**
 * Lost reasons that mean "never email them marketing about this deal".
 * Matched on the choice before the " — note" (lib/crm/board.ts parseLostReason),
 * case-insensitive, so legacy free text like "spam - bot" matches too.
 */
const EXCLUDED_LOST = [/^duplicate/i, /^not our product/i, /spam/i, /^test\b/i, /homebuyer|primary residence|owner.occupied/i];

export function lostReasonExcluded(reason: string | null | undefined): boolean {
  const r = (reason ?? "").trim();
  return EXCLUDED_LOST.some((re) => re.test(r));
}

/* ------------------------------------------------------------------ input */

export type NurtureApp = {
  id: string;
  stage: string;
  leadSource: string;
  product: string;
  /** submitted_at, else the legacy sheet's date, else created_at (see nurture.server.ts). */
  arrivedAt: string | null;
  /** First move into term_sheet_issued, else the legacy column. */
  firstTermSheetAt: string | null;
  fundedAt: string | null;
  /** Last move into closed_lost, else stage_entered_at. Only set when stage is closed_lost. */
  lostAt: string | null;
  lostReason: string | null;
};

export type NurtureContact = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  emailSubscribed: boolean | null;
  leadSource: string;
  state: string | null;
  /** Every role this person holds on any application. */
  roles: string[];
  apps: NurtureApp[];
  /** Latest email, text or call in EITHER direction. */
  lastTouchAt: string | null;
  /** Programmes this person has ever been enrolled in (active or stopped). */
  priorPrograms: string[];
  /** The programme they are in right now, if any. */
  activeProgram: string | null;
  /** Luis stopped a nurture for this person before. Never offered again automatically. */
  staffStopped: boolean;
  /** When the contact was first recorded (the old sheet's "Date Added" for legacy rows). */
  addedAt: string | null;
  tags: string[];
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Our own people are not leads, whatever the data says. */
const INTERNAL_DOMAINS = ["fundedcapital.com"];

const DAY = 86_400_000;
const ms = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const v = Date.parse(iso);
  return Number.isNaN(v) ? null : v;
};
const daysSince = (iso: string | null | undefined, now: Date): number | null => {
  const v = ms(iso);
  return v === null ? null : Math.floor((now.getTime() - v) / DAY);
};

export function cleanEmail(email: string | null | undefined): string | null {
  const e = typeof email === "string" ? email.trim().toLowerCase() : "";
  return EMAIL.test(e) ? e : null;
}

/* ---------------------------------------------------------- classification */

export type Exclusion =
  | "no_email"
  | "unsubscribed"
  | "internal"
  | "broker"
  | "no_deal"
  | "not_a_fit"
  | "in_progress"
  | "recent_borrower"
  | "recently_lost"
  | "recent_contact"
  | "enrolled"
  | "stopped_before"
  | "already_done"
  | "no_program";

export const EXCLUSION_LABEL: Record<Exclusion, string> = {
  no_email: "No usable email address",
  unsubscribed: "Unsubscribed",
  internal: "Funded Capital address",
  broker: "Broker, not a borrower",
  no_deal: "No enquiry on file", // no longer produced since the contacts programme (26 Sep 2026); kept so old counts still label
  not_a_fit: "Not a fit (not our product, duplicate or spam)",
  in_progress: "Deal in progress",
  recent_borrower: `Funded in the last ${PAST_BORROWER_MIN_DAYS / 30} months`,
  recently_lost: `Lost in the last ${LOST_MIN_DAYS} days`,
  recent_contact: `In touch in the last ${QUIET_DAYS} days`,
  enrolled: "Already in a programme",
  stopped_before: "You stopped their nurture before",
  already_done: "Already went through this programme",
  no_program: "Doesn't fit a programme",
};

export type Classification =
  | { program: ProgramKey; exclusion: null }
  | { program: null; exclusion: Exclusion };

const out = (exclusion: Exclusion): Classification => ({ program: null, exclusion });
const into = (program: ProgramKey): Classification => ({ program, exclusion: null });

/**
 * Which programme this person belongs in today, or why none.
 *
 * The order of the checks is the order of the reasons a person would give for
 * not wanting the email: can't be reached, asked us not to, isn't a lead, is
 * mid-deal, heard from us recently, is already hearing from us.
 */
export function classify(c: NurtureContact, now: Date): Classification {
  const email = cleanEmail(c.email);
  if (!email) return out("no_email");
  if (c.emailSubscribed === false) return out("unsubscribed");
  if (INTERNAL_DOMAINS.some((d) => email.endsWith(`@${d}`))) return out("internal");
  if (c.roles.length > 0 && c.roles.every((r) => r === "broker")) return out("broker");
  if (c.apps.length === 0) return classifyNoDeal(c, now);

  // Deals that say nothing about this person as a future borrower.
  const apps = c.apps.filter(
    (a) => a.product !== "not_our_product" && !(a.stage === "closed_lost" && lostReasonExcluded(a.lostReason)),
  );
  if (apps.length === 0) return out("not_a_fit");

  if (apps.some((a) => has(IN_PROGRESS_STAGES, a.stage))) return out("in_progress");

  const funded = apps.filter((a) => has(FUNDED_STAGES, a.stage) || ms(a.fundedAt) !== null);
  // A loan with no date: fall back to when the enquiry arrived. Unknown = recent (safe side).
  const fundedAge = (a: NurtureApp) => daysSince(a.fundedAt, now) ?? daysSince(a.arrivedAt, now) ?? 0;
  if (funded.some((a) => fundedAge(a) < PAST_BORROWER_MIN_DAYS)) return out("recent_borrower");

  // Quiet: no conversation either way, and no enquiry arrived, in QUIET_DAYS.
  // An arrival with no date at all counts as recent — the safe side.
  const touch = daysSince(c.lastTouchAt, now);
  if (touch !== null && touch < QUIET_DAYS) return out("recent_contact");
  if (apps.some((a) => (daysSince(a.arrivedAt, now) ?? 0) < QUIET_DAYS)) return out("recent_contact");

  if (c.activeProgram) return out("enrolled");
  if (c.staffStopped) return out("stopped_before");

  const pick = pickProgram(c, apps, now);
  if (!pick.program) return pick;
  if (c.priorPrograms.includes(pick.program)) return out("already_done");
  return pick;
}

/**
 * Someone with no deal on file — mostly the old spreadsheet's contacts. They
 * get the same quiet rule (nobody in touch either way for QUIET_DAYS, and not
 * added in that window), and only ever the "contacts" programme. A contact
 * marked as a broker is left out, as a broker participant would be.
 */
function classifyNoDeal(c: NurtureContact, now: Date): Classification {
  if (c.leadSource === "broker") return out("broker");
  const touch = daysSince(c.lastTouchAt, now);
  if (touch !== null && touch < QUIET_DAYS) return out("recent_contact");
  if ((daysSince(c.addedAt, now) ?? 0) < QUIET_DAYS) return out("recent_contact");
  if (c.activeProgram) return out("enrolled");
  if (c.staffStopped) return out("stopped_before");
  if (c.priorPrograms.includes("contacts")) return out("already_done");
  return into("contacts");
}

function pickProgram(c: NurtureContact, apps: NurtureApp[], now: Date): Classification {
  const funded = apps.filter((a) => has(FUNDED_STAGES, a.stage) || ms(a.fundedAt) !== null);
  if (funded.length > 0) return into("past_borrower");

  const everTermSheet = apps.some((a) => ms(a.firstTermSheetAt) !== null);
  const fromBp = c.leadSource === "biggerpockets" || apps.some((a) => a.leadSource === "biggerpockets");
  const early = apps.some((a) => has(EARLY_STAGES, a.stage));
  const lost = apps.filter((a) => a.stage === "closed_lost");

  if (fromBp && !everTermSheet && (early || lost.length > 0)) {
    // A BiggerPockets lead lost recently is still "recently lost" — give it the same rest.
    if (!early && lost.some((a) => (daysSince(a.lostAt ?? a.arrivedAt, now) ?? 0) < LOST_MIN_DAYS)) return out("recently_lost");
    return into("bp_no_term_sheet");
  }
  if (early) return into("quiet");
  if (lost.length > 0) {
    if (lost.some((a) => (daysSince(a.lostAt ?? a.arrivedAt, now) ?? 0) < LOST_MIN_DAYS)) return out("recently_lost");
    return into("lost");
  }
  return out("no_program");
}

/* ------------------------------------------------------------- auto-stop */

export type StopReason =
  | "replied"
  | "contacted"
  | "new_deal"
  | "deal_moved"
  | "unsubscribed"
  | "bounced"
  | "no_email"
  | "removed_in_klaviyo"
  | "stopped_by_staff";

export const STOP_LABEL: Record<StopReason, string> = {
  replied: "They wrote back",
  contacted: "You got in touch yourself",
  new_deal: "New enquiry came in",
  deal_moved: "Their deal moved forward",
  unsubscribed: "Unsubscribed",
  bounced: "Email bounced",
  no_email: "Email address removed",
  removed_in_klaviyo: "Removed from the list in Klaviyo",
  stopped_by_staff: "You stopped it",
};

/** The stops that count as the programme WORKING — shown as results on the page. */
export const WIN_REASONS: readonly StopReason[] = ["replied", "new_deal", "deal_moved"];

export type StopSignals = {
  enrolledAt: string;
  email: string | null;
  emailSubscribed: boolean | null;
  /** Latest email_in / sms_in. */
  lastInboundAt: string | null;
  /** Latest email_out / sms_out / call — Luis reaching out himself. */
  lastOutboundAt: string | null;
  /** Latest arrival of any application for this person. */
  lastArrivalAt: string | null;
  /** Latest stage move INTO anything other than closed_lost. Marking a deal lost is not a reason to stop. */
  lastForwardMoveAt: string | null;
};

/**
 * Should this enrolment stop, and why. Checked every sync run against a fresh
 * read. The order puts consent first (it is a legal line, not a preference),
 * then the wins, then Luis reaching out himself.
 */
export function stopReason(s: StopSignals): StopReason | null {
  if (s.emailSubscribed === false) return "unsubscribed";
  if (!cleanEmail(s.email)) return "no_email";
  const since = ms(s.enrolledAt);
  if (since === null) return null;
  const after = (iso: string | null) => {
    const v = ms(iso);
    return v !== null && v > since;
  };
  if (after(s.lastInboundAt)) return "replied";
  if (after(s.lastArrivalAt)) return "new_deal";
  if (after(s.lastForwardMoveAt)) return "deal_moved";
  if (after(s.lastOutboundAt)) return "contacted";
  return null;
}

/* ------------------------------------------------------ Klaviyo, inbound */

export type KlaviyoEmailMarketing = {
  can_receive_email_marketing?: boolean | null;
  consent?: string | null;
  suppression?: { reason?: string | null }[] | null;
  list_suppressions?: { list_id?: string | null; reason?: string | null }[] | null;
} | null | undefined;

export type KlaviyoVerdict =
  /** Fine — keep going. */
  | "ok"
  /** Unsubscribed from ALL marketing, or marked spam: mirror into Lending OS. */
  | "unsubscribed"
  /** Unsubscribed from this one list only: stop, but do not touch their global status. */
  | "list_unsubscribed"
  /** Bounced or invalid: stop. Not a consent decision, so nothing is mirrored. */
  | "bounced";

const WITHDRAWN = new Set(["UNSUBSCRIBE", "UNSUBSCRIBED", "SPAM_COMPLAINT", "USER_SUPPRESSED"]);
const UNDELIVERABLE = new Set(["HARD_BOUNCE", "INVALID_EMAIL"]);

/**
 * What Klaviyo says about a profile we enrolled.
 *
 * `can_receive_email_marketing: false` with no reason we recognise is treated
 * as unsubscribed — when Klaviyo will not email someone and we cannot tell why,
 * the safe reading is that they asked it not to.
 */
export function klaviyoVerdict(m: KlaviyoEmailMarketing, listId: string): KlaviyoVerdict {
  if (!m) return "ok";
  const reasons = (m.suppression ?? []).map((s) => String(s?.reason ?? "").toUpperCase());
  if (String(m.consent ?? "").toUpperCase() === "UNSUBSCRIBED") return "unsubscribed";
  if (reasons.some((r) => WITHDRAWN.has(r))) return "unsubscribed";
  if (reasons.some((r) => UNDELIVERABLE.has(r))) return "bounced";
  if ((m.list_suppressions ?? []).some((s) => s?.list_id === listId)) return "list_unsubscribed";
  if (m.can_receive_email_marketing === false) return reasons.length > 0 ? "bounced" : "unsubscribed";
  return "ok";
}

/* ----------------------------------------------------- Klaviyo, outbound */

/** Readable loan type for email personalisation ("your fix and flip"). */
const LOAN_WORDS: Record<string, string> = {
  fix_and_flip: "fix and flip",
  ground_up: "ground-up construction",
  dscr: "DSCR rental",
  bridge: "bridge",
  multifamily: "multifamily",
};

/** The most recent enquiry's loan type, in words an email can use, or null. */
export function loanWords(apps: NurtureApp[]): string | null {
  const sorted = [...apps].sort((a, b) => (ms(b.arrivedAt) ?? 0) - (ms(a.arrivedAt) ?? 0));
  for (const a of sorted) {
    const w = LOAN_WORDS[a.product];
    if (w) return w;
  }
  return null;
}

export type ProfilePayload = {
  data: {
    type: "profile";
    attributes: {
      email: string;
      external_id?: string;
      first_name?: string;
      last_name?: string;
      properties: Record<string, string>;
    };
  };
};

/**
 * The body for Klaviyo's create-or-update profile call.
 *
 * - `external_id` is the Lending OS contact id (CLAUDE.md). `withExternalId:
 *   false` is the retry when Klaviyo refuses because the address already
 *   belongs to a profile carrying a different id.
 * - NO PHONE NUMBER. Marketing email needs none, and a number another profile
 *   already holds makes Klaviyo refuse the whole import. Leaving it out is not
 *   "splitting email and phone across calls" — Lending OS never sends the phone.
 * - NO SUBSCRIPTIONS, EVER. This payload cannot subscribe anyone; nurture.regress
 *   fails if a subscription field ever appears in it.
 * - Empty fields are OMITTED, not sent as null: null would erase a name
 *   someone typed into Klaviyo.
 */
export function profilePayload(
  c: Pick<NurtureContact, "id" | "firstName" | "lastName" | "email" | "state" | "apps">,
  program: Program,
  opts: { withExternalId: boolean } = { withExternalId: true },
): ProfilePayload | null {
  const email = cleanEmail(c.email);
  if (!email) return null;
  const properties: Record<string, string> = { los_program: program.name };
  const loan = loanWords(c.apps);
  if (loan) properties.los_loan_type = loan;
  if (c.state && /^[A-Z]{2}$/.test(c.state.trim())) properties.los_state = c.state.trim();

  const attributes: ProfilePayload["data"]["attributes"] = { email, properties };
  if (opts.withExternalId) attributes.external_id = c.id;
  const first = c.firstName?.trim();
  const last = c.lastName?.trim();
  if (first) attributes.first_name = first.slice(0, 100);
  if (last) attributes.last_name = last.slice(0, 100);
  return { data: { type: "profile", attributes } };
}

/* ---------------------------------------------------------------- syncing */

export type SyncState = "pending_add" | "added" | "pending_remove" | "removed";

/** After this many failures a row stops retrying and the page offers "Try again". */
export const MAX_SYNC_ATTEMPTS = 8;

/** Minutes to wait before retry number `attempts` (1-based): 2, 4, 8 … capped at 6 hours. */
export function retryDelayMinutes(attempts: number): number {
  const n = Math.max(1, Math.floor(attempts));
  return Math.min(2 ** n, 360);
}

/** Where a stopped enrolment's Klaviyo state goes. A row never added needs no removal call — but
 *  one mid-add might land, so anything not already "removed" is removed. */
export function stateAfterStop(state: SyncState): SyncState {
  return state === "removed" ? "removed" : "pending_remove";
}

export const SYNC_LABEL: Record<SyncState, string> = {
  pending_add: "Queued for Klaviyo",
  added: "In Klaviyo",
  pending_remove: "Removing from Klaviyo",
  removed: "Removed from Klaviyo",
};

/* -------------------------------------------------------------- the page */

export const ENROLL_MAX = 500;

export type Candidate = {
  id: string;
  name: string;
  email: string;
  source: string;
  loan: string;
  /** Days since anyone was in touch, or null for never. */
  quietDays: number | null;
  /** For people with no deal: when they were added and their tags, to judge who they are. */
  note: string;
};

export function candidateOf(c: NurtureContact, now: Date): Candidate {
  const name = [c.firstName, c.lastName].filter((s) => s && s.trim()).join(" ").trim();
  const newest = [...c.apps].sort((a, b) => (ms(b.arrivedAt) ?? 0) - (ms(a.arrivedAt) ?? 0))[0];
  return {
    id: c.id,
    name: name || (cleanEmail(c.email) ?? "(no name)"),
    email: cleanEmail(c.email) ?? "",
    source: SOURCE_LABEL[c.leadSource] ?? SOURCE_LABEL[newest?.leadSource ?? ""] ?? "—",
    loan: PRODUCT_LABEL[newest?.product ?? ""] ?? "—",
    quietDays: daysSince(c.lastTouchAt, now),
    note: c.apps.length > 0 ? "" : contactNote(c),
  };
}

/** "Added Apr 2026 · investor, flipper" — enough to judge whether this is someone Luis knows. */
function contactNote(c: NurtureContact): string {
  const added = ms(c.addedAt);
  const when = added === null ? "" : `Added ${new Date(added).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", year: "numeric" })}`;
  const tags = c.tags.map((t) => t.trim()).filter(Boolean).slice(0, 3).join(", ");
  return [when, tags].filter(Boolean).join(" · ");
}

export type ProgramSummary = {
  key: ProgramKey;
  ready: number;
  active: number;
  /** Stopped, by reason. */
  stopped: Partial<Record<StopReason, number>>;
  wins: number;
  syncFailed: number;
};

export type EnrollmentLite = { program: string; status: "active" | "stopped"; stopReason: string | null; syncState: string; syncAttempts: number };

/** Counts for the four cards, from the classified book and the enrolment rows. */
export function summarize(
  contacts: NurtureContact[],
  enrollments: EnrollmentLite[],
  now: Date,
): { byProgram: ProgramSummary[]; candidates: Record<ProgramKey, Candidate[]>; excluded: Partial<Record<Exclusion, number>> } {
  const candidates = Object.fromEntries(PROGRAM_KEYS.map((k) => [k, [] as Candidate[]])) as Record<ProgramKey, Candidate[]>;
  const excluded: Partial<Record<Exclusion, number>> = {};
  for (const c of contacts) {
    const v = classify(c, now);
    if (v.program) candidates[v.program].push(candidateOf(c, now));
    else excluded[v.exclusion] = (excluded[v.exclusion] ?? 0) + 1;
  }
  for (const k of PROGRAM_KEYS) {
    // Longest-quiet first: the people most likely to have forgotten us.
    candidates[k].sort((a, b) => (b.quietDays ?? 1e9) - (a.quietDays ?? 1e9) || a.name.localeCompare(b.name));
  }

  const byProgram = PROGRAMS.map((p): ProgramSummary => {
    const rows = enrollments.filter((e) => e.program === p.key);
    const stopped: Partial<Record<StopReason, number>> = {};
    for (const e of rows) {
      if (e.status !== "stopped") continue;
      const r = (e.stopReason ?? "stopped_by_staff") as StopReason;
      stopped[r] = (stopped[r] ?? 0) + 1;
    }
    return {
      key: p.key,
      ready: candidates[p.key].length,
      active: rows.filter((e) => e.status === "active").length,
      stopped,
      wins: WIN_REASONS.reduce((n, r) => n + (stopped[r] ?? 0), 0),
      syncFailed: rows.filter((e) => e.syncAttempts >= MAX_SYNC_ATTEMPTS && (e.syncState === "pending_add" || e.syncState === "pending_remove")).length,
    };
  });
  return { byProgram, candidates, excluded };
}

/** Parse the ids the page sends to the enrol action. Uuids only, de-duplicated, capped. */
export function parseContactIds(raw: unknown): { ok: true; ids: string[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: "Nobody was selected." };
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const ids = [...new Set(raw.filter((v): v is string => typeof v === "string" && UUID.test(v)).map((v) => v.toLowerCase()))];
  if (ids.length === 0) return { ok: false, error: "Nobody was selected." };
  if (ids.length > ENROLL_MAX) return { ok: false, error: `Enrol at most ${ENROLL_MAX} people at a time.` };
  return { ok: true, ids };
}
