/**
 * Email from the record card: the pure rules. No network, no database —
 * pinned by email.regress.ts.
 *
 * The message goes out through the Gmail API as Luis, from his own mailbox.
 * To the recipient it is indistinguishable from an email typed in Gmail: same
 * servers, same SPF/DKIM/DMARC alignment, same Sent folder. Nothing here adds
 * tracking pixels or rewritten links — those are spam signals, and a
 * one-to-one email to a borrower does not need them.
 *
 * WHAT IS BUILT HERE
 *   - parseEmailDraft: what may be sent (lengths, no header injection).
 *   - buildMime: an RFC 5322 message, multipart/alternative, text + HTML, with
 *     the Gmail signature appended to both.
 *   - googleAuthUrl / safeReturnPath: the one-time "Connect Gmail" flow.
 */

export const MAX_EMAIL_SUBJECT = 200;
export const MAX_EMAIL_BODY = 20_000;

/**
 * What the app asks Google for, and nothing more.
 *   gmail.send            send as the connected mailbox. Cannot read mail.
 *   gmail.settings.basic  read the send-as settings — that is where the
 *                         signature lives. Cannot read mail either.
 * Reading the inbox is not needed: replies reach the timeline through the
 * existing Apps Script sync (apps-script/GmailSync.gs).
 */
export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.settings.basic",
] as const;

const EMAIL = /^[^\s@<>(),;:"\\[\]]+@[^\s@<>(),;:"\\[\]]+\.[A-Za-z]{2,}$/;

export function isEmailAddress(s: string | null | undefined): s is string {
  return typeof s === "string" && s.length <= 254 && EMAIL.test(s);
}

/* ---------------------------------------------------------------- the draft */

export type DraftResult = { ok: true; subject: string; body: string } | { ok: false; error: string };

/**
 * A subject is one line of plain text. Line breaks are refused rather than
 * stripped: a newline in a header is how a second header (a Bcc) gets
 * smuggled into a message.
 *
 * HTML entities are refused too. "fix &amp; flip" went out in a subject line
 * on 3 Sep 2026; subjects are plain text and take the literal "&".
 */
export function parseEmailDraft(subject: unknown, body: unknown): DraftResult {
  const s = typeof subject === "string" ? subject.trim() : "";
  const b = typeof body === "string" ? body.replace(/\r\n?/g, "\n").trim() : "";
  if (!s) return { ok: false, error: "Add a subject." };
  if (/[\r\n]/.test(s)) return { ok: false, error: "The subject must be a single line." };
  if (s.length > MAX_EMAIL_SUBJECT) return { ok: false, error: `Keep the subject under ${MAX_EMAIL_SUBJECT} characters.` };
  if (/&(?:[a-z]+|#\d+|#x[0-9a-f]+);/i.test(s)) {
    return { ok: false, error: "The subject contains an HTML code like &amp;. Type the plain character instead (for example &)." };
  }
  if (!b) return { ok: false, error: "Write the email first." };
  if (b.length > MAX_EMAIL_BODY) return { ok: false, error: `That email is too long (over ${MAX_EMAIL_BODY.toLocaleString("en-US")} characters).` };
  if (/\{\{\s*\w+\s*\}\}/.test(s) || /\{\{\s*\w+\s*\}\}/.test(b)) {
    return { ok: false, error: "There is still a {{placeholder}} in the email. Replace it before sending." };
  }
  return { ok: true, subject: s, body: b };
}

/* -------------------------------------------------------------------- HTML */

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Plain text as the HTML Gmail itself would produce: escaped, line breaks as
 * <br>, in a `dir="ltr"` div. No styling of our own, so it renders in the
 * reader's default font exactly like a hand-typed Gmail message.
 */
export function textToHtml(text: string): string {
  return `<div dir="ltr">${escapeHtml(text).replace(/\n/g, "<br>")}</div>`;
}

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/**
 * The signature as plain text, for the text/plain part and for the preview on
 * the card. Line structure is kept (br, div, p, li become line breaks); tags
 * go; common entities are decoded; links keep their visible text.
 */
export function signatureToText(html: string): string {
  return html
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    // Block boundaries (open or close) are ONE line break however many touch.
    .replace(/<\s*\/?\s*(div|p|li|tr|table|h[1-6])(\s[^>]*)?>/gi, "\u0000")
    .replace(/\u0000(?:[ \t]*\u0000)*/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
      }
      return NAMED[e.toLowerCase()] ?? m;
    })
    .replace(/[ \t\u00a0]+/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* -------------------------------------------------------------------- MIME */

/** RFC 2047 for a header value that is not plain ASCII. */
export function encodeHeader(value: string): string {
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

/** A display name for From:, quoted and encoded as needed. */
function mailbox(email: string, name?: string | null): string {
  const n = (name ?? "").replace(/[\r\n"\\]/g, "").trim();
  if (!n) return email;
  return /^[\x20-\x7e]*$/.test(n) ? `"${n}" <${email}>` : `${encodeHeader(n)} <${email}>`;
}

function base64Lines(s: string): string {
  return (Buffer.from(s, "utf8").toString("base64").match(/.{1,76}/g) ?? []).join("\r\n");
}

export type MimeInput = {
  from: string;
  fromName?: string | null;
  to: string;
  subject: string;
  text: string;
  /** Gmail signature HTML, or null for none. */
  signatureHtml: string | null;
  /** Deterministic in tests. */
  boundary?: string;
  date?: Date;
};

/**
 * The whole message, ready for Gmail's `raw` field (after base64url).
 *
 * Refuses a header value with a line break — the caller has already checked,
 * this is the second lock on the same door.
 */
export function buildMime(m: MimeInput): string {
  for (const [k, v] of [["from", m.from], ["to", m.to], ["subject", m.subject], ["fromName", m.fromName ?? ""]] as const) {
    if (/[\r\n]/.test(v)) throw new Error(`line break in ${k}`);
  }
  if (!isEmailAddress(m.from) || !isEmailAddress(m.to)) throw new Error("bad address");

  const sigHtml = m.signatureHtml && m.signatureHtml.trim() ? m.signatureHtml : null;
  const sigText = sigHtml ? signatureToText(sigHtml) : "";
  const text = sigText ? `${m.text}\n\n-- \n${sigText}` : m.text;
  // Gmail's own layout for a signature, so it looks the same as a hand-sent one.
  const html = sigHtml
    ? `${textToHtml(m.text)}<br clear="all"><div><br></div><span class="gmail_signature_prefix">-- </span><br><div dir="ltr" class="gmail_signature">${sigHtml}</div>`
    : textToHtml(m.text);

  const boundary = m.boundary ?? `fc_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  const date = (m.date ?? new Date()).toUTCString().replace("GMT", "+0000");

  return [
    `From: ${mailbox(m.from, m.fromName)}`,
    `To: ${m.to}`,
    `Subject: ${encodeHeader(m.subject)}`,
    `Date: ${date}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(text),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(html),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

export function base64Url(s: string): string {
  return Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/* ------------------------------------------------------------ Connect Gmail */

/**
 * Where to send Luis after connecting. Only a path inside /crm — never a full
 * URL, never `//host`, never a backslash trick — because the value travels
 * through a query string and a cookie, and an open redirect on a login flow is
 * a phishing tool.
 */
export function safeReturnPath(p: unknown): string {
  if (typeof p !== "string") return "/crm";
  if (!/^\/crm(?:[/?#]|$)/.test(p)) return "/crm";
  if (p.includes("//") || p.includes("\\") || /[\u0000-\u001f]/.test(p)) return "/crm";
  return p.length > 500 ? "/crm" : p;
}

/** Append `gmail=<status>` to a return path, keeping its own query. */
export function withGmailStatus(path: string, status: string): string {
  const safe = safeReturnPath(path);
  const [base, hash = ""] = safe.split("#");
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}gmail=${encodeURIComponent(status)}${hash ? `#${hash}` : ""}`;
}

export function googleAuthUrl(p: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  loginHint?: string | null;
}): string {
  const q = new URLSearchParams({
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPES.join(" "),
    // offline + consent: Google returns a refresh token every time, so a
    // reconnect always leaves a working token rather than an access token that
    // dies in an hour.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
    state: p.state,
    code_challenge: p.codeChallenge,
    code_challenge_method: "S256",
  });
  if (p.loginHint) q.set("login_hint", p.loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${q.toString()}`;
}

/** Did Google grant everything we asked for? A partial grant cannot send. */
export function hasAllScopes(granted: string | null | undefined): boolean {
  const have = new Set((granted ?? "").split(/\s+/).filter(Boolean));
  return GMAIL_SCOPES.every((s) => have.has(s));
}

/** Plain-English for the statuses the callback hands back to the card. */
export const GMAIL_STATUS_TEXT: Record<string, string> = {
  connected: "Gmail connected. Emails from the record card now send from your mailbox.",
  denied: "Gmail was not connected — the Google screen was cancelled.",
  "wrong-account": "That Google account is not the one you are signed in to Lending OS with. Connect the same address.",
  scopes: "Google did not grant permission to send. Connect again and leave both boxes ticked.",
  "no-refresh": "Google did not return a lasting permission. Remove Funded Capital from your Google account's third-party access, then connect again.",
  expired: "The connect link expired. Start again from the Email button.",
  "not-configured": "Gmail sending is not set up on the server yet (GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GMAIL_TOKEN_KEY).",
  error: "Something went wrong connecting Gmail. Try again.",
};
