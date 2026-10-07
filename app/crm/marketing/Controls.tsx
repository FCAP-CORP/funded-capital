"use client";

import { useState, useTransition } from "react";
import { Ban, Check, ExternalLink, Rocket, RotateCcw, Send } from "lucide-react";
import { CHANNELS, CHANNEL_SPEC, type ContentChannel } from "@/lib/marketing/requests";
import { publishBlogAction, requestContentAction, setRequestStatusAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/field";
import { FOCUS_RING } from "@/components/ui/focus";
import { cn } from "@/lib/utils";

/**
 * The only JavaScript on this screen.
 *
 * The cadence cards, the queue table and every status badge render on the
 * server. This file is a form and four buttons.
 */

type Result = { ok: true } | { ok: false; error: string };

function Err({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <p role="alert" className="mt-2 text-xs text-red-700">{msg}</p>;
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
    <Card className="p-4 sm:p-5">
      <p className="text-sm font-semibold text-navy-900 flex items-center gap-2">
        <Send size={16} className="text-gold-700" aria-hidden="true" /> Ask for something
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {CHANNELS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setChannel(c)}
            aria-pressed={channel === c}
            className={cn(
              "h-9 rounded-lg px-3 text-sm font-semibold transition-colors motion-reduce:transition-none",
              FOCUS_RING,
              channel === c ? "bg-navy-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200",
            )}
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
      <p className="mt-2 text-xs text-slate-600">
        You get <span className="font-medium text-slate-700">{spec.produces}</span>.{" "}
        Nothing reaches anyone until you{" "}
        <span className="font-medium text-slate-700">{spec.publishStep}</span> —
        &ldquo;published&rdquo; here means {spec.publishedMeans}.
      </p>

      <Label htmlFor="mk-topic" className="mt-3">Topic</Label>
      <Textarea
        id="mk-topic"
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        rows={2}
        placeholder="What should it be about? A sentence, not a keyword."
        className="mt-1"
      />
      <Label htmlFor="mk-notes" className="mt-2">Notes (optional)</Label>
      <Textarea
        id="mk-notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        placeholder="Anything else — angle, length, a rate to reference, someone to quote."
        className="mt-1"
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button variant="accent" onClick={submit} disabled={pending || !topic.trim()} loading={pending}>
          {!pending && <Send size={16} aria-hidden="true" />}
          Add to the queue
        </Button>
        {done && (
          <span role="status" className="inline-flex items-center gap-1.5 text-xs text-emerald-700">
            <Check size={14} aria-hidden="true" /> Queued. It will be picked up on the next run.
          </span>
        )}
      </div>
      <Err msg={error} />
    </Card>
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
      <Button variant={tone === "primary" ? "primary" : "ghost"} size="xs" onClick={click} loading={pending}>
        {!pending && <Icon size={12} aria-hidden="true" />}
        {label}
      </Button>
      {error && <span role="alert" className="mt-1 max-w-[16rem] text-right text-[11px] text-red-700">{error}</span>}
    </span>
  );
}

export function MarkPublished({ id }: { id: string }) {
  const [url, setUrl] = useState("");
  return (
    <span className="inline-flex items-center gap-1.5">
      <Input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="link (optional)"
        aria-label="Link to the published piece (optional)"
        inputSize="sm"
        className="h-8 w-32 px-2 text-xs"
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

/**
 * Publish a blog draft to the live site — one decision, two clicks.
 *
 * The first click only asks ("Publish to fundedcapital.com?"); the second
 * sends it. A post going public is the one thing on this page that cannot be
 * quietly undone, so it is never a single stray click. Cancel is the default
 * focus-free choice and Escape backs out.
 *
 * After it works the row says so in words and links the post. The page
 * refreshes on its own and the row moves to Done.
 */
export function PublishBlog({ id, title }: { id: string; title: string }) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ message: string; url: string } | null>(null);
  const [pending, start] = useTransition();

  const send = () => {
    setError(null);
    start(async () => {
      let res: Awaited<ReturnType<typeof publishBlogAction>>;
      try {
        res = await publishBlogAction(id);
      } catch {
        res = { ok: false, error: "The connection dropped before the site answered. Press Publish again — if it went through, it will say so." };
      }
      setAsking(false);
      if (res.ok) setDone({ message: res.message, url: res.url });
      else setError(res.error);
    });
  };

  if (done) {
    return (
      <span role="status" className="inline-flex max-w-[18rem] flex-col items-end text-right text-[11px] text-emerald-800">
        <span className="inline-flex items-center gap-1 font-semibold"><Check size={12} aria-hidden="true" /> {done.message}</span>
        <a href={done.url} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-flex items-center gap-1 underline decoration-gold-500 underline-offset-2">
          View the post <ExternalLink size={11} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span>
        </a>
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col items-end">
      {asking ? (
        <span
          className="inline-flex items-center gap-1.5"
          onKeyDown={(e) => { if (e.key === "Escape" && !pending) setAsking(false); }}
        >
          <span className="text-[11px] text-slate-700">Publish to fundedcapital.com?</span>
          <Button variant="accent" size="xs" onClick={send} loading={pending} aria-label={`Yes, publish ${title} now`}>
            {!pending && <Rocket size={12} aria-hidden="true" />}
            Publish now
          </Button>
          <Button variant="ghost" size="xs" onClick={() => setAsking(false)} disabled={pending}>Cancel</Button>
        </span>
      ) : (
        <Button variant="accent" size="xs" onClick={() => { setError(null); setAsking(true); }} aria-label={`Publish ${title}`}>
          <Rocket size={12} aria-hidden="true" />
          Publish
        </Button>
      )}
      {error && <span role="alert" className="mt-1 max-w-[18rem] text-right text-[11px] text-red-700">{error}</span>}
    </span>
  );
}
