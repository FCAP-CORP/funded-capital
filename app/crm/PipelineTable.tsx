"use client";

import DataTable, { type Column } from "./DataTable";
import { StageSelect, InlineText } from "./Editable";
import { setStage, setApplicationNotes } from "./actions";
import type { PipelineRow } from "@/lib/db/queries";
import {
  STAGE_LABEL, PRODUCT_LABEL, SOURCE_LABEL, label,
  money, percent, shortDate, daysSince, ageLabel, displayPhone,
} from "@/lib/crm/view";

/**
 * The pipeline grid — the screen that replaces the spreadsheet.
 *
 * Column choice is the whole design. What an originator needs at a glance is:
 * who, where in the pipeline, how much, how levered, and HOW LONG IT HAS SAT.
 * The last one is the column the old sheet never had, and it is the one that
 * decides what to work on today.
 */
export default function PipelineTable({ rows }: { rows: PipelineRow[] }) {
  const columns: Column<PipelineRow>[] = [
    {
      key: "name",
      header: "Borrower",
      width: "16rem",
      render: (r) => (
        <div className="min-w-0">
          <p className="font-medium text-navy-900 truncate">{r.name}</p>
          <p className="text-xs text-slate-500 truncate">
            {r.email ? (
              <a href={`mailto:${r.email}`} className="hover:text-gold-600 transition-colors">{r.email}</a>
            ) : r.phone ? (
              <a href={`tel:${r.phone}`} className="hover:text-gold-600 transition-colors">{displayPhone(r.phone)}</a>
            ) : (
              <span className="text-slate-300">no contact details</span>
            )}
          </p>
        </div>
      ),
    },
    {
      key: "stage",
      header: "Stage",
      width: "15rem",
      render: (r) => <StageSelect applicationId={r.id} stage={r.stage} onSave={setStage} />,
    },
    {
      key: "stageEnteredAt",
      header: "In stage",
      width: "7rem",
      render: (r) => {
        const d = daysSince(r.stageEnteredAt);
        // 30 days in one stage is the threshold at which a file is stalled
        // rather than progressing. Colour is the only thing that makes a
        // hundred-row grid scannable.
        const tone =
          d === null ? "text-slate-300"
            : d >= 30 ? "text-red-600 font-medium"
              : d >= 14 ? "text-amber-600"
                : "text-slate-600";
        return <span className={tone}>{ageLabel(d)}</span>;
      },
    },
    { key: "product", header: "Product", width: "8rem", render: (r) => label(PRODUCT_LABEL, r.product) },
    {
      key: "requestedAmount",
      header: "Amount",
      width: "8rem",
      align: "right",
      render: (r) => <span className="font-medium text-navy-900">{money(r.requestedAmount)}</span>,
    },
    {
      key: "bindingRatio",
      header: "Leverage",
      width: "8rem",
      align: "right",
      render: (r) => {
        // Show the ratio that actually constrains the deal, named, rather than
        // three numbers the reader has to compare in their head.
        const binding = r.bindingRatio;
        const value = binding === "ltarv" ? r.ltarv : binding === "ltc" ? r.ltc : null;
        if (!binding || value === null) return <span className="text-slate-300">—</span>;
        return (
          <span>
            {percent(value)}
            <span className="ml-1 text-[10px] uppercase tracking-wide text-slate-400">{binding}</span>
          </span>
        );
      },
    },
    {
      key: "propertyAddress",
      header: "Property",
      width: "13rem",
      render: (r) => (
        <span className="text-slate-600 truncate block" title={r.propertyAddress ?? ""}>
          {r.propertyAddress || <span className="text-slate-300">—</span>}
        </span>
      ),
    },
    {
      key: "leadSource",
      header: "Source",
      width: "8rem",
      render: (r) => (
        <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
          {label(SOURCE_LABEL, r.leadSource)}
        </span>
      ),
    },
    {
      key: "submittedAt",
      header: "Received",
      width: "7.5rem",
      render: (r) => <span className="text-slate-500">{shortDate(r.submittedAt)}</span>,
    },
    {
      key: "notes",
      header: "Notes",
      width: "16rem",
      sortable: false,
      render: (r) => (
        <div className="space-y-1">
          <InlineText
            id={r.id}
            initial={r.notes}
            placeholder="Add a note…"
            multiline
            onSave={(id, _field, value) => setApplicationNotes(id, value)}
          />
          {r.borrowerMessage && (
            // Verbatim from the borrower, never edited here — it is the single
            // best predictor of whether the deal is real.
            <p className="text-[11px] italic text-slate-400 line-clamp-2" title={r.borrowerMessage}>
              “{r.borrowerMessage}”
            </p>
          )}
        </div>
      ),
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(r) => r.id}
      searchFields={["name", "email", "phone", "propertyAddress", "notes", "borrowerMessage"]}
      searchPlaceholder="Search name, email, phone, address or notes…"
      facet={{ key: "stage", labels: STAGE_LABEL }}
      initialSort={{ key: "submittedAt", dir: "desc" }}
      emptyMessage="No applications yet."
    />
  );
}
