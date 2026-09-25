"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { Check, Link2, Loader2, Mail, Send, ShieldAlert } from "lucide-react";
import { MAX_EMAIL_BODY, MAX_EMAIL_SUBJECT, GMAIL_STATUS_TEXT } from "@/lib/comms/email";
import { EMAIL_TEMPLATES, fillTemplate, templateByKey, type TemplateVars } from "@/lib/crm/emailTemplates";
import { emailPanelInfo, sendEmail, type EmailPanelInfo } from "../emailActions";
import type { CrmRoute } from "../actions";

/**
 * Email from the record card, sent from the signed-in person's own Gmail.
 *
 * The panel decides nothing: it shows whether Gmail is connected and what the
 * email gate says, but the server action's executor re-reads the contact and
 * runs the gate itself (lib/comms/emailOutbox.server.ts). A disabled button is
 * a courtesy, not a control.
 *
 * Templates fill the box; they are starting points and the box is editable.
 * The Gmail signature is shown under the box as it will be added — Gmail does
 * not add it to messages sent this way, so the server reads it and appends it.
 *
 * AFTER A SEND the idempotency key is replaced only on a definite outcome. An
 * UNKNOWN outcome keeps the key, so pressing Send again asks the server what
 * happened instead of emailing the borrower twice.
 */

export type EmailGateView = { ok: true; to: string } | { ok: false; reason: string };

export type EmailComposeView = {
  gate: EmailGateView;
  vars: Omit<TemplateVars, "senderFirstName">;
};

const btn =
  "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 " +
  "hover:border-slate-300 hover:bg-slate-100 hover:text-navy-900 disabled:opacity-50 disabled:pointer-events-none " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500";
const primary =
  "inline-flex items-center gap-1.5 rounded-lg bg-navy-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy-800 " +
  "disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500";
const input =
  "rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm placeholder:text-slate-400 " +
  "focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500 disabled:opacity-60";

function newSendKey(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** The page the card is open on, for the Connect Gmail round trip. */
function connectHref(): string {
  const here = typeof window === "undefined" ? "/crm" : `${window.location.pathname}${window.location.search}`;
  const clean = here.replace(/([?&])gmail=[^&]*&?/, "$1").replace(/[?&]$/, "");
  return `/api/crm/google/connect?return=${encodeURIComponent(clean)}`;
}

export function EmailComposer({
  id, applicationId, name, view, onClose, from, notice,
}: {
  id: string;
  applicationId: string;
  name: string;
  view: EmailComposeView;
  onClose: () => void;
  from: CrmRoute;
  /** A sentence from the Connect Gmail round trip (?gmail=…), if any. */
  notice?: { ok: boolean; text: string } | null;
}) {
  const [info, setInfo] = useState<EmailPanelInfo | null>(null);
  const [templateKey, setTemplateKey] = useState("blank");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [touched, setTouched] = useState(false);
  const [key, setKey] = useState(newSendKey);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const ids = useId();

  useEffect(() => {
    let live = true;
    emailPanelInfo().then((r) => { if (live) setInfo(r); });
    return () => { live = false; };
  }, []);

  const senderFirstName = info && info.ok ? info.senderFirstName : null;

  // Fill the default template once we know who is sending.
  useEffect(() => {
    if (!info || touched) return;
    const t = templateByKey(templateKey);
    if (!t) return;
    const filled = fillTemplate(t, { ...view.vars, senderFirstName });
    setSubject(filled.subject);
    setBody(filled.body);
    // Only on first load; picking a template later goes through pick().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info]);

  function pick(k: string) {
    const t = templateByKey(k);
    if (!t) return;
    setTemplateKey(k);
    const filled = fillTemplate(t, { ...view.vars, senderFirstName });
    setSubject(filled.subject);
    setBody(filled.body);
    setTouched(false);
    setResult(null);
  }

  const connected = info?.ok === true && info.state === "connected";
  const canSend =
    connected && view.gate.ok && !pending && subject.trim().length > 0 && body.trim().length > 0 &&
    subject.length <= MAX_EMAIL_SUBJECT && body.length <= MAX_EMAIL_BODY;

  function submit() {
    if (!canSend) return;
    setResult(null);
    start(async () => {
      const res = await sendEmail(applicationId, { subject, body, templateKey }, key, from);
      if (res.ok) {
        setKey(newSendKey());
        setTouched(false);
        pick("blank");
        setResult({ ok: true, message: res.status === "already_sent" ? "Already sent." : "Sent from your Gmail — it is on the timeline below and in your Sent folder." });
        return;
      }
      if (res.status === "failed" || res.status === "blocked" || res.status === "invalid") setKey(newSendKey());
      setResult({ ok: false, message: res.error });
    });
  }

  const shell = "flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3";
  const Notice = notice ? (
    <p role="status" className={`text-xs ${notice.ok ? "text-emerald-700" : "text-amber-800"}`}>{notice.text}</p>
  ) : null;

  if (!view.gate.ok) {
    return (
      <div id={id} className={shell}>
        {Notice}
        <p className="flex items-start gap-1.5 text-xs text-amber-800">
          <ShieldAlert size={14} aria-hidden="true" className="mt-px shrink-0" />
          <span>{view.gate.reason}</span>
        </p>
        <div><button type="button" className={btn} onClick={onClose}>Close</button></div>
      </div>
    );
  }

  if (!info) {
    return (
      <div id={id} className={shell} aria-busy="true">
        {Notice}
        <p className="inline-flex items-center gap-1.5 text-xs text-slate-500">
          <Loader2 size={13} className="animate-spin" aria-hidden="true" /> Checking your Gmail connection…
        </p>
      </div>
    );
  }

  if (!info.ok || info.state !== "connected") {
    const text = !info.ok
      ? info.error
      : info.state === "not-configured"
        ? "Email sending is not set up on the server yet — three Vercel settings are missing (GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GMAIL_TOKEN_KEY)."
        : info.state === "needs-reconnect"
          ? `Google no longer accepts the permission for ${info.email}. Reconnect once and sending works again.`
          : "Connect your Gmail once, and emails from this card go out from your own mailbox, with your signature, and land in your Sent folder.";
    const canConnect = info.ok && info.state !== "not-configured";
    return (
      <div id={id} className={shell}>
        {Notice}
        <p className="text-xs text-slate-700">{text}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {canConnect && (
            <a href={connectHref()} className={primary}>
              <Link2 size={13} aria-hidden="true" />
              {info.ok && info.state === "needs-reconnect" ? "Reconnect Gmail" : "Connect Gmail"}
            </a>
          )}
          <button type="button" className={btn} onClick={onClose}>Close</button>
        </div>
        {canConnect && (
          <p className="text-[11px] text-slate-500">
            Google asks for two permissions: send email as you, and read your signature. It cannot read your inbox.
          </p>
        )}
      </div>
    );
  }

  return (
    <form
      id={id}
      className={shell}
      onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } }}
      onSubmit={(e) => { e.preventDefault(); submit(); }}
    >
      {Notice}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1"><Mail size={12} aria-hidden="true" /> From <strong className="font-semibold text-navy-900">{info.email}</strong></span>
        <span>To <strong className="font-semibold text-navy-900">{view.gate.to}</strong></span>
      </div>

      <label htmlFor={`${ids}-tpl`} className="sr-only">Template</label>
      <select id={`${ids}-tpl`} value={templateKey} onChange={(e) => pick(e.target.value)} disabled={pending} className={`${input} w-full`}>
        {EMAIL_TEMPLATES.map((t) => (
          <option key={t.key} value={t.key}>{t.label} — {t.hint}</option>
        ))}
      </select>

      <label htmlFor={`${ids}-subject`} className="sr-only">Subject</label>
      <input
        id={`${ids}-subject`}
        value={subject}
        onChange={(e) => { setSubject(e.target.value.replace(/[\r\n]/g, " ")); setTouched(true); }}
        maxLength={MAX_EMAIL_SUBJECT}
        placeholder="Subject"
        disabled={pending}
        className={`${input} w-full font-medium`}
      />

      <label htmlFor={`${ids}-body`} className="sr-only">Email to {name}</label>
      <textarea
        id={`${ids}-body`}
        value={body}
        onChange={(e) => { setBody(e.target.value); setTouched(true); if (result?.ok) setResult(null); }}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); } }}
        rows={10}
        maxLength={MAX_EMAIL_BODY}
        disabled={pending}
        autoFocus
        className={`${input} w-full leading-relaxed`}
      />

      <div className="rounded-md border border-dashed border-slate-200 bg-white px-2.5 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Your Gmail signature, exactly as it will be sent</p>
        {info.signatureHtml ? (
          <SignaturePreview html={info.signatureHtml} />
        ) : info.signature ? (
          <p className="mt-1 whitespace-pre-line text-xs text-slate-600">{info.signature}</p>
        ) : null}
        {info.signatureNote && <p className="mt-1 text-[11px] text-slate-500">{info.signatureNote}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <button type="submit" className={primary} disabled={!canSend} title="Send from your Gmail (Ctrl/⌘ + Enter)">
          {pending ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Send size={13} aria-hidden="true" />}
          {pending ? "Sending…" : "Send email"}
        </button>
        <button type="button" className={btn} disabled={pending} onClick={onClose}>Close</button>
        <span className="text-[11px] text-slate-500">Sends from your Gmail. Replies come to your inbox and onto this timeline.</span>
      </div>

      {result && (
        <p role={result.ok ? "status" : "alert"} className={`inline-flex items-start gap-1 text-xs ${result.ok ? "text-emerald-700" : "text-red-600"}`}>
          {result.ok && <Check size={12} aria-hidden="true" className="mt-px" />}
          {result.message}
        </p>
      )}
    </form>
  );
}

/**
 * The real signature HTML, rendered the way an email client renders it.
 *
 * In a SANDBOXED iframe (`sandbox=""`: no scripts, no forms, no navigation of
 * this page, its own opaque origin) rather than injected into the page. The
 * HTML comes from Gmail's settings, not from us, so it is treated like any
 * email content: displayed, never trusted. Images (a logo) load as they would
 * in the recipient's inbox. The frame's default margin is removed and Gmail's
 * default font is used, so what you see is what they see.
 */
function SignaturePreview({ html }: { html: string }) {
  // Rendered at a real email width (720px) and scaled down to fit the card, so
  // a wide designed signature keeps its layout instead of being squeezed.
  const WIDTH = 720, HEIGHT = 620, SCALE = 0.55;
  const doc =
    '<!doctype html><html><head><meta charset="utf-8"><base target="_blank">' +
    "<style>html,body{margin:0;padding:8px;font-family:Arial,Helvetica,sans-serif;font-size:small;color:#222;background:#fff}</style>" +
    `</head><body><div><div dir="ltr" class="gmail_signature">${html}</div></div></body></html>`;
  return (
    <div className="mt-1 overflow-hidden rounded border border-slate-100" style={{ height: HEIGHT * SCALE }}>
      <iframe
        title="Your Gmail signature"
        sandbox=""
        srcDoc={doc}
        referrerPolicy="no-referrer"
        className="block origin-top-left border-0"
        style={{ width: WIDTH, height: HEIGHT, transform: `scale(${SCALE})` }}
      />
    </div>
  );
}

/** Read and clear `?gmail=<status>` after the Connect Gmail round trip. */
export function takeGmailNotice(): { ok: boolean; text: string } | null {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const status = url.searchParams.get("gmail");
  if (!status) return null;
  url.searchParams.delete("gmail");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  return { ok: status === "connected", text: GMAIL_STATUS_TEXT[status] ?? GMAIL_STATUS_TEXT.error };
}
