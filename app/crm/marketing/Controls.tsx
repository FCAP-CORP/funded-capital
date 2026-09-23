"use client";

import { useState, useTransition } from "react";
import { Ban, Check, Loader2, RotateCcw, Send } from "lucide-react";
import { CHANNELS, CHANNEL_SPEC, type ContentChannel } from "@/lib/marketing/requests";
import { requestContentAction, setRequestStatusAction } from "./actions";

/**
 * The only JavaScript on this screen.
 *
 * The cadence cards, the queue table and every status badge render on the
 * server. This file is a form and three buttons.
 */

type Result = { ok: true } | { ok: false; error: string };

function Err({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <p className="mt-2 text-xs text-red-600">{msg}</p>;
}

export function RequestForm() {
  const [channel, setChannel] = useState<ContentChannel>("blog");
  const [topic, setTopic] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  const spec = CHANNEL_SPEC[channel];

  const submit = () => {
    setError(null);
    setDone(false);
    start(async () => {
      const res: Result = await requestContentAction(channel, topic, notes);
      if (res.ok) {
        setTopic("");
        setNotes("");
        setDone(true);
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold text-navy-900 flex items-center gap-2">
        <Send size={16} className="text-gold-600" /> Ask for something
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {CHANNELS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setChannel(c)}
            aria-pressed={channel === c}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              channel === c
                ? "bg-navy-900 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {CHANNEL_SPEC[c].label}
          </button>
        ))}
      </div>

      {/*
        Says what will actually happen, for the channel selected, before the
        click. The three channels end in genuinely different places and only one
        of them puts anything live on its own.
      */}
      <p className="mt-2 text-xs text-slate-500">
        You get <span className="font-medium text-slate-700">{spec.produces}</span>.{" "}
        {spec.autoPublishes
          ? "It goes live on its own once you approve it."
          : `Nothing goes out until you send it — "published" here means ${spec.publishedMeans}.`}
      </p>

      <textarea
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        rows={2}
        placeholder="What should it be about? A sentence, not a keyword."
        className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none"
      />
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        placeholder="Anything else — angle, length, a rate to reference, someone to quote. Optional."
        className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none"
      />

      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={submit}
          disabled={pending || !topic.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-gold-500 px-4 py-2 text-sm font-semibold text-navy-900 hover:bg-gold-400 disabled:opacity-50"
        >
          {pending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          Add to the queue
        </button>
        {done && (
          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700">
            <Check size={14} /> Queued. It will be picked up on the next run.
          </span>
        )}
      </div>
      <Err msg={error} />
    </div>
  );
}

/* ------------------------------------------------------------ row actions */

function RowButton({
  id, status, url, label, icon: Icon, tone,
}: {
  id: string; status: string; url?: string; label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  tone: "primary" | "quiet";
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const click = () => {
    setError(null);
    start(async () => {
      const res: Result = await setRequestStatusAction(id, status, url ?? "");
      if (!res.ok) setError(res.error);
    });
  };

  return (
    <span className="inline-flex flex-col items-end">
      <button
        onClick={click}
        disabled={pending}
        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium disabled:opacity-50 ${
          tone === "primary"
            ? "bg-navy-900 text-white hover:bg-navy-800"
            : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        }`}
      >
        {pending ? <Loader2 size={12} className="animate-spin" /> : <Icon size={12} />}
        {label}
      </button>
      {error && <span className="mt-1 max-w-[16rem] text-right text-[11px] text-red-600">{error}</span>}
    </span>
  );
}

export function MarkPublished({ id }: { id: string }) {
  const [url, setUrl] = useState("");
  return (
    <span className="inline-flex items-center gap-1.5">
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="link (optional)"
        className="w-28 rounded border border-slate-300 px-2 py-1 text-xs focus:border-gold-500 focus:outline-none"
      />
      <RowButton id={id} status="published" url={url} label="Published" icon={Check} tone="primary" />
    </span>
  );
}

export function CancelRequest({ id }: { id: string }) {
  return <RowButton id={id} status="cancelled" label="Cancel" icon={Ban} tone="quiet" />;
}

export function RetryRequest({ id }: { id: string }) {
  return <RowButton id={id} status="requested" label="Try again" icon={RotateCcw} tone="quiet" />;
}
