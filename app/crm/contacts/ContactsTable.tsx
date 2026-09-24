"use client";

import DataTable, { type Column } from "../DataTable";
import { InlineText } from "../Editable";
import LastContact from "../LastContact";
import { setContactField } from "../actions";
import type { ContactRow } from "@/lib/db/queries";
import { SOURCE_LABEL, label, shortDate, displayPhone } from "@/lib/crm/view";
import { Badge } from "@/components/ui/badge";

/**
 * Every action on this page refreshes THIS page and no other (CrmRoute in
 * ../actions.ts). setContactField's default is this route already; it is
 * passed explicitly so the file says what it does.
 */
const HERE = "/crm/contacts" as const;

const isoDay = (v: string | null) => (v ? v.slice(0, 10) : "");

/**
 * Contacts — the book, including the ~96% who have never had an application.
 *
 * That group is the whole reason this screen exists separately from the
 * pipeline. They are not deals and they do not belong in a deal grid, but they
 * are the list every re-engagement campaign is built from — which is why this
 * grid now exports: tick the people (or filter to them) and Export CSV.
 *
 * `?q=` in the address pre-fills the search. The ⌘K palette links a contact
 * here that way, since a contact has no record card of their own yet.
 */
export default function ContactsTable({ rows }: { rows: ContactRow[] }) {
  const columns: Column<ContactRow>[] = [
    {
      key: "name",
      header: "Name",
      size: 224,
      minSize: 140,
      render: (r) => <span className="block truncate font-semibold text-navy-900">{r.name}</span>,
    },
    {
      key: "email",
      header: "Email",
      size: 256,
      // Exported even when hidden: a contact list without emails is not a campaign list.
      exportWhenHidden: true,
      render: (r) =>
        r.email
          ? <a href={`mailto:${r.email}`} className="block truncate text-slate-700 hover:text-navy-900 hover:underline">{r.email}</a>
          : <span className="text-slate-500">—</span>,
    },
    {
      key: "phone",
      header: "Phone",
      size: 160,
      exportWhenHidden: true,
      csv: (r) => (r.phone ? displayPhone(r.phone) : r.phoneRaw ?? ""),
      render: (r) => {
        // A number that failed E.164 normalisation is shown as the raw string it
        // arrived as, marked, rather than hidden. Hiding it is how it never gets
        // fixed — and it cannot be texted until it is.
        if (r.phone) {
          return <a href={`tel:${r.phone}`} className="text-slate-700 hover:text-navy-900 hover:underline">{displayPhone(r.phone)}</a>;
        }
        if (r.phoneRaw) {
          return (
            <span className="text-amber-700" title="Could not be normalised — cannot be texted until it is fixed">
              {r.phoneRaw}
              <span className="sr-only"> (not a valid number yet)</span>
            </span>
          );
        }
        return <span className="text-slate-500">—</span>;
      },
    },
    {
      key: "lastContactAt",
      header: "Last contact",
      size: 144,
      csv: (r) => isoDay(r.lastContactAt),
      render: (r) => <LastContact at={r.lastContactAt} direction={r.lastContactDirection} />,
    },
    {
      key: "deals",
      header: "Deals",
      size: 88,
      align: "right",
      render: (r) =>
        r.deals > 0
          ? <span className="font-semibold text-navy-900">{r.deals}</span>
          : <span className="text-slate-500">0</span>,
    },
    {
      key: "leadSource",
      header: "Source",
      size: 128,
      csv: (r) => label(SOURCE_LABEL, r.leadSource),
      render: (r) => <Badge tone="neutral">{label(SOURCE_LABEL, r.leadSource)}</Badge>,
    },
    {
      key: "targetMarket",
      header: "Target market",
      size: 192,
      sortable: false,
      render: (r) => (
        <InlineText
          id={r.id}
          field="targetMarket"
          initial={r.targetMarket}
          placeholder="Market…"
          onSave={(id, field, value) => setContactField(id, field, value, HERE)}
        />
      ),
    },
    {
      key: "createdAt",
      header: "Added",
      size: 120,
      csv: (r) => isoDay(r.createdAt),
      render: (r) => <span className="text-slate-600">{shortDate(r.createdAt)}</span>,
    },
    {
      key: "notes",
      header: "Notes",
      size: 256,
      sortable: false,
      render: (r) => (
        <InlineText
          id={r.id}
          field="notes"
          initial={r.notes}
          placeholder="Add a note…"
          multiline
          onSave={(id, field, value) => setContactField(id, field, value, HERE)}
        />
      ),
    },
    { key: "state", header: "State", size: 88, defaultHidden: true },
    { key: "creditBand", header: "Credit band", size: 120, defaultHidden: true },
    // Tags are an array; a CSV cell gets them joined, the grid does not show them yet.
    { key: "tags", header: "Tags", size: 160, defaultHidden: true, sortable: false, csv: (r) => r.tags.join("; "), render: (r) => r.tags.join(", ") || <span className="text-slate-500">—</span> },
  ];

  return (
    <DataTable
      tableId="contacts"
      exportName="contacts"
      rows={rows}
      columns={columns}
      rowKey={(r) => r.id}
      rowLabel={(r) => r.name}
      searchFields={["name", "email", "phone", "phoneRaw", "targetMarket", "state", "notes"]}
      searchPlaceholder="Search name, email, phone or market…"
      facet={{ key: "leadSource", labels: SOURCE_LABEL, label: "Filter by source" }}
      initialSort={{ key: "createdAt", dir: "desc" }}
      emptyMessage="No contacts yet."
      noun={{ one: "contact", many: "contacts" }}
      queryFromUrl
    />
  );
}
