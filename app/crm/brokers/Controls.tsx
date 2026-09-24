"use client";

import { useState, useTransition } from "react";
import { Building2, Check, Plus, ShieldOff, ShieldCheck, Link2, Send, Ban } from "lucide-react";
import { BROKER_ROLES, ROLE_DESCRIPTION } from "@/lib/broker/admin";
import type { BrokerRole, BrokerStatus } from "@/lib/broker/scope";
import {
  assignBrokerAction,
  inviteBrokerAction,
  revokeInviteAction,
  claimDealAction,
  createFirmAction,
  setBrokerNotesAction,
  setBrokerStatusAction,
  setFirmStatusAction,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/field";

/**
 * The interactive pieces of firm administration.
 *
 * Client components, kept small and separate from the pages so the pages stay
 * server components that render on the server and ship no JavaScript of their
 * own. Everything here is a form control plus a pending state — there is no
 * client-side data fetching and no state that outlives a click.
 *
 * PERFORMANCE: the only JS on these screens is what is in this file. The tables,
 * the counts and every row of borrower data render on the server.
 */

type Result = { ok: true } | { ok: false; error: string };

function Err({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <p role="alert" className="mt-2 text-xs text-red-700">{msg}</p>;
}

/* --------------------------------------------------------------- new firm */

export function NewFirmForm() {
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  const submit = () => {
    setError(null);
    setDone(false);
    start(async () => {
      const res: Result = await createFirmAction(name, notes);
      if (res.ok) {
        setName("");
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
        <Building2 size={16} className="text-gold-700" aria-hidden="true" /> Add a firm
      </p>
      <p className="mt-1 text-xs text-slate-600">
        Firms are created here and never by a broker signing up. Someone who could type a brokerage
        name into a form could join a competitor&rsquo;s pipeline.
      </p>
      <div className="mt-3 flex flex-col sm:flex-row gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Legacy HML"
          aria-label="Firm name"
          className="flex-1"
        />
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional, never shown to the broker)"
          aria-label="Notes about the firm (optional, never shown to the broker)"
          className="flex-1"
        />
        <Button onClick={submit} disabled={pending || !name.trim()} loading={pending}>
          {!pending && <Plus size={15} aria-hidden="true" />}
          Add
        </Button>
      </div>
      <Err msg={error} />
      {done && <p role="status" className="mt-2 text-xs text-emerald-700">Firm added.</p>}
    </Card>
  );
}

/* ------------------------------------------------------------ assign form */

export function AssignControl({
  brokerUserId,
  firms,
  currentFirmId,
  currentRole,
}: {
  brokerUserId: string;
  firms: { id: string; name: string }[];
  currentFirmId: string | null;
  currentRole: BrokerRole;
}) {
  const [firmId, setFirmId] = useState(currentFirmId ?? "");
  const [role, setRole] = useState<BrokerRole>(currentRole);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const dirty = firmId !== (currentFirmId ?? "") || role !== currentRole;

  const save = () => {
    setError(null);
    setSaved(false);
    start(async () => {
      const res: Result = await assignBrokerAction(brokerUserId, firmId, role);
      if (res.ok) setSaved(true);
      else setError(res.error);
    });
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-2">
        <Select
          value={firmId}
          onChange={(e) => setFirmId(e.target.value)}
          aria-label="Firm"
          wrapperClassName="flex-1"
        >
          <option value="">Unassigned — sees only their own deals</option>
          {firms.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </Select>
        <Select
          value={role}
          onChange={(e) => setRole(e.target.value as BrokerRole)}
          aria-label="Role"
          wrapperClassName="sm:w-40"
        >
          {BROKER_ROLES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </Select>
        <Button onClick={save} disabled={pending || !dirty} loading={pending}>
          {!pending && <Check size={15} aria-hidden="true" />}
          Save
        </Button>
      </div>
      <p className="mt-2 text-xs text-slate-600">{ROLE_DESCRIPTION[role]}</p>
      <Err msg={error} />
      {saved && !dirty && <p role="status" className="mt-1 text-xs text-emerald-700">Saved.</p>}
    </div>
  );
}

/* -------------------------------------------------------------- suspend */

export function StatusToggle({
  id,
  kind,
  status,
}: {
  id: string;
  kind: "broker" | "firm";
  status: BrokerStatus;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const next: BrokerStatus = status === "active" ? "suspended" : "active";

  const toggle = () => {
    setError(null);
    start(async () => {
      const res: Result = kind === "broker"
        ? await setBrokerStatusAction(id, next)
        : await setFirmStatusAction(id, next);
      if (!res.ok) setError(res.error);
    });
  };

  return (
    <>
      <Button
        variant="secondary"
        size="xs"
        onClick={toggle}
        loading={pending}
        title={
          status === "active"
            ? "Suspending cuts access immediately and changes nothing about the deals"
            : "Restore access"
        }
        className={status === "active" ? undefined : "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"}
      >
        {!pending && (status === "active" ? <ShieldOff size={13} aria-hidden="true" /> : <ShieldCheck size={13} aria-hidden="true" />)}
        {status === "active" ? "Suspend" : "Suspended — restore"}
      </Button>
      <Err msg={error} />
    </>
  );
}

/* ---------------------------------------------------------------- claim */

export function ClaimButton({
  applicationId,
  brokerUserId,
  disabledReason,
}: {
  applicationId: string;
  brokerUserId: string;
  disabledReason: string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  if (done) {
    return (
      <span role="status" className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
        <Check size={14} aria-hidden="true" /> Attached
      </span>
    );
  }

  const attach = () => {
    setError(null);
    start(async () => {
      const res: Result = await claimDealAction(applicationId, brokerUserId);
      if (res.ok) setDone(true);
      else setError(res.error);
    });
  };

  return (
    <div className="text-right">
      <Button
        variant="accent"
        size="xs"
        onClick={attach}
        disabled={Boolean(disabledReason)}
        loading={pending}
        title={disabledReason ?? "Attach this deal to this broker"}
      >
        {!pending && <Link2 size={13} aria-hidden="true" />}
        Attach
      </Button>
      {/* A disabled button's title never shows on touch and is not read reliably — say why in text. */}
      {disabledReason && <p className="mt-1 max-w-[14rem] text-[11px] text-slate-600">{disabledReason}</p>}
      <Err msg={error} />
    </div>
  );
}

/* ---------------------------------------------------------------- notes */

export function NotesBox({ brokerUserId, initial }: { brokerUserId: string; initial: string }) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = () => {
    setError(null);
    setSaved(false);
    start(async () => {
      const res: Result = await setBrokerNotesAction(brokerUserId, value);
      if (res.ok) setSaved(true);
      else setError(res.error);
    });
  };

  return (
    <div>
      <Textarea
        value={value}
        onChange={(e) => { setValue(e.target.value); setSaved(false); }}
        onBlur={save}
        rows={3}
        aria-label="Your notes on this broker"
        placeholder="Your notes on this relationship. Never shown in the portal."
      />
      <p aria-live="polite" className="mt-1 text-xs">
        {pending && <span className="text-slate-600">Saving…</span>}
        {saved && !pending && <span className="text-emerald-700">Saved.</span>}
      </p>
      <Err msg={error} />
    </div>
  );
}

/* --------------------------------------------------------------- invites */

export function InviteForm({ firms }: { firms: { id: string; name: string }[] }) {
  const [email, setEmail] = useState("");
  const [firmId, setFirmId] = useState("");
  const [role, setRole] = useState<BrokerRole>("member");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = () => {
    setError(null);
    setDone(null);
    start(async () => {
      const res: Result = await inviteBrokerAction(email, firmId, role, note);
      if (res.ok) {
        setDone(email.trim());
        setEmail("");
        setNote("");
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <Card className="p-4 sm:p-5">
      <p className="text-sm font-semibold text-navy-900 flex items-center gap-2">
        <Send size={16} className="text-gold-700" aria-hidden="true" /> Invite a broker
      </p>
      <p className="mt-1 text-xs text-slate-600">
        The portal is invitation only. Pick their firm and role now and they land inside it the
        moment they sign in &mdash; no queue, nothing waiting on you to notice.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="jasson@legacyhml.com"
          aria-label="Broker's email address"
        />
        <Select value={firmId} onChange={(e) => setFirmId(e.target.value)} aria-label="Firm">
          <option value="">No firm yet &mdash; decide later</option>
          {firms.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </Select>
        <Select value={role} onChange={(e) => setRole(e.target.value as BrokerRole)} aria-label="Role">
          {BROKER_ROLES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </Select>
        <Button onClick={submit} disabled={pending || !email.trim()} loading={pending}>
          {!pending && <Plus size={15} aria-hidden="true" />}
          Invite
        </Button>
      </div>

      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (optional, never shown to the broker)"
        aria-label="Note about this invitation (optional, never shown to the broker)"
        className="mt-2"
      />

      <p className="mt-2 text-xs text-slate-600">{ROLE_DESCRIPTION[role]}</p>
      <Err msg={error} />
      {done && (
        <p role="status" className="mt-2 text-xs text-emerald-700">
          Invited {done}. Send them the portal link yourself &mdash; this records the invitation, it
          does not email them.
        </p>
      )}
    </Card>
  );
}

export function RevokeInviteButton({ inviteId, accepted }: { inviteId: string; accepted: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const revoke = () => {
    setError(null);
    start(async () => {
      const res: Result = await revokeInviteAction(inviteId);
      if (!res.ok) setError(res.error);
    });
  };

  return (
    <>
      <Button
        variant="secondary"
        size="xs"
        onClick={revoke}
        loading={pending}
        title={
          accepted
            ? "They have already signed in — revoking records the decision but does NOT remove their access. Suspend them on their broker page to do that."
            : "Blocks this address from signing in"
        }
      >
        {!pending && <Ban size={13} aria-hidden="true" />}
        Revoke
      </Button>
      <Err msg={error} />
    </>
  );
}
