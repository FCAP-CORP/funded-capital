/**
 * Marketing requests: what a channel can actually do, and whether it is running.
 *
 * WHAT THIS FEATURE IS FOR. The blog engine was meant to publish daily. On
 * 23 Sep 2026 the newest post was dated 30 August — twenty-four days of silence
 * that nothing reported, because a pipeline that stops produces no error, it
 * just produces nothing. A button that makes MORE content would not have helped;
 * the missing piece was a screen that says out loud how long it has been.
 *
 * So the cadence indicator is the point of this module and the request queue is
 * the second half, not the other way round.
 *
 * PURE. No database, no React, no clock — `now` is a parameter. Covered by
 * `requests.regress.ts`.
 */

export type ContentChannel = "blog" | "linkedin" | "email";

export type ContentStatus =
  | "requested"
  | "in_progress"
  | "drafted"
  | "published"
  | "failed"
  | "cancelled";

export const CHANNELS: readonly ContentChannel[] = ["blog", "linkedin", "email"];

export function isContentChannel(v: string): v is ContentChannel {
  return (CHANNELS as readonly string[]).includes(v);
}

/* ------------------------------------------------------- what each can do */

export interface ChannelSpec {
  label: string;
  /** What the fulfilment task actually produces. Shown in the UI verbatim. */
  produces: string;
  /**
   * Whether anything here reaches the public without Luis.
   *
   * FALSE FOR ALL THREE, AND THAT IS THE INVARIANT. An earlier version of this
   * file said the blog published itself, because a post is an MDX file and a
   * push deploys it — but the push is `publish-blog.bat`, which is a person
   * double-clicking something. Writing "it goes live on its own" into the form
   * was a claim about a step that does not exist, which is the same species of
   * error as a marketing screen reporting a silence it never checked.
   *
   * The test asserts this stays false everywhere. If it ever flips, something
   * must genuinely be able to put content in front of borrowers unattended, and
   * that is a decision to make on purpose rather than to discover.
   */
  autoPublishes: boolean;
  /** The one thing Luis does to make it public. Named, so the form can say it. */
  publishStep: string;
  /** What "published" means here, in the words the screen should use. */
  publishedMeans: string;
  /**
   * Whether a published-history exists OUTSIDE this table.
   *
   * The blog has one: the MDX files, fifty of them, dated. The other two do not,
   * so their cadence can only be measured from the day this portal started
   * recording — and the screen has to say so rather than implying a silence that
   * predates it.
   */
  hasArchive: boolean;
  /** Days between posts this channel is aiming for. A starting point, not a law. */
  targetDays: number;
}

export const CHANNEL_SPEC: Record<ContentChannel, ChannelSpec> = {
  blog: {
    label: "Blog",
    produces: "a draft post in the repository",
    autoPublishes: false,
    publishStep: "run publish-blog.bat",
    publishedMeans: "live on fundedcapital.com/blog",
    hasArchive: true,
    targetDays: 1,
  },
  linkedin: {
    label: "LinkedIn",
    produces: "a post and a carousel brief, in a Gmail draft",
    autoPublishes: false,
    publishStep: "post it on LinkedIn",
    publishedMeans: "you posted it",
    hasArchive: false,
    targetDays: 7,
  },
  email: {
    label: "Email",
    produces: "a draft template in Klaviyo",
    autoPublishes: false,
    publishStep: "send it from Klaviyo",
    publishedMeans: "you sent it from Klaviyo",
    hasArchive: false,
    targetDays: 30,
  },
};

export const STATUS_LABEL: Record<ContentStatus, string> = {
  requested: "Requested",
  in_progress: "Being written",
  drafted: "Draft ready",
  published: "Published",
  failed: "Failed",
  cancelled: "Cancelled",
};

/* --------------------------------------------------------- status machine */

/**
 * Which moves are legal.
 *
 * `failed` can go back to `requested` — a retry — because the alternative is
 * Luis retyping the brief, and a failure that costs you your work is a failure
 * you stop reporting.
 */
const ALLOWED: Record<ContentStatus, readonly ContentStatus[]> = {
  requested: ["in_progress", "cancelled", "failed"],
  in_progress: ["drafted", "failed", "cancelled"],
  // Back to in_progress is a redo: same brief, another attempt.
  drafted: ["published", "in_progress", "cancelled", "failed"],
  published: [],
  failed: ["requested", "cancelled"],
  cancelled: [],
};

export function canTransition(from: ContentStatus, to: ContentStatus): boolean {
  return ALLOWED[from]?.includes(to) ?? false;
}

/** Terminal states. Nothing more happens, and the UI stops offering buttons. */
export function isSettled(status: ContentStatus): boolean {
  return status === "published" || status === "cancelled";
}

/** Waiting on the fulfilment task rather than on a person. */
export function isPending(status: ContentStatus): boolean {
  return status === "requested" || status === "in_progress";
}

/* -------------------------------------------------------------- validation */

export type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

export interface RequestDraft {
  channel: ContentChannel;
  topic: string;
  notes: string | null;
}

export const TOPIC_MIN = 8;
export const TOPIC_MAX = 500;
export const NOTES_MAX = 2000;

/**
 * A topic is a BRIEF, not a label.
 *
 * The minimum length is deliberate. "DSCR" is a category; it gives the writer
 * nothing to aim at and produces the kind of generic post that is worse than no
 * post. Eight characters is low enough not to nag and high enough to stop a
 * one-word request.
 */
export function validateRequest(
  rawChannel: string,
  rawTopic: string,
  rawNotes: string | null,
): Validated<RequestDraft> {
  if (!isContentChannel(rawChannel)) return { ok: false, error: `Unknown channel "${rawChannel}".` };

  const topic = (rawTopic ?? "").trim().replace(/\s+/g, " ");
  if (!topic) return { ok: false, error: "Say what it should be about." };
  if (topic.length < TOPIC_MIN) return { ok: false, error: "Give it a sentence, not a single word — a one-word topic produces a generic post." };
  if (topic.length > TOPIC_MAX) return { ok: false, error: `Keep the topic under ${TOPIC_MAX} characters; put the detail in the notes.` };

  const notes = (rawNotes ?? "").trim();
  if (notes.length > NOTES_MAX) return { ok: false, error: `Notes are limited to ${NOTES_MAX} characters.` };

  return { ok: true, value: { channel: rawChannel, topic, notes: notes || null } };
}

/* ----------------------------------------------------------------- cadence */

export type CadenceLevel = "ok" | "slipping" | "stalled" | "unknown";

export interface CadenceInput {
  channel: ContentChannel;
  /** Newest publication date known for this channel. */
  lastPublishedAt: string | null;
  /**
   * Where that date came from. "archive" is a real published history (the MDX
   * files); "portal" means this table, which only knows what it recorded.
   */
  source: "archive" | "portal";
}

export interface Cadence {
  channel: ContentChannel;
  level: CadenceLevel;
  /** Whole days since the last publication, or null when nothing is known. */
  days: number | null;
  headline: string;
  /** The honest caveat, when there is one. Empty string when there is not. */
  caveat: string;
}

/** Days past target before it is slipping, and before it has stopped. */
export const SLIPPING_MULTIPLE = 3;
export const STALLED_MULTIPLE = 7;

function wholeDaysBetween(thenIso: string, now: Date): number | null {
  const t = new Date(thenIso);
  if (Number.isNaN(t.getTime())) return null;
  const a = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
  const b = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((b - a) / 86_400_000);
}

/**
 * How long has this channel been quiet, and is that a problem?
 *
 * "Unknown" is a real answer and gets its own level. A channel with no recorded
 * history is not stalled — it is unmeasured, and colouring it red would teach
 * the reader to ignore the red.
 */
export function cadenceFor(input: CadenceInput, now: Date = new Date()): Cadence {
  const spec = CHANNEL_SPEC[input.channel];

  if (!input.lastPublishedAt) {
    return {
      channel: input.channel,
      level: "unknown",
      days: null,
      headline: "No record yet",
      caveat: spec.hasArchive
        ? "Nothing published, ever."
        : "This channel has no history outside the portal, so there is nothing to measure until the first one goes out.",
    };
  }

  const days = wholeDaysBetween(input.lastPublishedAt, now);
  if (days === null) {
    return { channel: input.channel, level: "unknown", days: null, headline: "Date unreadable", caveat: "" };
  }

  // A future date is bad data, not a publication. Treat it as today rather than
  // reporting a negative silence.
  const elapsed = Math.max(0, days);

  const level: CadenceLevel =
    elapsed >= spec.targetDays * STALLED_MULTIPLE
      ? "stalled"
      : elapsed >= spec.targetDays * SLIPPING_MULTIPLE
        ? "slipping"
        : "ok";

  return {
    channel: input.channel,
    level,
    days: elapsed,
    headline: elapsed === 0 ? "Published today" : elapsed === 1 ? "1 day ago" : `${elapsed} days ago`,
    caveat: input.source === "portal"
      ? "Measured from what this portal has recorded, not from a full history."
      : "",
  };
}

/* ------------------------------------------------------------ stuck queue */

export interface TrackedRequest {
  id: string;
  channel: ContentChannel;
  status: ContentStatus;
  requestedAt: string | null;
  claimedAt: string | null;
}

/** Hours a request may sit claimed before the task that took it is presumed dead. */
export const STUCK_AFTER_HOURS = 6;

/**
 * Requests the pipeline picked up and never finished.
 *
 * The same failure as a silent blog, one level down: a task claims a job, dies,
 * and the row sits at `in_progress` looking busy. Nothing retries it and nothing
 * says so, which is how a queue quietly becomes a graveyard.
 */
export function stuckRequests(
  rows: TrackedRequest[],
  hours: number = STUCK_AFTER_HOURS,
  now: Date = new Date(),
): TrackedRequest[] {
  const cutoff = now.getTime() - hours * 3_600_000;
  return rows.filter((r) => {
    if (r.status !== "in_progress") return false;
    // Claimed with no timestamp is itself broken, so it counts as stuck rather
    // than being skipped for want of a date.
    if (!r.claimedAt) return true;
    const t = new Date(r.claimedAt).getTime();
    return Number.isNaN(t) ? true : t < cutoff;
  });
}

/** Requests waiting for the fulfilment task, oldest first. */
export function pendingRequests(rows: TrackedRequest[]): TrackedRequest[] {
  return rows
    .filter((r) => isPending(r.status))
    .sort((a, b) => (a.requestedAt ?? "").localeCompare(b.requestedAt ?? ""));
}
