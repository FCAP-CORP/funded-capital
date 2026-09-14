"use client";

import DataTable, { type Column } from "../DataTable";
import { InlineText } from "../Editable";
import { setContactField } from "../actions";
import type { ContactRow } from "@/lib/db/queries";
import { SOURCE_LABEL, label, shortDate, displayPhone } from "@/lib/crm/view";

/**
 * Contacts — the book, including the ~96% who have never had an application.
 *
 * That group is the whole reason this screen exists separately from the
 * pipeline. They are not deals and they do not belong in a deal grid, but they
 * are the list every re-engagement campaign is built from.
 */
export default function ContactsTable({ rows }: { rows: ContactRow[] }) {
  const columns: Column<ContactRow>[] = [
    {
      key: "name",
      header: "Name",
      width: "14rem",
      render: (r) => <span className="font-medium text-navy-900">{r.name}</span>,
    },
    {
      key: "email",
      header: "Email",
      width: "16rem",
      render: (r) =>
        r.email
          ? <a href={`mailto:${r.email}`} className="text-slate-600 hover:text-gold-600 transition-colors">{r.email}</a>
          : <span className="text-slate-300">—</span>,
    },
    {
      key: "phone",
      header: "Phone",
      width: "10rem",
      render: (r) => {
        // A number that failed E.164 normalisation is shown as the raw string it
        // arrived as, marked, rather than hidden. Hiding it is how it never gets
        // fixed — and it cannot be texted until it is.
        if (r.phone) {
          return <a href={`tel:${r.phone}`} className="text-slate-600 hover:text-gold-600 transition-colors">{displayPhone(r.phone)}</a>;
        }
        if (r.phoneRaw) {
          return (
            <span className="text-amber-600" title="Could not be normalised — cannot be texted until it is fixed">
              {r.phoneRaw}
            </span>
          );
        }
        return <span className="text-slate-300">—</span>;
      },
    },
    {
      key: "deals",
      header: "Deals",
      width: "5.5rem",
      align: "right",
      render: (r) =>
        r.deals > 0
          ? <span className="font-medium text-navy-900">{r.deals}</span>
          : <span className="text-slate-300">0</span>,
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
      key: "targetMarket",
      header: "Target market",
      width: "12rem",
      sortable: false,
      render: (r) => (
        <InlineText id={r.id} field="targetMarket" initial={r.targetMarket} placeholder="Market…" onSave={setContactField} />
      ),
    },
    {
      key: "createdAt",
      header: "Added",
      width: "7.5rem",
      render: (r) => <span className="text-slate-500">{shortDate(r.createdAt)}</span>,
    },
    {
      key: "notes",
      header: "Notes",
      width: "16rem",
      sortable: false,
      render: (r) => (
        <InlineText id={r.id} field="notes" initial={r.notes} placeholder="Add a note…" multiline onSave={setContactField} />
      ),
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(r) => r.id}
      searchFields={["name", "email", "phone", "phoneRaw", "targetMarket", "state", "notes"]}
      searchPlaceholder="Search name, email, phone or market…"
      facet={{ key: "leadSource", labels: SOURCE_LABEL }}
      initialSort={{ key: "createdAt", dir: "desc" }}
      emptyMessage="No contacts yet."
    />
  );
}
