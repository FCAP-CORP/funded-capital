"use client";

import { useState, useTransition } from "react";
import { Pause, Play, Power, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { pauseAction, refreshAction, setFlowAction, setModeAction, type NurtureActionResult } from "./actions";

/**
 * The cockpit's four switches. Each is a small client island; everything
 * else on the page is server-rendered. Anything that changes who gets email
 * asks first, with the consequence in one sentence.
 */

function useRun() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<NurtureActionResult>, failTitle: string, done?: () => void) =>
    start(async () => {
      const r = await fn();
      done?.();
      if (r.ok) toast.success(r.message);
      else toast.error(failTitle, r.error);
    });
  return { pending, run };
}

/** Emails on / off for one programme — the Klaviyo flow's live/draft switch. */
export function FlowSwitch({
  program, name, live, ready, queued, auto, problems, cap,
}: {
  program: string; name: string; live: boolean; ready: number; queued: number; auto: boolean; problems: string[]; cap: number;
}) {
  const [asking, setAsking] = useState(false);
  const { pending, run } = useRun();
  const go = () => run(() => setFlowAction(program, !live), live ? "Not switched off" : "Not switched on", () => setAsking(false));
  const waiting = queued + (auto ? ready : 0);

  return (
    <>
      <Button
        size="sm"
        variant={live ? "secondary" : "primary"}
        onClick={() => setAsking(true)}
        disabled={!live && problems.length > 0}
        title={!live && problems.length > 0 ? problems[0] : undefined}
      >
        <Power size={14} aria-hidden="true" />
        {live ? "Turn emails off" : "Turn emails on"}
      </Button>
      <Dialog
        open={asking}
        onClose={() => !pending && setAsking(false)}
        title={live ? `Turn off ${name} emails?` : `Turn on ${name} emails?`}
        description={
          live
            ? "Klaviyo stops sending every email in this programme, including to people already in it. Nobody new is released until you turn it back on."
            : waiting > 0
              ? `${waiting} ${waiting === 1 ? "person is" : "people are"} waiting. Lending OS releases them on weekday mornings from 9:30, at most ${cap} a day across all programmes while your sending warms up. Each gets the first email then; the rest follow on the flow's schedule.`
              : "Klaviyo starts sending this programme's emails to anyone Lending OS adds from now on, on weekday mornings."
        }
        footer={
          <>
            <Button variant="secondary" data-autofocus onClick={() => setAsking(false)} disabled={pending}>Cancel</Button>
            <Button variant={live ? "danger" : "primary"} onClick={go} loading={pending}>
              {live ? "Turn off" : "Turn on"}
            </Button>
          </>
        }
      />
    </>
  );
}

/** Automatic (queued every weekday morning) or You choose (only who you tick). */
export function ModeSwitch({ program, name, mode }: { program: string; name: string; mode: "auto" | "review" }) {
  const [asking, setAsking] = useState<"auto" | "review" | null>(null);
  const { pending, run } = useRun();
  const options = [["auto", "Automatic"], ["review", "You choose"]] as const;
  return (
    <>
      <div role="radiogroup" aria-label={`How people join ${name}`} className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
        {options.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={mode === key}
            disabled={pending}
            onClick={() => mode !== key && setAsking(key)}
            className={cn(
              "h-8 rounded-md px-3 text-[13px] font-semibold transition-colors motion-reduce:transition-none",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-700",
              mode === key ? "bg-white text-navy-900 shadow-sm ring-1 ring-slate-200" : "text-slate-600 hover:text-navy-900",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <Dialog
        open={asking !== null}
        onClose={() => !pending && setAsking(null)}
        title={asking === "auto" ? `Add people to ${name} automatically?` : `Choose ${name} people yourself?`}
        description={
          asking === "auto"
            ? "Every weekday morning, while this programme's emails are on, Lending OS queues everyone who qualifies — the same rules as the Ready list. The warm-up still limits how many go out each day."
            : "Nobody is added unless you tick them on the Ready list. People already in the programme carry on."
        }
        footer={
          <>
            <Button variant="secondary" data-autofocus onClick={() => setAsking(null)} disabled={pending}>Cancel</Button>
            <Button onClick={() => asking && run(() => setModeAction(program, asking), "Not saved", () => setAsking(null))} loading={pending}>
              {asking === "auto" ? "Make it automatic" : "I'll choose"}
            </Button>
          </>
        }
      />
    </>
  );
}

/** Pause or resume every release to Klaviyo. */
export function PauseSwitch({ paused }: { paused: boolean }) {
  const [asking, setAsking] = useState(false);
  const { pending, run } = useRun();
  const go = () => run(() => pauseAction(!paused), paused ? "Not resumed" : "Not paused", () => setAsking(false));
  return (
    <>
      <Button size="sm" variant={paused ? "primary" : "secondary"} onClick={() => setAsking(true)}>
        {paused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
        {paused ? "Resume sending" : "Pause sending"}
      </Button>
      <Dialog
        open={asking}
        onClose={() => !pending && setAsking(false)}
        title={paused ? "Resume sending?" : "Pause all sending?"}
        description={
          paused
            ? "Queued people start going to Klaviyo again on the next weekday morning window, within the warm-up limit. If this was paused because of bounces or spam complaints, make sure the cause is fixed first."
            : "Nobody new goes to Klaviyo until you resume. People already in a programme keep getting its emails — turn a programme's emails off to stop those."
        }
        footer={
          <>
            <Button variant="secondary" data-autofocus onClick={() => setAsking(false)} disabled={pending}>Cancel</Button>
            <Button variant={paused ? "primary" : "danger"} onClick={go} loading={pending}>{paused ? "Resume" : "Pause"}</Button>
          </>
        }
      />
    </>
  );
}

/** Re-read every flow and re-render the previews now. */
export function RefreshButton() {
  const { pending, run } = useRun();
  return (
    <Button size="sm" variant="ghost" loading={pending} onClick={() => run(refreshAction, "Couldn't refresh")}>
      {!pending && <RefreshCw size={14} aria-hidden="true" />}
      Refresh from Klaviyo
    </Button>
  );
}
