"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnSizingState,
  type RowSelectionState,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  ArrowDown, ArrowUp, ArrowUpDown, Bookmark, ChevronLeft, ChevronRight, Columns3, Download, RotateCcw,
  Search, Trash2, X,
} from "lucide-react";
import { matchesSearch, sortRows, facetCounts, type SortDir } from "@/lib/crm/view";
import {
  PAGE_SIZES, clampWidth, csvFileName, defaultViewState, normaliseViewState, pageRangeLabel, parseViewName,
  parseViews, removeView, sameViewState, serialiseViews, toCsv, upsertView,
  type SavedView, type TableShape, type TableViewState,
} from "@/lib/crm/tableView";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, Label, Select } from "@/components/ui/field";
import { Dialog } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { FOCUS_RING } from "@/components/ui/focus";
import { toast } from "@/components/ui/toast";

/**
 * The CRM grid, on TanStack Table.
 *
 * WHAT TANSTACK DOES AND WHAT IT DOES NOT. TanStack Table is "headless": it
 * keeps the grid's state — which columns are visible, how wide each is, which
 * rows are ticked, which page is showing — and renders nothing itself. Every
 * pixel below is ours. Filtering and sorting stay in lib/crm/view.ts
 * (`matchesSearch`, `sortRows`), which are pure and tested: TanStack's own
 * sort flips its comparator for a descending sort, which would float empty
 * values to the TOP of a descending column — the classic "sort by amount and
 * get a screen of blanks" bug that `compareValues` exists to prevent. So the
 * table is told the rows arrive already filtered and sorted.
 *
 * Rows arrive hydrated from the server and everything happens in the browser.
 * At this book size — hundreds of rows, ~700 contacts — that is the right
 * trade: every interaction is instant with no round trip. Paging (50 by
 * default, up to 200) keeps the DOM at a few hundred rows however large the
 * book gets, which is what keeps 700+ contacts smooth; past a few thousand
 * rows this becomes server-side paging, a swap of internals, not interface.
 *
 * WHAT IS NEW, AND WHERE IT LIVES:
 *   - column show/hide and drag-to-resize (keyboard too: focus a column edge,
 *     then Left/Right), remembered per browser;
 *   - sticky header and a sticky name column while scrolling either way;
 *   - row selection with a bulk bar (the page supplies the bulk actions);
 *   - Export CSV of the selected rows, or of everything the filter shows —
 *     escaped and formula-injection-guarded by lib/crm/tableView.ts;
 *   - saved views ("My open term sheets") in localStorage. Every read of
 *     localStorage is wrapped: a private window or blocked storage just means
 *     no saved views, never a broken table.
 */

export interface Column<T> {
  key: Extract<keyof T, string>;
  header: string;
  /** Starting width in pixels. The person can drag it wider or narrower. */
  size?: number;
  minSize?: number;
  align?: "left" | "right";
  /** Custom cell. Omit for the raw value with an em-dash fallback. */
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  /** Can be switched off in the Columns menu. The first column never can. */
  hideable?: boolean;
  defaultHidden?: boolean;
  /** The value exported to CSV. Omit for the raw field; `false` to leave the column out of exports. */
  csv?: ((row: T) => unknown) | false;
  /** Export this column even while it is hidden (an email address the name cell already shows). */
  exportWhenHidden?: boolean;
}

export type BulkContext<T> = { selected: T[]; clear: () => void };

interface Props<T extends Record<string, unknown>> {
  /** Names this table's saved views and remembered layout in localStorage. */
  tableId: string;
  /** Base of the CSV file name: "pipeline" → pipeline-2026-09-24.csv */
  exportName: string;
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  /** How a row is named to a screen reader ("Select Marcus Rivera"). */
  rowLabel?: (row: T) => string;
  searchFields: Extract<keyof T, string>[];
  searchPlaceholder?: string;
  facet?: { key: Extract<keyof T, string>; labels?: Record<string, string>; label?: string };
  initialSort?: { key: Extract<keyof T, string>; dir: SortDir };
  pageSize?: number;
  emptyMessage?: string;
  noun?: { one: string; many: string };
  /** Actions for the ticked rows, drawn in the bulk bar. */
  bulkActions?: (ctx: BulkContext<T>) => React.ReactNode;
  /** Read `?q=` from the address on first load (the ⌘K palette links here that way). */
  queryFromUrl?: boolean;
}

const SELECT_COL = "__select";
const SELECT_WIDTH = 44;

function readStorage(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* storage full, blocked, or a private window: the table still works, it just forgets */
  }
}

function downloadCsv(name: string, csv: string): void {
  // The byte-order mark makes Excel read the file as UTF-8 (accents, em dashes).
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export default function DataTable<T extends Record<string, unknown>>({
  tableId, exportName, rows, columns, rowKey, rowLabel, searchFields, searchPlaceholder = "Search…",
  facet, initialSort, pageSize: defaultPageSize = 50, emptyMessage = "Nothing here yet.",
  noun = { one: "row", many: "rows" }, bulkActions, queryFromUrl = false,
}: Props<T>) {
  const searchId = useId();
  const firstKey = columns[0]?.key as string;

  /* ---------------------------------------------------------------- shape */
  const shape: TableShape = useMemo(() => ({
    columns: columns.map((c) => c.key as string),
    sortable: columns.filter((c) => c.sortable !== false).map((c) => c.key as string),
    locked: [firstKey],
    defaultSort: initialSort ? { key: initialSort.key, dir: initialSort.dir } : null,
    defaultPageSize,
  }), [columns, firstKey, initialSort, defaultPageSize]);

  const defaultHidden = useMemo(
    () => columns.filter((c) => c.defaultHidden && c.key !== firstKey).map((c) => c.key as string),
    [columns, firstKey],
  );
  const baseState: TableViewState = useMemo(
    () => ({ ...defaultViewState(shape), hidden: defaultHidden }),
    [shape, defaultHidden],
  );

  /* ---------------------------------------------------------------- state */
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const [sort, setSort] = useState<TableViewState["sort"]>(baseState.sort);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: baseState.pageSize });
  const [visibility, setVisibility] = useState<VisibilityState>(() => Object.fromEntries(defaultHidden.map((k) => [k, false])));
  const [sizing, setSizing] = useState<ColumnSizingState>({});
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [views, setViews] = useState<SavedView[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [restored, setRestored] = useState(false);

  const viewsKey = `fc.crm.table.${tableId}.views`;
  const layoutKey = `fc.crm.table.${tableId}.layout`;

  const current: TableViewState = useMemo(() => ({
    query,
    facet: active,
    sort,
    hidden: Object.entries(visibility).filter(([, v]) => v === false).map(([k]) => k),
    sizes: Object.fromEntries(Object.entries(sizing).map(([k, v]) => [k, Math.round(v)])),
    pageSize: pagination.pageSize,
  }), [query, active, sort, visibility, sizing, pagination.pageSize]);

  const applyState = useCallback((s: TableViewState) => {
    setQuery(s.query);
    setActive(s.facet);
    setSort(s.sort);
    setVisibility(Object.fromEntries(s.hidden.map((k) => [k, false])));
    setSizing(s.sizes);
    setPagination({ pageIndex: 0, pageSize: s.pageSize });
  }, []);

  // Restore after mount — reading storage during render would make the
  // server's HTML and the browser's first paint disagree.
  useEffect(() => {
    setViews(parseViews(readStorage(viewsKey), shape));
    const raw = readStorage(layoutKey);
    if (raw) {
      try {
        const layout = normaliseViewState({ ...JSON.parse(raw), query: "", facet: null }, shape);
        setVisibility(Object.fromEntries(layout.hidden.map((k) => [k, false])));
        setSizing(layout.sizes);
        setPagination((p) => ({ ...p, pageSize: layout.pageSize }));
      } catch { /* unreadable layout: keep the defaults */ }
    }
    if (queryFromUrl) {
      try {
        const q = new URLSearchParams(window.location.search).get("q");
        if (q) setQuery(q.slice(0, 200));
      } catch { /* no URL to read */ }
    }
    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The layout (columns, widths, page size) is remembered automatically;
  // filters are not — coming back to a filtered table you forgot about is
  // how people conclude that deals have vanished. Filters live in saved views.
  useEffect(() => {
    if (!restored) return;
    writeStorage(layoutKey, JSON.stringify({ hidden: current.hidden, sizes: current.sizes, pageSize: current.pageSize }));
  }, [restored, layoutKey, current.hidden, current.sizes, current.pageSize]);

  /* ------------------------------------------------------ filter and sort */
  const facets = useMemo(() => (facet ? facetCounts(rows, facet.key) : []), [rows, facet]);

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
    return sortRows(out, (sort?.key ?? null) as keyof T | null, sort?.dir ?? "desc");
  }, [rows, query, active, sort, facet, searchFields]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pagination.pageSize));
  // A filter that shrinks the list must not strand you on page 9 of 2.
  useEffect(() => {
    if (pagination.pageIndex > pageCount - 1) setPagination((p) => ({ ...p, pageIndex: pageCount - 1 }));
  }, [pageCount, pagination.pageIndex]);

  /* -------------------------------------------------------------- columns */
  const byKey = useMemo(() => new Map(columns.map((c) => [c.key as string, c])), [columns]);

  const tanColumns = useMemo<ColumnDef<T>[]>(() => {
    const cols: ColumnDef<T>[] = [];
    cols.push({ id: SELECT_COL, size: SELECT_WIDTH, minSize: SELECT_WIDTH, maxSize: SELECT_WIDTH, enableResizing: false, enableHiding: false });
    for (const c of columns) {
      cols.push({
        id: c.key,
        accessorFn: (r) => r[c.key],
        size: c.size ?? 160,
        minSize: c.minSize ?? 72,
        maxSize: 640,
        enableHiding: c.key !== firstKey && c.hideable !== false,
      });
    }
    return cols;
  }, [columns, firstKey]);

  const table = useReactTable({
    data: filtered,
    columns: tanColumns,
    getRowId: (r) => rowKey(r),
    state: { columnVisibility: visibility, columnSizing: sizing, rowSelection: selection, pagination },
    onColumnVisibilityChange: setVisibility,
    onColumnSizingChange: setSizing,
    onRowSelectionChange: setSelection,
    onPaginationChange: setPagination,
    enableRowSelection: true,
    enableColumnResizing: true,
    columnResizeMode: "onChange",
    manualSorting: true,
    manualFiltering: true,
    autoResetPageIndex: false,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  /* ------------------------------------------------------------ selection */
  const selectedRows = useMemo(() => rows.filter((r) => selection[rowKey(r)]), [rows, selection, rowKey]);
  const selectedCount = selectedRows.length;
  const hiddenSelected = useMemo(() => {
    const shown = new Set(filtered.map(rowKey));
    return selectedRows.filter((r) => !shown.has(rowKey(r))).length;
  }, [filtered, selectedRows, rowKey]);
  const clearSelection = useCallback(() => setSelection({}), []);
  const selectAllMatching = () => setSelection(Object.fromEntries(filtered.map((r) => [rowKey(r), true])));

  const pageRows = table.getRowModel().rows;
  const pageAll = pageRows.length > 0 && pageRows.every((r) => r.getIsSelected());
  const pageSome = !pageAll && pageRows.some((r) => r.getIsSelected());
  const headerBox = useRef<HTMLInputElement>(null);
  useEffect(() => { if (headerBox.current) headerBox.current.indeterminate = pageSome; }, [pageSome]);

  /* --------------------------------------------------------------- export */
  function exportCsv() {
    const source = selectedCount > 0 ? selectedRows : filtered;
    // Visible columns, in the order on screen, plus any marked exportWhenHidden.
    const cols = table
      .getAllLeafColumns()
      .filter((tc) => tc.getIsVisible() || byKey.get(tc.id)?.exportWhenHidden)
      .map((tc) => byKey.get(tc.id))
      .filter((c): c is Column<T> => !!c && c.csv !== false);
    const csv = toCsv(
      cols.map((c) => c.header),
      source.map((r) => cols.map((c) => (typeof c.csv === "function" ? c.csv(r) : r[c.key]))),
    );
    const name = csvFileName(exportName, new Date());
    downloadCsv(name, csv);
    toast.success(
      `Exported ${source.length.toLocaleString("en-US")} ${source.length === 1 ? noun.one : noun.many}`,
      `${name} · ${cols.length} columns${selectedCount > 0 ? " · selected rows only" : ""}`,
    );
  }

  /* --------------------------------------------------------------- views */
  function persistViews(next: SavedView[]) {
    setViews(next);
    writeStorage(viewsKey, next.length ? serialiseViews(next) : null);
  }
  const activeView = views.find((v) => sameViewState(v.state, current)) ?? null;

  function toggleSort(key: string) {
    setSort((s) => (s && s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }

  /* ---------------------------------------------------- sticky offsets */
  const stickyLeft: Record<string, number> = { [SELECT_COL]: 0, [firstKey]: SELECT_WIDTH };
  const filteredNote = filtered.length === rows.length
    ? `${rows.length.toLocaleString("en-US")} ${rows.length === 1 ? noun.one : noun.many}`
    : `${filtered.length.toLocaleString("en-US")} of ${rows.length.toLocaleString("en-US")}`;

  return (
    <div className="flex flex-col gap-3">
      {/* ------------------------------------------------------ toolbar */}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden="true" />
          <label htmlFor={searchId} className="sr-only">{searchPlaceholder}</label>
          <Input
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPagination((p) => ({ ...p, pageIndex: 0 })); }}
            placeholder={searchPlaceholder}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="mr-1 whitespace-nowrap text-sm tabular-nums text-slate-600" aria-live="polite">{filteredNote}</p>

          <DropdownMenu
            trigger={<><Bookmark size={14} aria-hidden="true" /><span className="max-w-[10rem] truncate">{activeView ? activeView.name : "Views"}</span></>}
            label={activeView ? `Saved views, showing ${activeView.name}` : "Saved views"}
          >
            <DropdownMenuLabel>Saved views</DropdownMenuLabel>
            {views.length === 0 && (
              <p className="px-2.5 pb-2 text-xs text-slate-600">
                None yet. Filter, sort and pick columns, then save it — &ldquo;My open term sheets&rdquo;.
              </p>
            )}
            {views.map((v) => (
              <div key={v.name} className="flex items-center gap-1">
                <DropdownMenuItem onSelect={() => applyState(v.state)} aria-current={activeView?.name === v.name ? "true" : undefined} className="flex-1">
                  <span className={cn("truncate", activeView?.name === v.name && "font-semibold")}>{v.name}</span>
                </DropdownMenuItem>
                <button
                  type="button"
                  aria-label={`Delete the view ${v.name}`}
                  onClick={() => { persistViews(removeView(views, v.name)); toast.info(`Deleted the view "${v.name}"`); }}
                  className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-700", FOCUS_RING)}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setSaveOpen(true)}>
              <Bookmark size={14} className="text-slate-500" aria-hidden="true" /> Save current view…
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => applyState(baseState)}>
              <RotateCcw size={14} className="text-slate-500" aria-hidden="true" /> Reset to default
            </DropdownMenuItem>
          </DropdownMenu>

          <DropdownMenu trigger={<><Columns3 size={14} aria-hidden="true" /> Columns</>} label="Show or hide columns">
            <DropdownMenuLabel>Show columns</DropdownMenuLabel>
            <div className="max-h-72 overflow-y-auto">
              {table.getAllLeafColumns().filter((c) => c.id !== SELECT_COL).map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.id}
                  checked={c.getIsVisible()}
                  disabled={!c.getCanHide()}
                  onCheckedChange={(v) => c.toggleVisibility(v)}
                >
                  {byKey.get(c.id)?.header ?? c.id}
                </DropdownMenuCheckboxItem>
              ))}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => { setVisibility(Object.fromEntries(defaultHidden.map((k) => [k, false]))); setSizing({}); }}>
              <RotateCcw size={14} className="text-slate-500" aria-hidden="true" /> Default columns and widths
            </DropdownMenuItem>
          </DropdownMenu>

          <Button variant="secondary" size="sm" onClick={exportCsv} disabled={filtered.length === 0 && selectedCount === 0}>
            <Download size={14} aria-hidden="true" />
            {selectedCount > 0 ? `Export ${selectedCount} selected` : "Export CSV"}
          </Button>
        </div>
      </div>

      {facet && facets.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={facet.label ?? "Filter"}>
          {facets.map((f) => {
            const on = active === f.value;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => { setActive(on ? null : f.value); setPagination((p) => ({ ...p, pageIndex: 0 })); }}
                aria-pressed={on}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors motion-reduce:transition-none",
                  FOCUS_RING,
                  on ? "border-navy-900 bg-navy-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300",
                )}
              >
                {facet.labels?.[f.value] ?? f.value}
                <span className={cn("tabular-nums", on ? "text-gold-400" : "text-slate-500")}>{f.count}</span>
                {on && <X size={12} aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}

      {/* ----------------------------------------------------- bulk bar */}
      {selectedCount > 0 && (
        <div
          role="region"
          aria-label="Selected rows"
          className="flex flex-col gap-2 rounded-xl bg-navy-900 px-4 py-2.5 text-white sm:flex-row sm:flex-wrap sm:items-center"
        >
          <p className="text-sm">
            <span className="font-bold tabular-nums">{selectedCount}</span> {selectedCount === 1 ? noun.one : noun.many} selected
            {hiddenSelected > 0 && <span className="text-slate-300"> ({hiddenSelected} hidden by the filter)</span>}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
            {selectedCount < filtered.length && (
              <button type="button" onClick={selectAllMatching} className="rounded-sm font-semibold text-gold-400 underline underline-offset-2 hover:text-gold-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400">
                Select all {filtered.length.toLocaleString("en-US")} matching
              </button>
            )}
            <button type="button" onClick={clearSelection} className="rounded-sm text-slate-300 underline underline-offset-2 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400">
              Clear
            </button>
          </div>
          {bulkActions && <div className="flex flex-wrap items-center gap-2 sm:ml-auto">{bulkActions({ selected: selectedRows, clear: clearSelection })}</div>}
        </div>
      )}

      {/* --------------------------------------------------------- grid */}
      <div className="relative max-h-[min(72vh,calc(100vh-11rem))] min-h-[16rem] overflow-auto rounded-2xl border border-slate-200 bg-white [scrollbar-width:thin]">
        {/*
          table-fixed + an explicit width, with min-width 100%: every column is
          exactly as wide as the person made it, and when they are narrower
          than the screen the extra space is shared out rather than left blank.
          (The old grid's lesson still holds — never let the browser squeeze the
          Stage select to a bare chevron; the widths are the protection now.)
        */}
        <table className="min-w-full table-fixed border-separate border-spacing-0 text-sm" style={{ width: table.getTotalSize() }}>
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const id = h.column.id;
                  const sticky = id in stickyLeft;
                  if (id === SELECT_COL) {
                    return (
                      <th
                        key={h.id}
                        scope="col"
                        style={{ width: SELECT_WIDTH, left: 0 }}
                        className="sticky top-0 z-[3] border-b border-slate-200 bg-slate-50 px-3 py-2.5 text-left"
                      >
                        <Checkbox
                          ref={headerBox}
                          checked={pageAll}
                          onChange={() => table.toggleAllPageRowsSelected(!pageAll)}
                          aria-label={pageAll ? "Unselect every row on this page" : "Select every row on this page"}
                        />
                      </th>
                    );
                  }
                  const col = byKey.get(id)!;
                  const sortable = col.sortable !== false;
                  const sorted = sort?.key === id;
                  return (
                    <th
                      key={h.id}
                      scope="col"
                      style={{ width: h.getSize(), left: sticky ? stickyLeft[id] : undefined }}
                      aria-sort={sorted ? (sort!.dir === "asc" ? "ascending" : "descending") : sortable ? "none" : undefined}
                      className={cn(
                        "group/th relative top-0 border-b border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-600",
                        sticky ? "sticky z-[3] border-r border-r-slate-200" : "sticky z-[2]",
                        col.align === "right" ? "text-right" : "text-left",
                      )}
                    >
                      {sortable ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(id)}
                          className={cn(
                            "inline-flex max-w-full items-center gap-1 rounded-sm uppercase hover:text-navy-900",
                            FOCUS_RING,
                            col.align === "right" && "flex-row-reverse",
                            sorted && "text-navy-900",
                          )}
                        >
                          <span className="truncate">{col.header}</span>
                          {sorted
                            ? (sort!.dir === "asc" ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />)
                            : <ArrowUpDown size={12} aria-hidden="true" className="opacity-0 group-hover/th:opacity-60" />}
                        </button>
                      ) : <span className="block truncate">{col.header}</span>}
                      {h.column.getCanResize() && (
                        <div
                          role="separator"
                          aria-orientation="vertical"
                          aria-label={`Resize the ${col.header} column`}
                          aria-valuenow={Math.round(h.getSize())}
                          aria-valuemin={h.column.columnDef.minSize}
                          aria-valuemax={640}
                          tabIndex={0}
                          onMouseDown={h.getResizeHandler()}
                          onTouchStart={h.getResizeHandler()}
                          onDoubleClick={() => h.column.resetSize()}
                          onKeyDown={(e) => {
                            if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                            e.preventDefault();
                            const next = clampWidth(h.getSize() + (e.key === "ArrowRight" ? 16 : -16));
                            if (next !== null) setSizing((s) => ({ ...s, [id]: Math.max(next, h.column.columnDef.minSize ?? 72) }));
                          }}
                          className={cn(
                            "absolute right-0 top-0 h-full w-2 cursor-col-resize touch-none select-none",
                            "hover:bg-gold-500/50 focus:outline-none focus-visible:bg-gold-700",
                            h.column.getIsResizing() && "bg-gold-500",
                          )}
                        />
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={table.getVisibleLeafColumns().length} className="p-0">
                  <EmptyState
                    icon={Search}
                    title={query || active ? "Nothing matches that filter." : emptyMessage}
                    description={query || active ? "Clear the search or the filter chip to see everything." : undefined}
                    action={query || active ? (
                      <Button variant="secondary" size="sm" onClick={() => { setQuery(""); setActive(null); }}>Clear filters</Button>
                    ) : undefined}
                    compact
                  />
                </td>
              </tr>
            )}
            {pageRows.map((row) => {
              const selected = row.getIsSelected();
              return (
                <tr key={row.id} className="group/row">
                  {row.getVisibleCells().map((cell) => {
                    const id = cell.column.id;
                    const sticky = id in stickyLeft;
                    const bg = selected ? "bg-slate-100" : "bg-white group-hover/row:bg-slate-50";
                    if (id === SELECT_COL) {
                      return (
                        <td key={cell.id} style={{ left: 0 }} className={cn("sticky z-[1] border-b border-slate-100 px-3 py-2.5 align-top", bg)}>
                          <Checkbox
                            checked={selected}
                            onChange={row.getToggleSelectedHandler()}
                            aria-label={`Select ${rowLabel ? rowLabel(row.original) : String(row.original[firstKey] ?? "row")}`}
                            className="mt-0.5"
                          />
                        </td>
                      );
                    }
                    const col = byKey.get(id)!;
                    const raw = row.original[col.key];
                    return (
                      <td
                        key={cell.id}
                        style={{ left: sticky ? stickyLeft[id] : undefined }}
                        className={cn(
                          "overflow-hidden border-b border-slate-100 px-3 py-2.5 align-top",
                          bg,
                          sticky && "sticky z-[1] border-r border-r-slate-100",
                          col.align === "right" ? "text-right tabular-nums" : "text-left",
                        )}
                      >
                        {col.render
                          ? col.render(row.original)
                          : raw === null || raw === undefined || raw === ""
                            ? <span className="text-slate-500">—</span>
                            : String(raw)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ---------------------------------------------------- pagination */}
      <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs tabular-nums text-slate-600">{pageRangeLabel(pagination.pageIndex, pagination.pageSize, filtered.length)}</p>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <span>Rows per page</span>
            <Select
              selectSize="sm"
              wrapperClassName="w-auto"
              className="h-8 w-[4.75rem] text-xs"
              value={pagination.pageSize}
              onChange={(e) => setPagination({ pageIndex: 0, pageSize: Number(e.target.value) })}
            >
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
            </Select>
          </label>
          <Button variant="secondary" size="icon-sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label="Previous page">
            <ChevronLeft size={15} aria-hidden="true" />
          </Button>
          <span className="text-xs tabular-nums text-slate-600">
            {pagination.pageIndex + 1} / {pageCount}
          </span>
          <Button variant="secondary" size="icon-sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label="Next page">
            <ChevronRight size={15} aria-hidden="true" />
          </Button>
        </div>
      </nav>

      <SaveViewDialog
        open={saveOpen}
        existing={views.map((v) => v.name)}
        onClose={() => setSaveOpen(false)}
        onSave={(name) => {
          persistViews(upsertView(views, { name, state: current }));
          setSaveOpen(false);
          toast.success(`Saved the view "${name}"`, "It lives in this browser — it is not shared with anyone else.");
        }}
      />
    </div>
  );
}

function SaveViewDialog({
  open, existing, onClose, onSave,
}: { open: boolean; existing: string[]; onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  useEffect(() => { if (open) { setName(""); setError(null); } }, [open]);
  const replaces = existing.some((n) => n.toLowerCase() === name.trim().toLowerCase());
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Save this view"
      description="The search, filter, sort, columns and page size, under a name. Saved in this browser only."
    >
      <form
        className="mt-4"
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = parseViewName(name);
          if (!parsed.ok) { setError(parsed.error); return; }
          onSave(parsed.value);
        }}
      >
        <Label htmlFor={id}>Name</Label>
        <Input
          id={id}
          value={name}
          onChange={(e) => { setName(e.target.value); setError(null); }}
          placeholder="My open term sheets"
          maxLength={60}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          className="mt-1"
        />
        {error && <p id={`${id}-err`} className="mt-1.5 text-xs text-red-700">{error}</p>}
        {!error && replaces && <p className="mt-1.5 text-xs text-slate-600">This replaces the view with the same name.</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit">Save view</Button>
        </div>
      </form>
    </Dialog>
  );
}
