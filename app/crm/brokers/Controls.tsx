"use client";

import { useState, useTransition } from "react";
import { Building2, Check, Loader2, Plus, ShieldOff, ShieldCheck, Link2 } from "lucide-react";
import { BROKER_ROLES, ROLE_DESCRIPTION } from "@/lib/broker/admin";
import type { BrokerRole, BrokerStatus } from "@/lib/broker/scope";
import {
  assignBrokerAction,
  claimDealAction,
  createFirmAction,
  setBrokerNotesAction,
  setBrokerStatusAction,
  setFirmStatusAction,
} from "./actions";

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
  return <p className="mt-2 text-xs text-red-600">{msg}</p>;
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
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold text-navy-900 flex items-center gap-2">
        <Building2 size={16} className="text-gold-600" /> Add a firm
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Firms are created here and never by a broker signing up. Someone who could type a brokerage
        name into a form could join a competitor&rsquo;s pipeline.
      </p>
      <div className="mt-3 flex flex-col sm:flex-row gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Legacy HML"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none"
        />
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional, never shown to the broker)"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none"
        />
        <button
          onClick={submit}
          disabled={pending || !name.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {pending ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
          Add
        </button>
      </div>
      <Err msg={error} />
      {done && <p className="mt-2 text-xs text-emerald-600">Firm added.</p>}
    </div>
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
        <select
          value={firmId}
          onChange={(e) => setFirmId(e.target.value)}
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:border-gold-500 focus:outline-none"
        >
          <option value="">Unassigned — sees only their own deals</option>
          {firms.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as BrokerRole)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:border-gold-500 focus:outline-none"
        >
          {BROKER_ROLES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <button
          onClick={save}
          disabled={pending || !dirty}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {pending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
          Save
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-500">{ROLE_DESCRIPTION[role]}</p>
      <Err msg={error} />
      {saved && !dirty && <p className="mt-1 text-xs text-emerald-600">Saved.</p>}
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
      <button
        onClick={toggle}
        disabled={pending}
        title={
          status === "active"
            ? "Suspending cuts access immediately and changes nothing about the deals"
            : "Restore access"
        }
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium disabled:opacity-40 ${
          status === "active"
            ? "border-slate-300 text-slate-600 hover:bg-slate-50"
            : "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
        }`}
      >
        {pending
          ? <Loader2 size={13} className="animate-spin" />
          : status === "active" ? <ShieldOff size={13} /> : <ShieldCheck size={13} />}
        {status === "active" ? "Suspend" : "Suspended — restore"}
      </button>
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
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
        <Check size={14} /> Attached
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
      <button
        onClick={attach}
        disabled={pending || Boolean(disabledReason)}
        title={disabledReason ?? "Attach this deal to this broker"}
        className="inline-flex items-center gap-1.5 rounded-lg bg-gold-500 px-3 py-1.5 text-xs font-semibold text-navy-900 hover:bg-gold-400 disabled:opacity-40 disabled:hover:bg-gold-500"
      >
        {pending ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
        Attach
      </button>
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
      <textarea
        value={value}
        onChange={(e) => { setValue(e.target.value); setSaved(false); }}
        onBlur={save}
        rows={3}
        placeholder="Your notes on this relationship. Never shown in the portal."
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none"
      />
      {pending && <p className="mt-1 text-xs text-slate-400">Saving…</p>}
      {saved && !pending && <p className="mt-1 text-xs text-emerald-600">Saved.</p>}
      <Err msg={error} />
    </div>
  );
}
