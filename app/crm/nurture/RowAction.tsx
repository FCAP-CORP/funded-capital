"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { retryAction, stopAction } from "./actions";

/** Stop (with a question first — it is permanent for this person) or Try again. */
export function RowAction({ kind, id, name }: { kind: "stop" | "retry"; id: string; name: string }) {
  const [asking, setAsking] = useState(false);
  const [pending, start] = useTransition();

  const run = () =>
    start(async () => {
      const r = kind === "stop" ? await stopAction(id) : await retryAction(id);
      setAsking(false);
      if (r.ok) toast.success(r.message);
      else toast.error(kind === "stop" ? "Not stopped" : "Not retried", r.error);
    });

  if (kind === "retry") {
    return <Button size="xs" variant="secondary" loading={pending} onClick={run}>Try again</Button>;
  }
  return (
    <>
      <Button size="xs" variant="ghost" onClick={() => setAsking(true)} aria-label={`Stop nurture for ${name}`}>Stop</Button>
      <Dialog
        open={asking}
        onClose={() => !pending && setAsking(false)}
        title={`Stop emails to ${name}?`}
        description="They come off the Klaviyo list within a minute, and Lending OS won't offer them for nurture again."
        footer={
          <>
            <Button variant="secondary" data-autofocus onClick={() => setAsking(false)} disabled={pending}>Keep</Button>
            <Button variant="danger" onClick={run} loading={pending}>Stop emails</Button>
          </>
        }
      />
    </>
  );
}
