"use client";

import { useState, useTransition } from "react";
import { AlarmClock, ChevronDown, FileSignature, Send, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { MAX_EMAIL_BODY, MAX_EMAIL_SUBJECT } from "@/lib/comms/email";
import { NOT_NOW_DAYS, TS_SERIES, isCheckin, type DueFollowup } from "@/lib/crm/termSheetFollowups";
import { setSnooze, stopFollowups } from "../actions";
import { sendEmail, settleSend } from "../emailActions";
import { RecordLink } from "../_record/RecordCardProvider";

/**
 * Every action here refreshes THIS page and no other (guards.regress.ts §8).
 * Sending refreshes the dashboard, and the fresh list no longer holds the row.
 */
const HERE = "/crm/dashboard" as const;

/**
 * "Term sheets waiting on a reply" — the follow-up emails that are due today,
 * already written, one click from sent. Luis approves each: nothing on this
 * list goes out until he presses Send, and Send goes through the same Gmail
 * executor as the record card (consent gate, signature, timeline, no double
 * send).
 *
 * CONVERSION — the internal kind: a warm deal dies in the gap between "I should
 * chase that term sheet" and actually writing the email. The email is written;
 * the only decision left is Send, Not now or Stop.
 */

function newKey(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const input =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-navy-900 " +
  "focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500 disabled:opacity-60";

export function FollowUps({ items, upcoming }: { items: DueFollowup[]; upcoming: number }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="fu-h" className="rounded-2xl border border-gold-500/60 bg-white shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 px-5 py-4">
        <h2 id="fu-h" className="flex items-center gap-2 text-lg font-bold text-navy-900">
          <FileSignature size={18} className="text-gold-600" aria-hidden="true" />
          Term sheets waiting on a reply
          <span className="rounded-full bg-navy-900 px-2 py-0.5 text-xs font-bold tabular-nums text-white">{items.length}</span>
        </h2>
        <p className="text-[13px] text-slate-600">
          Follow-ups written and ready. Nothing sends until you press Send.
          {upcoming > 0 && ` ${upcoming} more due in the next few days.`}
        </p>
      </div>
      <ul className="divide-y divide-slate-100">
        {items.map((f) => <FollowUpRow key={`${f.applicationId}:${f.step.templateKey}`} f={f} />)}
      </ul>
    </section>
  );
}

function FollowUpRow({ f }: { f: DueFollowup }) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState(f.subject);
  const [body, setBody] = useState(f.body);
  // An unsure earlier send keeps ITS key, so nothing goes twice until Luis settles it.
  const [key, setKey] = useState(() => f.unsureKey ?? newKey());
  const [unsure, setUnsure] = useState(!!f.unsureKey);
  const [stopping, setStopping] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string; connect?: boolean } | null>(null);
  const [pending, start] = useTransition();

  const canSend = !pending && subject.trim().length > 0 && body.trim().length > 0 &&
    subject.length <= MAX_EMAIL_SUBJECT && body.length <= MAX_EMAIL_BODY;

  const send = () =>
    start(async () => {
      setNotice(null);
      const r = await sendEmail(f.applicationId, { subject, body, templateKey: f.step.templateKey }, key, HERE);
      if (r.ok) {
        setKey(newKey());
        toast.success(r.status === "already_sent" ? "Already sent" : `Sent to ${f.name}`, "It's in your Gmail Sent folder and on their timeline.");
        return;
      }
      // An unknown outcome keeps the key, so pressing Send again asks the server what happened.
      if (r.status === "failed" || r.status === "blocked" || r.status === "invalid") setKey(newKey());
      if (r.status === "unknown") { setUnsure(true); setOpen(true); setNotice(null); return; }
      setNotice({ ok: false, text: r.error, connect: r.status === "not_connected" });
    });

  // Luis looked in his Sent folder after Gmail gave no clear answer.
  const settle = (outcome: "not_sent" | "sent") =>
    start(async () => {
      setNotice(null);
      const r = await settleSend(key, outcome, HERE);
      if (!r.ok) { setNotice({ ok: false, text: r.error }); return; }
      if (outcome === "sent") {
        toast.success("Marked as sent", `${f.name} — it counts as this follow-up.`);
        return;
      }
      // Not sent: send it now, with a fresh key.
      const fresh = newKey();
      setKey(fresh);
      setUnsure(false);
      const s2 = await sendEmail(f.applicationId, { subject, body, templateKey: f.step.templateKey }, fresh, HERE);
      if (s2.ok) { setKey(newKey()); toast.success(`Sent to ${f.name}`, "It's in your Gmail Sent folder and on their timeline."); return; }
      if (s2.status === "unknown") { setUnsure(true); return; }
      if (s2.status === "failed" || s2.status === "blocked" || s2.status === "invalid") setKey(newKey());
      setNotice({ ok: false, text: s2.error, connect: s2.status === "not_connected" });
    });

  const notNow = () =>
    start(async () => {
      const until = new Date(Date.now() + NOT_NOW_DAYS * 86_400_000).toISOString();
      const r = await setSnooze(f.applicationId, until, isCheckin(f.step) ? "Old term sheet check-in: not now" : `Term sheet follow-up ${f.step.step}: not now`, HERE);
      if (r.ok) toast.success(`Back in ${NOT_NOW_DAYS} days`, f.name);
      else toast.error("Not saved", r.error);
    });

  const stop = () =>
    start(async () => {
      const r = await stopFollowups(f.applicationId, HERE);
      setStopping(false);
      if (r.ok) toast.success("Follow-ups stopped", `${f.name} stays at term sheet; no more reminders for it.`);
      else toast.error("Not stopped", r.error);
    });

  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <RecordLink
            applicationId={f.applicationId}
            className="font-semibold text-navy-900 underline decoration-gold-500/60 underline-offset-2 hover:decoration-gold-600"
          >
            {f.name}
          </RecordLink>
          <span className="text-[13px] text-slate-600"> · {f.deal}</span>
          <p className="mt-0.5 text-[13px] text-slate-600">
            {isCheckin(f.step)
              ? <>Old term sheet · sent {f.daysSinceTermSheet} days ago · one check-in, then nothing. Dead deal? Close it as lost on the card.</>
              : <>Follow-up {f.step.step} of {TS_SERIES.length} · term sheet sent {f.daysSinceTermSheet} day{f.daysSinceTermSheet === 1 ? "" : "s"} ago</>}
          </p>
          {!open && <p className="mt-1 truncate text-sm text-slate-800">&ldquo;{subject}&rdquo;</p>}
          {!open && unsure && <p className="mt-1 text-[13px] font-medium text-amber-800">Last send did not confirm. Open it to check and finish.</p>}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button size="sm" variant={open ? "secondary" : "primary"} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            <ChevronDown size={14} className={open ? "rotate-180" : undefined} aria-hidden="true" />
            {open ? "Hide" : "Review & send"}
          </Button>
          <Button size="sm" variant="ghost" onClick={notNow} disabled={pending} title={`Hide it for ${NOT_NOW_DAYS} days`}>
            <AlarmClock size={14} aria-hidden="true" /> Not now
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setStopping(true)} disabled={pending}>
            <XCircle size={14} aria-hidden="true" /> Stop
          </Button>
        </div>
      </div>

      {open && (
        <div className="mt-3 flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs text-slate-600">To {f.email}, from your Gmail, with your signature added below.</p>
          <label className="text-xs font-semibold text-slate-700">
            Subject
            <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={MAX_EMAIL_SUBJECT} disabled={pending} className={`${input} mt-1`} />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Message
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} maxLength={MAX_EMAIL_BODY} disabled={pending} className={`${input} mt-1 font-normal leading-relaxed`} />
          </label>
          {unsure && (
            <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p>
                Gmail did not give a clear answer when this was sent, so it may or may not have gone. Look in your Gmail
                Sent folder for an email to {f.email} with this subject.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => settle("not_sent")} loading={pending}>
                  {!pending && <Send size={14} aria-hidden="true" />} Not in my Sent folder: send it now
                </Button>
                <Button size="sm" variant="secondary" onClick={() => settle("sent")} disabled={pending}>
                  It&apos;s in my Sent folder
                </Button>
              </div>
            </div>
          )}
          {notice && (
            <p role="alert" className={`text-sm ${notice.ok ? "text-emerald-700" : "text-red-700"}`}>
              {notice.text}
              {notice.connect && (
                <>
                  {" "}
                  <a href="/api/crm/google/connect?return=%2Fcrm%2Fdashboard" className="font-semibold underline">Connect Gmail</a>
                </>
              )}
            </p>
          )}
          <div className={unsure ? "hidden" : "flex justify-end"}>
            <Button onClick={send} disabled={!canSend} loading={pending}>
              {!pending && <Send size={14} aria-hidden="true" />} Send
            </Button>
          </div>
        </div>
      )}

      <Dialog
        open={stopping}
        onClose={() => !pending && setStopping(false)}
        title={`Stop follow-ups for ${f.name}?`}
        description="No more reminders for this term sheet. The deal stays where it is, and you can still email them from their record card. If you reissue the term sheet, the follow-ups start again."
        footer={
          <>
            <Button variant="secondary" data-autofocus onClick={() => setStopping(false)} disabled={pending}>Keep</Button>
            <Button variant="danger" onClick={stop} loading={pending}>Stop follow-ups</Button>
          </>
        }
      />
    </li>
  );
}
