"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import DataTable, { type BulkContext, type Column } from "./DataTable";
import { StageSelect, InlineText } from "./Editable";
import LastContact from "./LastContact";
import { RecordLink } from "./_record/RecordCardProvider";
import { ConfirmFundedDialog, LostReasonDialog } from "./StageDialogs";
import { markLost, setStage, setApplicationNotes } from "./actions";
import type { PipelineRow } from "@/lib/db/queries";
import { dropIntent } from "@/lib/crm/board";
import { BULK_MOVE_MAX, bulkMoveSummary, planBulkMove, type BulkFailure } from "@/lib/crm/tableView";
import {
  STAGE_LABEL, STAGE_ORDER, PRODUCT_LABEL, SOURCE_LABEL, label,
  money, percent, shortDate, daysSince, ageLabel, displayPhone,
} from "@/lib/crm/view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { LENSES, LENS_LABEL, inLens, lensCounts, parseLens, effectiveLastContact, type Lens } from "@/lib/crm/pipelineLens";
import { cn } from "@/lib/utils";

/**
 * Every action on this page refreshes THIS page and no other (see CrmRoute in
 * ./actions.ts). The single-row edits used to rely on the actions' "/crm"
 * default; they now say so, the same way the board and the dashboard do.
 */
const HERE = "/crm" as const;

type Result = { ok: true } | { ok: false; error: string };

/**
 * A pending question. The dialogs resolve a promise, so the stage dropdown and
 * the bulk bar can both `await` the answer in the middle of an ordinary save.
 */
type Ask =
  | { kind: "funded"; rows: PipelineRow[]; resolve: (ok: boolean) => void }
  | { kind: "lost"; rows: PipelineRow[]; resolve: (answer: { choice: string; note: string } | null) => void };

/** "", not a message: a cancelled question snaps the dropdown back without an error icon. */
const CANCELLED: Result = { ok: false, error: "" };

const isoDay = (v: string | null) => (v ? v.slice(0, 10) : "");

/**
 * The pipeline grid — the screen that replaces the spreadsheet.
 *
 * Column choice is the whole design. What an originator needs at a glance is:
 * who, where in the pipeline, how much, how levered, and HOW LONG IT HAS SAT.
 * The last one is the column the old sheet never had, and it is the one that
 * decides what to work on today.
 *
 * STAGE CHANGES FOLLOW THE BOARD'S RULES NOW, from the dropdown as well as in
 * bulk: Funded asks first and Closed – Lost asks why (lib/crm/board.ts,
 * `dropIntent`). Until this change the table's dropdown could close a deal
 * without a reason — the gap noted in CLAUDE.md — and it was the only way in
 * the product to do so.
 */
export default function PipelineTable({ rows: allRows }: { rows: PipelineRow[] }) {
  const [ask, setAsk] = useState<Ask | null>(null);

  /*
   * Which deals: All / Broker deals / Website / BiggerPockets / Other
   * (10 Oct 2026 — "is there a way to see all broker leads in one section?").
   * `?view=broker` opens straight onto it, so /crm/brokers can link here; the
   * address keeps the choice so a refresh or a shared link lands in the same
   * place. Read after mount, like the table's saved views, so the server's
   * HTML and the first paint agree.
   */
  const [lens, setLens] = useState<Lens>("all");
  useEffect(() => {
    try { setLens(parseLens(new URLSearchParams(window.location.search).get("view"))); } catch { /* no URL */ }
  }, []);
  const chooseLens = (next: Lens) => {
    setLens(next);
    try {
      const u = new URL(window.location.href);
      if (next === "all") u.searchParams.delete("view"); else u.searchParams.set("view", next);
      window.history.replaceState(window.history.state, "", u.toString());
    } catch { /* the filter still works without the address */ }
  };
  const counts = useMemo(() => lensCounts(allRows), [allRows]);
  const rows = useMemo(() => allRows.filter((r) => inLens(r, lens)), [allRows, lens]);

  const askFunded = (list: PipelineRow[]) =>
    new Promise<boolean>((resolve) => setAsk({ kind: "funded", rows: list, resolve }));
  const askLost = (list: PipelineRow[]) =>
    new Promise<{ choice: string; note: string } | null>((resolve) => setAsk({ kind: "lost", rows: list, resolve }));

  async function saveStage(row: PipelineRow, to: string): Promise<Result> {
    const intent = dropIntent(row.stage, to).kind;
    if (intent === "confirm_funded") {
      if (!(await askFunded([row]))) return CANCELLED;
      return setStage(row.id, to, HERE);
    }
    if (intent === "needs_reason") {
      const answer = await askLost([row]);
      if (!answer) return CANCELLED;
      return markLost(row.id, answer.choice, answer.note, HERE);
    }
    return setStage(row.id, to, HERE);
  }

  const columns: Column<PipelineRow>[] = [
    {
      key: "name",
      header: "Borrower",
      size: 256,
      minSize: 160,
      render: (r) => (
        <div className="min-w-0">
          {/* Opens the record card over the grid — everything about the deal in one place. */}
          <RecordLink
            applicationId={r.id}
            label={`Open the full record for ${r.name}`}
            className="block truncate rounded-sm font-semibold text-navy-900 underline decoration-slate-300 underline-offset-2 hover:decoration-gold-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-700"
          >
            {r.name}
          </RecordLink>
          <p className="truncate text-xs text-slate-600">
            {r.email ? (
              <a href={`mailto:${r.email}`} className="hover:text-navy-900 hover:underline">{r.email}</a>
            ) : r.phone ? (
              <a href={`tel:${r.phone}`} className="hover:text-navy-900 hover:underline">{displayPhone(r.phone)}</a>
            ) : (
              <span className="text-slate-500">no contact details</span>
            )}
          </p>
          {r.viaBroker && (r.brokerName || r.brokerFirm) && (
            <p className="truncate text-xs text-slate-600" title="Submitted through a broker">
              via <span className="font-medium text-navy-900">{r.brokerName ?? "a broker"}</span>
              {r.brokerFirm ? ` · ${r.brokerFirm}` : ""}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "stage",
      header: "Stage",
      size: 240,
      minSize: 180,
      csv: (r) => label(STAGE_LABEL, r.stage),
      render: (r) => <StageSelect applicationId={r.id} stage={r.stage} onSave={(_id, to) => saveStage(r, to)} />,
    },
    {
      key: "stageEnteredAt",
      header: "In stage",
      size: 112,
      csv: (r) => daysSince(r.stageEnteredAt) ?? "",
      render: (r) => {
        const d = daysSince(r.stageEnteredAt);
        // 30 days in one stage is the threshold at which a file is stalled
        // rather than progressing. Colour is the only thing that makes a
        // hundred-row grid scannable — and the word "stalled" is there too,
        // for anyone who cannot see the colour.
        const tone =
          d === null ? "text-slate-500"
            : d >= 30 ? "font-semibold text-red-700"
              : d >= 14 ? "text-amber-700"
                : "text-slate-700";
        return (
          <span className={tone}>
            {ageLabel(d)}
            {d !== null && d >= 30 && <span className="sr-only"> (stalled)</span>}
          </span>
        );
      },
    },
    {
      key: "lastContactAt",
      header: "Last contact",
      size: 144,
      csv: (r) => isoDay(effectiveLastContact(r).at),
      // On a broker's deal, contact with the broker counts — labelled "broker".
      render: (r) => {
        const e = effectiveLastContact(r);
        return <LastContact at={e.at} direction={e.direction} viaBroker={e.viaBroker} />;
      },
    },
    { key: "product", header: "Product", size: 128, csv: (r) => label(PRODUCT_LABEL, r.product), render: (r) => label(PRODUCT_LABEL, r.product) },
    {
      key: "requestedAmount",
      header: "Amount",
      size: 128,
      align: "right",
      csv: (r) => (r.requestedAmount === null ? "" : Number(r.requestedAmount)),
      render: (r) => <span className="font-semibold text-navy-900">{money(r.requestedAmount)}</span>,
    },
    {
      key: "bindingRatio",
      header: "Leverage",
      size: 128,
      align: "right",
      csv: (r) => {
        const v = r.bindingRatio === "ltarv" ? r.ltarv : r.bindingRatio === "ltc" ? r.ltc : null;
        if (!r.bindingRatio || v === null) return "";
        return Number(v) > 1 ? "n/a (incomplete)" : `${percent(v)} ${r.bindingRatio.toUpperCase()}`;
      },
      render: (r) => {
        // Show the ratio that actually constrains the deal, named, rather than
        // three numbers the reader has to compare in their head.
        const binding = r.bindingRatio;
        const value = binding === "ltarv" ? r.ltarv : binding === "ltc" ? r.ltc : null;
        if (!binding || value === null) return <span className="text-slate-500">—</span>;

        /**
         * Above 100% is not leverage, it is missing data.
         *
         * Neither web form asks for a rehab budget, so LTC is computed as
         * loan / purchase price alone. On any fix & flip where the loan also
         * funds the rehab, that prints a ratio well over 100% — 136.8% on the
         * first row of this grid. The arithmetic is right; the input is
         * incomplete. Showing it as a confident number invites someone to
         * decline a perfectly normal deal, so it is marked as unusable instead.
         */
        const num = Number(value);
        if (Number.isFinite(num) && num > 1) {
          return (
            <span
              className="text-amber-700"
              title="Over 100% — the rehab budget was never captured, so this is loan ÷ purchase price only. Not a usable leverage figure."
            >
              n/a
              <span className="ml-1 text-[10px] uppercase tracking-wide">incomplete</span>
            </span>
          );
        }

        return (
          <span>
            {percent(value)}
            <span className="ml-1 text-[10px] uppercase tracking-wide text-slate-600">{binding}</span>
          </span>
        );
      },
    },
    {
      key: "propertyAddress",
      header: "Property",
      size: 208,
      render: (r) => (
        <span className="block truncate text-slate-700" title={r.propertyAddress ?? ""}>
          {r.propertyAddress || <span className="text-slate-500">—</span>}
        </span>
      ),
    },
    {
      key: "leadSource",
      header: "Source",
      size: 128,
      csv: (r) => label(SOURCE_LABEL, r.leadSource),
      render: (r) => <Badge tone="neutral">{label(SOURCE_LABEL, r.leadSource)}</Badge>,
    },
    {
      key: "submittedAt",
      header: "Received",
      size: 120,
      csv: (r) => isoDay(r.submittedAt),
      render: (r) => <span className="text-slate-600">{shortDate(r.submittedAt)}</span>,
    },
    {
      key: "notes",
      header: "Notes",
      size: 256,
      sortable: false,
      render: (r) => (
        <div className="space-y-0.5">
          <InlineText
            id={r.id}
            initial={r.notes}
            placeholder="Add a note…"
            multiline
            compact
            onSave={(id, _field, value) => setApplicationNotes(id, value, HERE)}
          />
          {r.borrowerMessage && (
            // Verbatim from the borrower, never edited here — it is the single
            // best predictor of whether the deal is real.
            <p className="truncate px-2 text-[11px] italic text-slate-600" title={r.borrowerMessage}>
              “{r.borrowerMessage}”
            </p>
          )}
        </div>
      ),
    },
    // Off by default — the Borrower cell already shows them — but exported, so a
    // CSV of the pipeline is a list someone can actually call.
    { key: "email", header: "Email", size: 224, defaultHidden: true, exportWhenHidden: true },
    {
      key: "phone",
      header: "Phone",
      size: 150,
      defaultHidden: true,
      exportWhenHidden: true,
      csv: (r) => (r.phone ? displayPhone(r.phone) : ""),
      render: (r) => (r.phone ? displayPhone(r.phone) : <span className="text-slate-500">—</span>),
    },
    { key: "borrowerMessage", header: "Borrower's message", size: 280, defaultHidden: true, sortable: false },
    // Hidden by default (the "via" line under the name already says it); in the CSV either way.
    {
      key: "brokerName",
      header: "Broker",
      size: 208,
      defaultHidden: true,
      exportWhenHidden: true,
      csv: (r) => [r.brokerName, r.brokerFirm].filter(Boolean).join(" · "),
      render: (r) => (r.brokerName || r.brokerFirm
        ? <span className="block truncate text-slate-700">{[r.brokerName, r.brokerFirm].filter(Boolean).join(" · ")}</span>
        : <span className="text-slate-500">—</span>),
    },
  ];

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Which deals">
        {LENSES.map((l) => {
          const on = lens === l;
          if (l !== "all" && counts[l] === 0) return null;
          return (
            <button
              key={l}
              type="button"
              onClick={() => chooseLens(l)}
              aria-pressed={on}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500",
                on ? "border-navy-900 bg-navy-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300",
              )}
            >
              {LENS_LABEL[l]}
              <span className={cn("tabular-nums text-xs", on ? "text-gold-400" : "text-slate-500")}>{counts[l]}</span>
            </button>
          );
        })}
      </div>
      <DataTable
        tableId="pipeline"
        exportName="pipeline"
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        rowLabel={(r) => r.name}
        searchFields={["name", "email", "phone", "propertyAddress", "notes", "borrowerMessage", "brokerName", "brokerFirm"]}
        searchPlaceholder="Search name, broker, email, phone, address or notes…"
        facet={{ key: "stage", labels: STAGE_LABEL, label: "Filter by stage" }}
        initialSort={{ key: "submittedAt", dir: "desc" }}
        emptyMessage="No applications yet."
        noun={{ one: "deal", many: "deals" }}
        bulkActions={(ctx) => <BulkMove ctx={ctx} askFunded={askFunded} askLost={askLost} />}
      />

      <ConfirmFundedDialog
        open={ask?.kind === "funded"}
        names={ask?.rows.map((r) => r.name) ?? []}
        amount={ask?.rows.reduce((s, r) => s + (Number(r.requestedAmount) || 0), 0)}
        onCancel={() => { if (ask?.kind === "funded") ask.resolve(false); setAsk(null); }}
        onConfirm={() => { if (ask?.kind === "funded") ask.resolve(true); setAsk(null); }}
      />
      <LostReasonDialog
        open={ask?.kind === "lost"}
        names={ask?.rows.map((r) => r.name) ?? []}
        onCancel={() => { if (ask?.kind === "lost") ask.resolve(null); setAsk(null); }}
        onConfirm={(choice, note) => { if (ask?.kind === "lost") ask.resolve({ choice, note }); setAsk(null); }}
      />
    </>
  );
}

/**
 * "Move stage" in the bulk bar.
 *
 * ONE DEAL AT A TIME, THROUGH THE SAME ACTIONS AS A SINGLE EDIT: `setStage`
 * for a move, `markLost` for Closed – Lost. Each writes its own
 * stage_transitions row, exactly as if the dropdown had been used fifty times;
 * there is no second, faster path that could forget the history. The plan —
 * which deals actually move, what to ask first — is lib/crm/tableView.ts's
 * `planBulkMove`, built on the board's `dropIntent`.
 */
function BulkMove({
  ctx, askFunded, askLost,
}: {
  ctx: BulkContext<PipelineRow>;
  askFunded: (rows: PipelineRow[]) => Promise<boolean>;
  askLost: (rows: PipelineRow[]) => Promise<{ choice: string; note: string } | null>;
}) {
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);

  async function run() {
    const plan = planBulkMove(ctx.selected, to);
    if (plan.kind === "invalid") { toast.error(plan.error); return; }
    if (plan.kind === "nothing") {
      toast.info(`All ${plan.skipped} already in ${STAGE_LABEL[to] ?? to}`, "Nothing to move.");
      return;
    }
    const byId = new Map(ctx.selected.map((r) => [r.id, r]));
    const moving = plan.ids.map((id) => byId.get(id)!).filter(Boolean);

    let lost: { choice: string; note: string } | null = null;
    if (plan.ask === "confirm_funded" && !(await askFunded(moving))) return;
    if (plan.ask === "needs_reason") {
      lost = await askLost(moving);
      if (!lost) return;
    }

    const failures: BulkFailure[] = [];
    let moved = 0;
    setBusy({ done: 0, total: moving.length });
    for (const row of moving) {
      let res: Result;
      try {
        res = lost
          ? await markLost(row.id, lost.choice, lost.note, HERE)
          : await setStage(row.id, plan.to, HERE);
      } catch (err) {
        res = { ok: false, error: err instanceof Error ? err.message : "could not reach the server" };
      }
      if (res.ok) moved++;
      else failures.push({ name: row.name, error: res.error });
      setBusy({ done: moved + failures.length, total: moving.length });
    }
    setBusy(null);

    const summary = bulkMoveSummary(plan.to, moved, plan.skipped, failures);
    if (summary.tone === "success") toast.success(summary.title, summary.description);
    else toast.error(summary.title, summary.description);
    if (failures.length === 0) { ctx.clear(); setTo(""); }
  }

  return (
    <>
      <label className="sr-only" htmlFor="bulk-stage">Move the selected deals to</label>
      <Select
        id="bulk-stage"
        selectSize="sm"
        wrapperClassName="w-48"
        value={to}
        disabled={busy !== null}
        onChange={(e) => setTo(e.target.value)}
      >
        <option value="">Move to stage…</option>
        {STAGE_ORDER.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
      </Select>
      <Button
        variant="accent"
        size="sm"
        disabled={!to || busy !== null}
        loading={busy !== null}
        onClick={run}
      >
        {!busy && <ArrowRightLeft size={14} aria-hidden="true" />}
        {busy ? `Moving ${busy.done + 1} of ${busy.total}…` : "Move"}
      </Button>
      {ctx.selected.length > BULK_MOVE_MAX && (
        <span className="text-xs text-slate-300">Up to {BULK_MOVE_MAX} move at a time.</span>
      )}
    </>
  );
}
