"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Command } from "cmdk";
import { ArrowRight, CornerDownLeft, FileText, Loader2, Search, User } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { StageBadge } from "@/components/ui/badge";
import { money } from "@/lib/crm/view";
import { SEARCH_MIN, type ContactResult, type DealResult, type SearchResult } from "@/lib/crm/search";
import { contactHref, dealHref, matchLinks, type PaletteLink } from "@/lib/workspace/palette";

/**
 * The ⌘K palette itself. LOADED ON DEMAND — WorkspaceNav imports this file
 * lazily the first time the palette is opened (or the Search button is
 * hovered), so `cmdk` and this component cost nothing on a page load.
 *
 * TWO HALVES:
 *   - "Go to": the pages in this person's own sidebar. Everyone gets it; a
 *     broker's list is a broker's list because it is built from the same
 *     server-computed sections as their rail.
 *   - Deals and Contacts: STAFF ONLY. `canSearch` comes from the server
 *     (lib/workspace/nav.server.ts → isCrmStaff) and when it is false this
 *     component never calls the search route at all. The route checks staff
 *     again for itself and 404s anyone else — this flag is a courtesy, that
 *     check is the control.
 *
 * Search waits 180 ms after the last keystroke and 2 characters, cancels the
 * previous request when a new one starts, and never shows results for a query
 * that is no longer in the box.
 */

type Status = "idle" | "loading" | "done" | "error";

const ITEM =
  "flex cursor-pointer select-none items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-navy-900 " +
  "data-[selected=true]:bg-slate-100 data-[disabled=true]:opacity-50";

export default function CommandPalette({
  open, onClose, links, canSearch, takeEarlyKeys,
}: {
  open: boolean;
  onClose: () => void;
  /** Keys typed before this component had loaded; see WorkspaceNav. */
  takeEarlyKeys?: () => string;
  links: PaletteLink[];
  canSearch: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [resultsFor, setResultsFor] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const inflight = useRef<AbortController | null>(null);

  // A fresh palette every time it opens — seeded with anything typed while
  // it was still loading.
  useEffect(() => {
    if (open) {
      const typed = takeEarlyKeys?.() ?? "";
      if (typed) setQuery(typed);
      return;
    }
    setQuery("");
    setResults([]);
    setResultsFor("");
    setStatus("idle");
    inflight.current?.abort();
  }, [open, takeEarlyKeys]);

  const trimmed = query.trim();
  const searching = canSearch && trimmed.length >= SEARCH_MIN;

  useEffect(() => {
    if (!searching) {
      inflight.current?.abort();
      setStatus("idle");
      return;
    }
    setStatus("loading");
    const timer = setTimeout(async () => {
      inflight.current?.abort();
      const ctrl = new AbortController();
      inflight.current = ctrl;
      try {
        const res = await fetch(`/api/crm/search?q=${encodeURIComponent(trimmed)}`, {
          signal: ctrl.signal,
          cache: "no-store",
          headers: { accept: "application/json" },
        });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { results?: SearchResult[] };
        setResults(Array.isArray(data.results) ? data.results : []);
        setResultsFor(trimmed);
        setStatus("done");
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setResults([]);
        setResultsFor(trimmed);
        setStatus("error");
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [trimmed, searching]);

  const pages = useMemo(() => matchLinks(links, trimmed).slice(0, trimmed ? 6 : 12), [links, trimmed]);
  // Only ever show results for the words currently in the box.
  const current = searching && resultsFor === trimmed ? results : [];
  const deals = current.filter((r): r is DealResult => r.kind === "deal");
  const people = current.filter((r): r is ContactResult => r.kind === "contact");

  function go(href: string) {
    onClose();
    router.push(href, { scroll: false });
  }

  const nothing = pages.length === 0 && deals.length === 0 && people.length === 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={canSearch ? "Search deals, people and pages" : "Go to a page"}
      hideTitle
      showClose={false}
      position="top"
      size="lg"
      className="overflow-hidden p-0"
    >
      <Command label={canSearch ? "Search deals, people and pages" : "Go to a page"} shouldFilter={false} loop>
        <div className="flex items-center gap-3 border-b border-slate-200 px-4">
          <Search size={18} className="shrink-0 text-slate-500" aria-hidden="true" />
          <Command.Input
            value={query}
            onValueChange={setQuery}
            placeholder={canSearch ? "Search borrowers, emails, phones, addresses — or a page…" : "Go to a page…"}
            className="h-14 min-w-0 flex-1 bg-transparent text-[15px] text-navy-900 placeholder:text-slate-500 focus:outline-none"
          />
          {status === "loading" && <Loader2 size={16} className="shrink-0 animate-spin text-slate-500 motion-reduce:animate-none" aria-label="Searching" />}
          <kbd className="hidden shrink-0 rounded border border-slate-200 px-1.5 py-0.5 text-[11px] font-medium text-slate-500 sm:inline">Esc</kbd>
        </div>

        <Command.List
          className={
            "max-h-[min(60vh,28rem)] overflow-y-auto overscroll-contain p-2 " +
            "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 " +
            "[&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase " +
            "[&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-slate-500"
          }
        >
          {deals.length > 0 && (
            <Command.Group heading="Deals">
              {deals.map((d) => (
                <Command.Item key={`d:${d.applicationId}`} value={`deal:${d.applicationId}`} onSelect={() => go(dealHref(pathname, d.applicationId))} className={ITEM}>
                  <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-navy-900 text-gold-400">
                    <FileText size={15} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-semibold">{d.name}</span>
                    <span className="truncate text-xs text-slate-600">
                      {[d.address, d.contact].filter(Boolean).join(" · ") || "No contact details"}
                    </span>
                  </span>
                  <span className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
                    <StageBadge stage={d.stage} />
                    {d.requestedAmount && <span className="text-xs tabular-nums text-slate-600">{money(d.requestedAmount)}</span>}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {people.length > 0 && (
            <Command.Group heading="Contacts">
              {people.map((p) => (
                <Command.Item key={`c:${p.contactId}`} value={`contact:${p.contactId}`} onSelect={() => go(contactHref(p.lookup))} className={ITEM}>
                  <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
                    <User size={15} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-semibold">{p.name}</span>
                    <span className="truncate text-xs text-slate-600">{p.contact ?? "No email or phone"}</span>
                  </span>
                  <span className="shrink-0 text-xs text-slate-600">
                    {p.deals > 0 ? `${p.deals} ${p.deals === 1 ? "deal" : "deals"}` : "No deal yet"}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {pages.length > 0 && (
            <Command.Group heading="Go to">
              {pages.map((l) => (
                <Command.Item key={`p:${l.href}`} value={`page:${l.href}`} onSelect={() => go(l.href)} className={ITEM}>
                  <ArrowRight size={15} className="shrink-0 text-slate-500" aria-hidden="true" />
                  <span className="flex-1 truncate">{l.label}</span>
                  <span className="shrink-0 text-xs text-slate-500">{l.section}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {searching && status === "done" && deals.length === 0 && people.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-slate-600">
              No borrower, contact or property matches &ldquo;{trimmed}&rdquo;.
            </p>
          )}
          {searching && status === "error" && (
            <p role="alert" className="px-3 py-6 text-center text-sm text-red-700">
              Search is unavailable right now. Pages still work.
            </p>
          )}
          {!searching && canSearch && trimmed.length > 0 && trimmed.length < SEARCH_MIN && (
            <p className="px-3 py-2 text-xs text-slate-500">Type one more character to search deals and people.</p>
          )}
          {nothing && !searching && <p className="px-3 py-6 text-center text-sm text-slate-600">No page matches.</p>}
        </Command.List>

        <div className="flex items-center gap-4 border-t border-slate-200 bg-slate-50 px-4 py-2 text-[11px] text-slate-600">
          <span><kbd className="font-sans font-semibold">↑</kbd> <kbd className="font-sans font-semibold">↓</kbd> to move</span>
          <span className="inline-flex items-center gap-1"><CornerDownLeft size={11} aria-hidden="true" /> to open</span>
          <span className="ml-auto hidden sm:inline">{canSearch ? "Deals open their record card" : "Your pages"}</span>
        </div>
      </Command>
    </Dialog>
  );
}
