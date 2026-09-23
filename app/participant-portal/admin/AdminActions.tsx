"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertTriangle, Check, Loader2, Undo2 } from "lucide-react";
import { formatDate, money, type AdminState } from "@/lib/revenueShare";
import {
  capitalReturnedAction,
  clearInitiatedAction,
  logRunAction,
  markInitiatedAction,
  markPaidOffAction,
  type ActionResult,
} from "./actions";

/**
 * The Program Book's action panel.
 *
 * Everything here used to be a script paste or a trip to the spreadsheet.
 * The design rule: a button may only do something the sheet already says is
 * true. The panel never sends an amount, a participation list or a due date —
 * it sends an instruction, and the Apps Script derives the rest from the
 * Payment Schedule. So the worst a mangled click can do is log a run that was
 * genuinely scheduled.
 */

const FIELD =
  "rounded-md border border-slate-300 px-3 py-2 text-sm text-ink " +
  "focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500";

function Submit({ label, tone = "gold" }: { label: string; tone?: "gold" | "quiet" }) {
  const { pending } = useFormStatus();
  const base =
    "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold " +
    "transition-colors disabled:cursor-not-allowed disabled:opacity-60";
  const skin =
    tone === "gold"
      ? "bg-gold-500 text-ink hover:bg-gold-400"
      : "border border-slate-300 text-slate-600 hover:bg-slate-50";
  return (
    <button type="submit" disabled={pending} className={`${base} ${skin}`}>
      {pending && <Loader2 size={14} className="animate-spin" />}
      {pending ? "Working…" : label}
    </button>
  );
}

function Result({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  return (
    <p
      role="status"
      className={`mt-3 flex items-start gap-2 rounded-md px-3 py-2 text-sm ${
        result.ok
          ? "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-600/20"
          : "bg-red-50 text-red-800 ring-1 ring-inset ring-red-600/20"
      }`}
    >
      <span className="mt-0.5 shrink-0">
        {result.ok ? <Check size={15} /> : <AlertTriangle size={15} />}
      </span>
      <span className="whitespace-pre-wrap">{result.message}</span>
    </p>
  );
}

function Block({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-slate-100 px-5 py-5 last:border-0">
      <h3 className="text-sm font-bold text-ink">{title}</h3>
      {description && <p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

/* ---------------- log a payment run ---------------- */

function LogRun({ run }: { run: AdminState["outstanding"][number] }) {
  const [result, action] = useActionState<ActionResult | null, FormData>(logRunAction, null);
  return (
    <form action={action} className="rounded-md border border-slate-200 p-4">
      <input type="hidden" name="period" value={run.due} />

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-bold text-ink">Due {formatDate(run.due)}</p>
        <p className="text-sm font-bold tabular-nums text-ink">{money(run.total)}</p>
      </div>
      <p className="mt-0.5 text-xs text-slate-500">
        {run.rows.length} payment{run.rows.length === 1 ? "" : "s"}, not yet logged
      </p>

      <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3">
        {run.rows.map((r) => (
          <li key={r.id} className="flex justify-between gap-4 text-xs text-slate-600">
            <span className="tabular-nums">
              {r.id} · {r.name}
            </span>
            <span className="tabular-nums">{money(r.amount)}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
            Date sent
          </span>
          <input type="date" name="sent" defaultValue={run.due} className={FIELD} />
        </label>
        <Submit label="Log this run" />
      </div>

      <label className="mt-3 flex items-start gap-2 text-xs text-slate-600">
        <input type="checkbox" name="confirmed" value="yes" className="mt-0.5" />
        <span>
          The money has actually gone out. Participants will see these as Paid within 30
          minutes.
        </span>
      </label>

      <Result result={result} />
    </form>
  );
}

/* ---------------- initiated flag ---------------- */

function InitiatedFlag({ state }: { state: AdminState }) {
  const [markResult, markAction] = useActionState<ActionResult | null, FormData>(
    markInitiatedAction,
    null
  );
  const [clearResult, clearAction] = useActionState<ActionResult | null, FormData>(
    clearInitiatedAction,
    null
  );
  return (
    <>
      <p className="mb-3 text-sm text-slate-600">
        {state.initiatedCount > 0 ? (
          <>
            <strong className="font-semibold text-ink">
              {state.initiatedCount} payment{state.initiatedCount === 1 ? "" : "s"}
            </strong>{" "}
            currently show as &ldquo;Payment initiated&rdquo; to participants.
          </>
        ) : (
          <>
            Nothing is flagged. Payments read Due or Overdue from their date alone.
          </>
        )}
      </p>

      <form action={markAction} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
            Sent on
          </span>
          <input type="date" name="date" defaultValue={state.today} className={FIELD} />
        </label>
        <Submit label="Mark initiated" />
      </form>
      <Result result={markResult} />

      {state.initiatedCount > 0 && (
        <>
          <form action={clearAction} className="mt-3">
            <Submit label="Clear the flag" tone="quiet" />
          </form>
          <Result result={clearResult} />
        </>
      )}
    </>
  );
}

/* ---------------- capital returns ---------------- */

function CapitalReturn({ row, today }: { row: AdminState["awaitingCapital"][number]; today: string }) {
  const [result, action] = useActionState<ActionResult | null, FormData>(
    capitalReturnedAction,
    null
  );
  const overdue = row.returnDue && row.returnDue < today;
  return (
    <form
      action={action}
      className={`rounded-md border p-4 ${overdue ? "border-red-200 bg-red-50/50" : "border-slate-200"}`}
    >
      <input type="hidden" name="id" value={row.id} />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-bold text-ink">
          {row.id} · {row.name}
        </p>
        <p className="text-sm font-bold tabular-nums text-ink">{money(row.capital)}</p>
      </div>
      <p className={`mt-0.5 text-xs ${overdue ? "font-semibold text-red-700" : "text-slate-500"}`}>
        Repaid {formatDate(row.payoff)} · capital due back {formatDate(row.returnDue)}
        {overdue ? " — overdue" : ""}
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
            Returned on
          </span>
          <input type="date" name="date" defaultValue={today} className={FIELD} />
        </label>
        <Submit label="Record returned" />
      </div>
      <Result result={result} />
    </form>
  );
}

/* ---------------- payoff ---------------- */

function MarkPaidOff({ today }: { today: string }) {
  const [result, action] = useActionState<ActionResult | null, FormData>(markPaidOffAction, null);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
          Loan ID
        </span>
        <input
          type="text"
          name="key"
          placeholder="130638"
          className={`${FIELD} w-36 tabular-nums`}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
          Repaid on
        </span>
        <input type="date" name="date" defaultValue={today} className={FIELD} />
      </label>
      <Submit label="Mark paid off" />
      <Result result={result} />
    </form>
  );
}

/* ---------------- the panel ---------------- */

export default function AdminActions({ state }: { state: AdminState }) {
  return (
    <section className="mb-8 overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-4">
        <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-ink">Program Actions</h2>
        <p className="mt-1 text-xs text-slate-500">
          Writes straight to the tracker. The same operations are in the spreadsheet&rsquo;s
          Funded Capital menu — either way, one set of rules.
        </p>
      </div>

      <Block
        title="Payment runs"
        description="A run appears here once its due date has passed and it is not in the Payment Log. Paid-off participations are excluded — their payments stopped."
      >
        {state.outstanding.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Check size={15} className="text-emerald-600" />
            Everything that has come due is logged.
          </p>
        ) : (
          <div className="space-y-4">
            {state.outstanding.map((run) => (
              <LogRun key={run.due} run={run} />
            ))}
          </div>
        )}
      </Block>

      <Block
        title="Payment initiated"
        description="Set this when a run leaves the bank but has not settled, so participants see money in flight rather than an overdue payment. Logging the run clears it."
      >
        <InitiatedFlag state={state} />
      </Block>

      {state.awaitingCapital.length > 0 && (
        <Block
          title="Capital to return"
          description="Early payoffs where the contribution has not gone back yet. Ten business days from the payoff date."
        >
          <div className="space-y-4">
            {state.awaitingCapital.map((row) => (
              <CapitalReturn key={row.id} row={row} today={state.today} />
            ))}
          </div>
        </Block>
      )}

      <Block
        title="Mark a loan paid off"
        description="Use the LOAN id, not the participation id — one loan can back several participations, sometimes for different people, and all of them must stop together."
      >
        <MarkPaidOff today={state.today} />
      </Block>

      <div className="flex items-start gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3 text-[11px] leading-relaxed text-slate-500">
        <Undo2 size={13} className="mt-0.5 shrink-0" />
        <span>
          Every action is safe to repeat — a payment already in the log is never written twice.
          To undo one, remove the row in the tracker; the portal follows within 30 minutes.
        </span>
      </div>
    </section>
  );
}
