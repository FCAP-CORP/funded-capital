"use client";

import { useMemo, useState, useId } from "react";
import { ArrowDown, ArrowUp, Search, X } from "lucide-react";
import { matchesSearch, sortRows, facetCounts, type SortDir } from "@/lib/crm/view";

/**
 * The CRM grid.
 *
 * Rows arrive hydrated from the server and all filtering, sorting and paging
 * happens in the browser. At this book size — hundreds of rows, not millions —
 * that is the right trade: every interaction is instant with no round trip, and
 * the sort logic is the pure, tested code in lib/crm/view.ts rather than a
 * different SQL ORDER BY for every column.
 *
 * If the book grows past a few thousand rows this becomes server-side paging.
 * That is a swap of this component's internals, not of its interface.
 */

export interface Column<T> {
  key: Extract<keyof T, string>;
  header: string;
  /** Any valid CSS width; omit to let the content size it. */
  width?: string;
  align?: "left" | "right";
  /** Custom cell. Omit for the raw value with an em-dash fallback. */
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
}

interface Props<T extends Record<string, unknown>> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  searchFields: Extract<keyof T, string>[];
  searchPlaceholder?: string;
  facet?: { key: Extract<keyof T, string>; labels?: Record<string, string> };
  initialSort?: { key: Extract<keyof T, string>; dir: SortDir };
  pageSize?: number;
  emptyMessage?: string;
}

export default function DataTable<T extends Record<string, unknown>>({
  rows, columns, rowKey, searchFields, searchPlaceholder = "Search…",
  facet, initialSort, pageSize = 50, emptyMessage = "Nothing here yet.",
}: Props<T>) {
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<Extract<keyof T, string> | null>(initialSort?.key ?? null);
  const [sortDir, setSortDir] = useState<SortDir>(initialSort?.dir ?? "desc");
  const [page, setPage] = useState(0);

  const facets = useMemo(
    () => (facet ? facetCounts(rows, facet.key) : []),
    [rows, facet],
  );

  const filtered = useMemo(() => {
    let out = rows;
    if (facet && active) {
      out = out.filter((r) => {
        const v = r[facet.key];
        const s = v === null || v === undefined || v === "" ? "unknown" : String(v);
        return s === active;
      });
    }
    if (query.trim()) out = out.filter((r) => matchesSearch(r, query, searchFields));
    return sortRows(out, sortKey, sortDir);
  }, [rows, query, active, sortKey, sortDir, facet, searchFields]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const visible = filtered.slice(current * pageSize, current * pageSize + pageSize);

  function toggleSort(key: Extract<keyof T, string>) {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
    setPage(0);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="relative flex-1 min-w-0">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" aria-hidden="true" />
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(0); }}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="form-input w-full pl-9"
          />
        </div>
        <p className="text-sm text-slate-500 tabular-nums whitespace-nowrap">
          {filtered.length === rows.length
            ? `${rows.length} total`
            : `${filtered.length} of ${rows.length}`}
        </p>
      </div>

      {facet && facets.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {facets.map((f) => {
            const on = active === f.value;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => { setActive(on ? null : f.value); setPage(0); }}
                aria-pressed={on}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  on
                    ? "border-navy-900 bg-navy-900 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                {facet.labels?.[f.value] ?? f.value}
                <span className={`tabular-nums ${on ? "text-slate-300" : "text-slate-400"}`}>{f.count}</span>
                {on && <X size={12} aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}

      {/* Grid */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              {columns.map((c) => {
                const sorted = sortKey === c.key;
                const sortable = c.sortable !== false;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    style={c.width ? { width: c.width } : undefined}
                    aria-sort={sorted ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                    className={`px-3 py-2.5 font-semibold text-[11px] uppercase tracking-wider text-slate-500 ${
                      c.align === "right" ? "text-right" : "text-left"
                    }`}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        className={`inline-flex items-center gap-1 hover:text-navy-900 transition-colors ${
                          c.align === "right" ? "flex-row-reverse" : ""
                        } ${sorted ? "text-navy-900" : ""}`}
                      >
                        {c.header}
                        {sorted && (sortDir === "asc"
                          ? <ArrowUp size={12} aria-hidden="true" />
                          : <ArrowDown size={12} aria-hidden="true" />)}
                      </button>
                    ) : c.header}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-10 text-center text-slate-500">
                  {query || active ? "Nothing matches that filter." : emptyMessage}
                </td>
              </tr>
            )}
            {visible.map((row) => (
              <tr key={rowKey(row)} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70 transition-colors">
                {columns.map((c) => {
                  const raw = row[c.key];
                  return (
                    <td
                      key={c.key}
                      className={`px-3 py-2.5 align-top ${
                        c.align === "right" ? "text-right tabular-nums" : "text-left"
                      }`}
                    >
                      {c.render
                        ? c.render(row)
                        : raw === null || raw === undefined || raw === ""
                          ? <span className="text-slate-300">—</span>
                          : String(raw)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-slate-500 tabular-nums">
            {current * pageSize + 1}–{Math.min((current + 1) * pageSize, filtered.length)} of {filtered.length}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage(current - 1)}
              disabled={current === 0}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 disabled:opacity-40 hover:border-slate-300 transition-colors"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage(current + 1)}
              disabled={current >= pageCount - 1}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 disabled:opacity-40 hover:border-slate-300 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
