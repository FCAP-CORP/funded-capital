"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Search, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, Input } from "@/components/ui/field";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { ENROLL_MAX, type Candidate, type ProgramKey } from "@/lib/nurture/nurture";
import { enrollAction } from "./actions";

/**
 * Who is ready, with a tick box each, a search box, and one button.
 *
 * `preselect` decides whether the list starts ticked. It is false for the old
 * spreadsheet contacts: Luis described that pool as a mix, so every person
 * there is a deliberate tick rather than an untick.
 *
 * The confirmation says exactly what will happen, because this is the one
 * click on the page that leads to emails. The server re-checks every person
 * before enrolling, so a stale list can never enrol someone who just wrote in.
 */
export function EnrollPanel({
  program, programName, people, total, preselect,
}: {
  program: ProgramKey;
  programName: string;
  people: Candidate[];
  total: number;
  preselect: boolean;
}) {
  const initial = () => new Set(preselect ? people.map((p) => p.id) : []);
  const [picked, setPicked] = useState<Set<string>>(initial);
  const [query, setQuery] = useState("");
  const [asking, setAsking] = useState(false);
  const [pending, start] = useTransition();
  const all = useRef<HTMLInputElement>(null);

  // A new list (another programme, or after enrolling) starts over.
  const key = useMemo(() => people.map((p) => p.id).join(","), [people]);
  useEffect(() => { setPicked(initial()); setQuery(""); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) => `${p.name} ${p.email} ${p.source} ${p.loan} ${p.note}`.toLowerCase().includes(q));
  }, [people, query]);

  const shownPicked = shown.filter((p) => picked.has(p.id)).length;
  useEffect(() => {
    if (all.current) all.current.indeterminate = shownPicked > 0 && shownPicked < shown.length;
  }, [shownPicked, shown.length]);

  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  /** The header box ticks or unticks everyone CURRENTLY SHOWN — so a search narrows what it touches. */
  const toggleShown = () =>
    setPicked((s) => {
      const n = new Set(s);
      const on = shownPicked < shown.length;
      for (const p of shown) on ? n.add(p.id) : n.delete(p.id);
      return n;
    });

  const enroll = () =>
    start(async () => {
      const r = await enrollAction(program, [...picked]);
      setAsking(false);
      if (r.ok) toast.success(r.message);
      else toast.error("Not enrolled", r.error);
    });

  const n = picked.size;
  const tooMany = n > ENROLL_MAX;
  return (
    <div>
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <label className="relative block sm:w-72">
            <span className="sr-only">Search people</span>
            <Search size={15} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, email, tag…"
              className="pl-9"
            />
          </label>
          <p className="text-[13px] text-slate-600" aria-live="polite">
            {n} of {people.length} ticked
            {total > people.length ? ` (showing ${people.length} of ${total}, longest quiet first)` : ""}
            {query ? ` · ${shown.length} match` : ""}
            {tooMany ? ` · at most ${ENROLL_MAX} per click` : ""}
          </p>
        </div>
        <Button variant="accent" disabled={n === 0 || tooMany || pending} onClick={() => setAsking(true)}>
          <Send size={15} aria-hidden /> Enrol {n} in Klaviyo
        </Button>
      </div>
      <div className="max-h-[560px] overflow-auto">
        <table className="w-full text-left text-sm sm:min-w-[640px]">
          <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="w-10 px-5 py-2.5">
                <Checkbox
                  ref={all}
                  checked={shown.length > 0 && shownPicked === shown.length}
                  onChange={toggleShown}
                  aria-label={shownPicked === shown.length ? "Untick everyone shown" : "Tick everyone shown"}
                />
              </th>
              <th scope="col" className="px-3 py-2.5">Person</th>
              <th scope="col" className="hidden px-3 py-2.5 sm:table-cell">Source</th>
              <th scope="col" className="hidden px-3 py-2.5 sm:table-cell">Loan</th>
              <th scope="col" className="px-3 py-2.5 text-right">Last in touch</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.map((p) => (
              <tr key={p.id} className={picked.has(p.id) ? "" : "bg-slate-50/60 text-slate-500"}>
                <td className="px-5 py-2.5">
                  <Checkbox checked={picked.has(p.id)} onChange={() => toggle(p.id)} aria-label={`Include ${p.name}`} />
                </td>
                <td className="px-3 py-2.5">
                  <span className="font-semibold text-navy-900">{p.name}</span>
                  <span className="block break-all text-[12px] text-slate-500">{p.email}</span>
                  {p.note && <span className="block text-[12px] text-slate-500">{p.note}</span>}
                  <span className="block text-[12px] text-slate-500 sm:hidden">{p.source} · {p.loan}</span>
                </td>
                <td className="hidden px-3 py-2.5 text-slate-700 sm:table-cell">{p.source}</td>
                <td className="hidden px-3 py-2.5 text-slate-700 sm:table-cell">{p.loan}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-slate-700">
                  {p.quietDays === null ? "Never" : `${p.quietDays} days ago`}
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-500">Nobody matches “{query}”.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog
        open={asking}
        onClose={() => !pending && setAsking(false)}
        title={`Add ${n} ${n === 1 ? "person" : "people"} to ${programName}?`}
        description="Lending OS adds them to the Klaviyo list, and the Klaviyo flow for this programme emails them. Anyone who got in touch or started a deal since this page loaded is skipped."
        footer={
          <>
            <Button variant="secondary" data-autofocus onClick={() => setAsking(false)} disabled={pending}>Cancel</Button>
            <Button onClick={enroll} loading={pending}>Add {n} to Klaviyo</Button>
          </>
        }
      />
    </div>
  );
}
