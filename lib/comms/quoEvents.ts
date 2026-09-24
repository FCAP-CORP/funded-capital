/**
 * Quo webhook events → what the CRM should write. Pure; pinned by
 * lib/comms/quoEvents.regress.ts.
 *
 * TWO PAYLOAD SHAPES, one output. Webhooks made in the Quo app send the older
 * shape (`data.object` with from/to/body); webhooks made through the dated API
 * (2026-03-30) send `data.resource` + `data.context`. `parseQuoEvent` reads
 * either into one normalised event, and `planQuoEvent` decides what it means.
 * Neither touches the database: lib/comms/quoWebhook.server.ts does the
 * writing and matches the phone number to a contact.
 *
 * WHAT GETS LOGGED
 *   message.received  → an `sms_in` activity, plus the STOP rules.
 *   message.delivered → the outbox row becomes `delivered`; if the text was
 *                       sent from the Quo app rather than the CRM, an `sms_out`
 *                       activity is written so the timeline still shows it.
 *   message.failed / message.undelivered (dated API only) → outbox status.
 *   call.completed    → a `call` activity: direction, answered or missed,
 *                       duration, the other party's number and Quo's call id.
 *   anything else     → stored in webhook_events and otherwise ignored.
 *
 * DEDUP KEYS are the provider's own resource ids: `quo:msg:<message id>` and
 * `quo:call:<call id>`. The webhook's EVENT id is claimed separately in
 * webhook_events (CLAUDE.md's rule), so a retried delivery stops there. The
 * resource-id key on the activity goes one step further: a text the CRM sent
 * carries `quo:msg:<id>` from the moment Quo accepts it, so when Quo's
 * `message.delivered` for that same text arrives the insert collides and no
 * second timeline row appears — whichever of the two paths gets there first.
 */

import { inboundKeyword, type InboundKeyword } from "./consent";
import { normalisePhone } from "../phone";

export type QuoMessage = {
  id: string;
  direction: "incoming" | "outgoing";
  /** The other party — the borrower — in E.164 when it normalises. */
  counterparty: string | null;
  /** Our Quo number. */
  ours: string | null;
  text: string;
  mediaCount: number;
  status: string | null;
  errorCode: string | null;
  createdAt: string | null;
};

export type QuoCall = {
  id: string;
  direction: "incoming" | "outgoing";
  counterparty: string | null;
  ours: string | null;
  /** answered | unanswered | failed | forwarded | abandoned | ai-handled | unknown */
  status: string;
  answered: boolean;
  durationSec: number | null;
  voicemail: boolean;
  createdAt: string | null;
  answeredAt: string | null;
  completedAt: string | null;
};

export type QuoEvent = {
  id: string;
  type: string;
  createdAt: string | null;
  shape: "object" | "resource";
  message: QuoMessage | null;
  call: QuoCall | null;
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const iso = (v: unknown): string | null => {
  const s = str(v);
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
};
const firstStr = (v: unknown): string | null => (Array.isArray(v) ? str(v.find((x) => str(x))) : str(v));

/**
 * A participant identifier as E.164 when it is a phone number; otherwise null.
 *
 * Quo already sends E.164, and that is taken exactly as given — a number that
 * is valid E.164 but that our stricter NANP rules would refuse (an 0xx
 * exchange, say) must still match, or a STOP from it would be applied to no
 * one. Anything else goes through the same normaliser that wrote
 * `contacts.phone`, so both sides of the match are the same shape.
 */
export function e164(v: unknown): string | null {
  const s = str(v)?.trim();
  if (!s) return null;
  if (/^\+[1-9]\d{7,14}$/.test(s)) return s;
  const r = normalisePhone(s);
  return r.ok ? r.e164 : null;
}

const direction = (v: unknown): "incoming" | "outgoing" | null =>
  v === "incoming" || v === "outgoing" ? v : null;

/**
 * Read a webhook body. Returns an error string for anything without the two
 * fields every event has — an id and a type — because without an id there is
 * nothing to dedupe on, and the route answers 400 rather than storing it.
 */
export function parseQuoEvent(json: unknown): { ok: true; event: QuoEvent } | { ok: false; error: string } {
  const root = obj(json);
  if (!root) return { ok: false, error: "body is not a JSON object" };
  const id = str(root.id);
  const type = str(root.type);
  if (!id) return { ok: false, error: "event has no id" };
  if (!type) return { ok: false, error: "event has no type" };
  if (id.length > 200 || type.length > 100) return { ok: false, error: "event id or type is implausibly long" };

  const data = obj(root.data) ?? {};
  const resource = obj(data.resource);
  const legacy = obj(data.object);
  const context = obj(data.context) ?? {};
  const shape: QuoEvent["shape"] = resource ? "resource" : "object";
  const o = resource ?? legacy ?? {};

  const event: QuoEvent = { id, type, createdAt: iso(root.createdAt), shape, message: null, call: null };

  if (type.startsWith("message.")) {
    const mid = str(o.id);
    const dir = direction(o.direction) ?? (type === "message.received" ? "incoming" : "outgoing");
    let from: string | null;
    let to: string | null;
    if (resource) {
      from = str(context.senderIdentifier);
      to = firstStr(context.recipientIdentifiers);
    } else {
      from = str(o.from);
      to = firstStr(o.to);
    }
    const text = typeof o.text === "string" ? o.text : typeof o.body === "string" ? o.body : typeof o.content === "string" ? o.content : "";
    if (mid) {
      event.message = {
        id: mid,
        direction: dir,
        counterparty: e164(dir === "incoming" ? from : to),
        ours: e164(dir === "incoming" ? to : from),
        text,
        mediaCount: Array.isArray(o.media) ? o.media.length : 0,
        status: str(o.status),
        errorCode: str(o.errorCode),
        createdAt: iso(o.createdAt),
      };
    }
  }

  if (type.startsWith("call.")) {
    const cid = str(o.id);
    const dir = direction(o.direction);
    if (cid && dir) {
      let counterparty: string | null;
      let ours: string | null;
      if (resource) {
        const parts = obj(context.participants) ?? {};
        counterparty = e164(firstStr(parts.external));
        ours = e164(firstStr(parts.workspace));
      } else {
        counterparty = e164(dir === "incoming" ? o.from : firstStr(o.to));
        ours = e164(dir === "incoming" ? firstStr(o.to) : o.from);
      }
      const answeredAt = iso(o.answeredAt);
      const completedAt = iso(o.completedAt);
      const rawStatus = str(o.status);
      // The dated API reports answered/unanswered; the older shape only says
      // "completed", so whether anyone picked up is read from answeredAt.
      const status =
        rawStatus && rawStatus !== "completed" ? rawStatus : answeredAt ? "answered" : "unanswered";
      let durationSec: number | null =
        typeof o.duration === "number" && Number.isFinite(o.duration) && o.duration >= 0 ? Math.round(o.duration) : null;
      if (durationSec === null && answeredAt && completedAt) {
        const d = (Date.parse(completedAt) - Date.parse(answeredAt)) / 1000;
        durationSec = d >= 0 ? Math.round(d) : null;
      }
      const vm = obj(o.voicemail);
      event.call = {
        id: cid,
        direction: dir,
        counterparty,
        ours,
        status,
        answered: status === "answered",
        durationSec,
        voicemail: o.hasVoicemail === true || !!(vm && str(vm.url)),
        createdAt: iso(o.createdAt),
        answeredAt,
        completedAt,
      };
    }
  }

  return { ok: true, event };
}

/* ------------------------------------------------------------------- plans */

/** An activity row, minus the contact, which the server matches by phone. */
export type PlannedActivity = {
  kind: "sms_in" | "sms_out" | "call";
  occurredAt: Date;
  source: "quo";
  subject: string | null;
  body: string | null;
  metadata: Record<string, unknown>;
  dedupKey: string;
};

export type QuoPlan =
  | { action: "sms_in"; phone: string | null; activity: PlannedActivity; keyword: InboundKeyword }
  | {
      action: "sms_status";
      providerMessageId: string;
      status: "delivered" | "undelivered" | "failed";
      phone: string | null;
      text: string;
      /** The carrier's code on a failed or undelivered text, when Quo has one. */
      errorCode: string | null;
      /** Only for `delivered`: logged if the CRM has no record of sending it. */
      activity: PlannedActivity | null;
    }
  | { action: "call"; phone: string | null; activity: PlannedActivity }
  | { action: "ignore"; reason: string };

/** "4 min 12 s", "38 s", "1 h 02 min". */
export function durationLabel(sec: number | null | undefined): string | null {
  if (sec === null || sec === undefined || !Number.isFinite(sec) || sec < 0) return null;
  const s = Math.round(sec);
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
  return `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")} min`;
}

/** One line for a call on the timeline: "Answered · 4 min 12 s", "Missed · voicemail left". */
export function callSummary(c: { direction: string; status: string; answered: boolean; durationSec: number | null; voicemail: boolean }): string {
  const vm = c.voicemail ? " · voicemail left" : "";
  if (c.answered) {
    const d = durationLabel(c.durationSec);
    return `Answered${d ? ` · ${d}` : ""}${vm}`;
  }
  if (c.direction === "incoming") return `Missed${vm}`;
  const why: Record<string, string> = {
    unanswered: "No answer",
    failed: "Did not connect",
    abandoned: "Hung up before answer",
    forwarded: "Forwarded",
    "ai-handled": "Handled by Quo's AI agent",
  };
  return `${why[c.status] ?? "Not answered"}${vm}`;
}

const when = (...candidates: (string | null)[]): Date => {
  for (const c of candidates) if (c) return new Date(c);
  return new Date(0);
};

/**
 * What an event means for the CRM. `now` is only a fallback timestamp for an
 * event that carries none, so the plan is otherwise deterministic.
 */
export function planQuoEvent(event: QuoEvent, now: Date): QuoPlan {
  const at = (...c: (string | null)[]) => {
    const d = when(...c);
    return d.getTime() === 0 ? now : d;
  };

  if (event.type === "message.received") {
    const m = event.message;
    if (!m) return { action: "ignore", reason: "message.received without a message id" };
    const keyword = inboundKeyword(m.text);
    const body = m.text.trim() || (m.mediaCount > 0 ? `(picture message — ${m.mediaCount} attachment${m.mediaCount === 1 ? "" : "s"}, view in Quo)` : null);
    return {
      action: "sms_in",
      phone: m.counterparty,
      keyword,
      activity: {
        kind: "sms_in",
        occurredAt: at(m.createdAt, event.createdAt),
        source: "quo",
        subject: null,
        body: body ? body.slice(0, 2000) : null,
        metadata: {
          provider: "quo",
          quoMessageId: m.id,
          quoEventId: event.id,
          from: m.counterparty,
          to: m.ours,
          mediaCount: m.mediaCount,
          ...(keyword ? { keyword } : {}),
        },
        dedupKey: `quo:msg:${m.id}`,
      },
    };
  }

  if (event.type === "message.delivered" || event.type === "message.undelivered" || event.type === "message.failed") {
    const m = event.message;
    if (!m) return { action: "ignore", reason: `${event.type} without a message id` };
    const status = event.type === "message.delivered" ? "delivered" : event.type === "message.undelivered" ? "undelivered" : "failed";
    return {
      action: "sms_status",
      providerMessageId: m.id,
      status,
      phone: m.counterparty,
      text: m.text,
      errorCode: m.errorCode,
      activity:
        status === "delivered"
          ? {
              kind: "sms_out",
              occurredAt: at(m.createdAt, event.createdAt),
              source: "quo",
              subject: null,
              body: m.text.trim() ? m.text.trim().slice(0, 2000) : null,
              metadata: {
                provider: "quo",
                quoMessageId: m.id,
                quoEventId: event.id,
                to: m.counterparty,
                from: m.ours,
                status: "delivered",
                sentFrom: "quo",
              },
              dedupKey: `quo:msg:${m.id}`,
            }
          : null,
    };
  }

  if (event.type === "call.completed") {
    const c = event.call;
    if (!c) return { action: "ignore", reason: "call.completed without a call id or direction" };
    return {
      action: "call",
      phone: c.counterparty,
      activity: {
        kind: "call",
        occurredAt: at(c.createdAt, c.answeredAt, c.completedAt, event.createdAt),
        source: "quo",
        subject: callSummary(c),
        body: null,
        metadata: {
          provider: "quo",
          quoCallId: c.id,
          quoEventId: event.id,
          direction: c.direction,
          status: c.status,
          answered: c.answered,
          durationSec: c.durationSec,
          voicemail: c.voicemail,
          participant: c.counterparty,
          ours: c.ours,
        },
        dedupKey: `quo:call:${c.id}`,
      },
    };
  }

  return { action: "ignore", reason: `event type ${event.type} is not used by the CRM` };
}
