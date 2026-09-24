/**
 * Text-message rules that are not about consent: how long a text may be, how
 * many carrier segments it costs, and what each outbox status means to a
 * person. Pure, and pinned by lib/comms/sms.regress.ts.
 *
 * Shared by the compose box (live counter) and the executor (the real check),
 * so the number the screen shows and the rule the server applies cannot drift.
 */

/** The longest text the CRM will send. Quo allows 1,600; seven segments is plenty for a 1:1 reply. */
export const MAX_SMS_BODY = 1000;

/* ---------------------------------------------------------------- segments */

/**
 * The GSM-7 default alphabet (3GPP TS 23.038), one septet each. Any character
 * outside this set and the extension table forces the WHOLE message into
 * UCS-2, which is why one emoji can cut a segment from 160 characters to 70.
 */
const GSM7_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";

/** The extension table: each costs TWO septets (an escape plus the character). */
const GSM7_EXTENDED = "^{}\\[~]|€\f";

const BASIC = new Set(Array.from(GSM7_BASIC));
const EXTENDED = new Set(Array.from(GSM7_EXTENDED));

export type SegmentInfo = {
  encoding: "GSM-7" | "UCS-2";
  /** Characters as the carrier counts them: septets for GSM-7, UTF-16 units for UCS-2. */
  units: number;
  segments: number;
  /** How many units fit in each segment at this length. */
  perSegment: number;
  /** Units left before the next segment starts. */
  remaining: number;
  /** The characters that forced UCS-2, de-duplicated — so the screen can say which. */
  unicodeChars: string[];
};

/**
 * How many SMS segments a message costs.
 *
 * One segment carries 160 GSM-7 characters or 70 UCS-2 units. A longer message
 * is split, and each part gives up room to a header saying how to reassemble
 * it: 153 GSM-7 or 67 UCS-2 per part. An emoji is TWO UCS-2 units (a surrogate
 * pair), which is why "👍" alone counts as 2 of 70.
 *
 * Known simplification: a carrier will not split an extension character's two
 * septets across a segment boundary, so a long message packed with `{}[]€` can
 * occasionally cost one segment more than this says. The counter is a guide
 * for the person typing, not a billing engine.
 */
export function countSegments(text: string): SegmentInfo {
  const chars = Array.from(text ?? "");
  const unicode = new Set<string>();
  let septets = 0;
  for (const ch of chars) {
    if (BASIC.has(ch)) septets += 1;
    else if (EXTENDED.has(ch)) septets += 2;
    else unicode.add(ch);
  }

  if (unicode.size === 0) {
    const units = septets;
    const single = units <= 160;
    const perSegment = single ? 160 : 153;
    const segments = units === 0 ? 0 : single ? 1 : Math.ceil(units / 153);
    return {
      encoding: "GSM-7",
      units,
      segments,
      perSegment,
      remaining: segments === 0 ? 160 : segments * perSegment - units,
      unicodeChars: [],
    };
  }

  const units = (text ?? "").length; // UTF-16 code units, which is what UCS-2 counts
  const single = units <= 70;
  const perSegment = single ? 70 : 67;
  const segments = single ? 1 : Math.ceil(units / 67);
  return {
    encoding: "UCS-2",
    units,
    segments,
    perSegment,
    remaining: segments * perSegment - units,
    unicodeChars: [...unicode],
  };
}

/* -------------------------------------------------------------- the body */

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Validate what someone typed. Line endings become \n; surrounding whitespace
 * goes. Nothing inside the message is changed — it is their words.
 */
export function parseSmsBody(input: unknown): Parsed<string> {
  if (typeof input !== "string") return { ok: false, error: "Write the text first." };
  const body = input.replace(/\r\n?/g, "\n").trim();
  if (!body) return { ok: false, error: "Write the text first." };
  if (body.length > MAX_SMS_BODY) {
    return { ok: false, error: `Keep texts under ${MAX_SMS_BODY.toLocaleString("en-US")} characters (this one is ${body.length.toLocaleString("en-US")}).` };
  }
  return { ok: true, value: body };
}

/* -------------------------------------------------------- status, in words */

export type Tone = "ok" | "warn" | "bad" | "muted";

/**
 * What an outbox status means, for the timeline.
 *
 * `sending` is the honest one: Quo was asked and did not answer, so the text
 * may or may not have gone. Saying "failed" there invites a resend that could
 * text the borrower twice.
 */
export function outboundStatusLabel(status: string, error?: string | null): { label: string; tone: Tone } {
  switch (status) {
    case "delivered": return { label: "Delivered", tone: "ok" };
    case "sent": return { label: "Sent", tone: "ok" };
    case "queued": return { label: "Not sent yet", tone: "warn" };
    case "sending": return { label: "Outcome unknown — check Quo before resending", tone: "warn" };
    case "undelivered": return { label: "Not delivered by the carrier", tone: "bad" };
    case "failed": return { label: error ? `Not sent — ${error}` : "Not sent", tone: "bad" };
    case "blocked": return { label: error ? `Blocked — ${error}` : "Blocked by the consent check", tone: "muted" };
    default: return { label: status, tone: "muted" };
  }
}

/** A `sending`/`queued` row this old is stuck, and may be retried by hand. */
export const STALE_SEND_MINUTES = 15;

/**
 * May a person press Retry on this row?
 *
 * `failed` — yes: Quo said no, so nothing went.
 * `sending`/`queued` — only once stale. Before that, Quo may still be working
 * on it, or its delivery webhook may be about to say it arrived.
 * Everything else — no. A sent text is sent; a blocked one needs consent, not
 * a retry (and the executor re-checks consent on retry regardless).
 */
export function canRetry(
  row: { status: string; lastAttemptAt: string | Date | null; createdAt: string | Date | null },
  now: Date,
): boolean {
  if (row.status === "failed") return true;
  if (row.status !== "sending" && row.status !== "queued") return false;
  const at = row.lastAttemptAt ?? row.createdAt;
  if (!at) return true;
  const t = (at instanceof Date ? at : new Date(at)).getTime();
  if (Number.isNaN(t)) return true;
  return now.getTime() - t >= STALE_SEND_MINUTES * 60_000;
}

/* ------------------------------------------------------- Quo's HTTP answers */

export type QuoFailure = { outcome: "rejected" | "unknown"; error: string };

/**
 * A Quo API response that was not a success, as a sentence Luis can act on.
 *
 * `rejected` means Quo definitely did not send it, so a retry is safe.
 * `unknown` means it might have: a timeout, a dropped connection, or a 5xx
 * from Quo's side. Those stay `sending` and are not retried automatically.
 *
 * The codes and titles are from Quo's published OpenAPI for POST /v1/messages.
 */
export function describeQuoFailure(
  httpStatus: number | null,
  body: unknown,
  kind: "http" | "timeout" | "network" = "http",
): QuoFailure {
  if (kind === "timeout") {
    return { outcome: "unknown", error: "Quo did not answer within 8 seconds. The text may still arrive — check the conversation in Quo before sending again." };
  }
  if (kind === "network" || httpStatus === null) {
    return { outcome: "unknown", error: "The connection to Quo dropped. The text may or may not have gone — check the conversation in Quo before sending again." };
  }
  const b = (body && typeof body === "object" ? body : {}) as { code?: unknown; title?: unknown; message?: unknown };
  const title = typeof b.title === "string" ? b.title : "";
  const message = typeof b.message === "string" ? b.message.slice(0, 200) : "";
  if (httpStatus === 400 && (b.code === "0206400" || /A2P/i.test(title))) {
    return { outcome: "rejected", error: "Quo refused it: the A2P 10DLC texting registration for this number is not approved." };
  }
  if (httpStatus === 400) {
    return { outcome: "rejected", error: `Quo said the message was invalid${message ? `: ${message}` : "."}` };
  }
  if (httpStatus === 401) return { outcome: "rejected", error: "Quo did not accept our API key. Check QUO_API_KEY in Vercel." };
  if (httpStatus === 402) return { outcome: "rejected", error: "The Quo subscription has expired." };
  if (httpStatus === 403) {
    return { outcome: "rejected", error: /cap|limit/i.test(title) ? "Quo's daily texting limit for this number has been reached. Try again tomorrow." : "Quo refused to send from this number." };
  }
  if (httpStatus === 404) return { outcome: "rejected", error: "Quo could not find the sending number. Check QUO_FROM_NUMBER in Vercel." };
  if (httpStatus === 429) return { outcome: "rejected", error: "Quo is limiting how fast we can send. Wait a minute and retry." };
  if (httpStatus >= 500) {
    return { outcome: "unknown", error: "Quo had a problem on its side. The text may or may not have gone — check the conversation in Quo before sending again." };
  }
  return { outcome: "rejected", error: `Quo refused it (HTTP ${httpStatus}).` };
}
