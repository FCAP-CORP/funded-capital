"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/field";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import type { Candidate, ProgramKey } from "@/lib/nurture/nurture";
import { enrollAction } from "./actions";

/**
 * Who is ready, with a tick box each (all ticked to start), and one button.
 *
 * The confirmation says exactly what will happen, because this is the one
 * click on the page that leads to emails. The server re-checks every person
 * before enrolling, so a stale list can never enrol someone who just wrote in.
 */
export function EnrollPanel({
  program, programName, people, total,
}: {
  program: ProgramKey;
  programName: string;
  people: Candidate[];
  total: number;
}) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set(people.map((p) => p.id)));
  const [asking, setAsking] = useState(false);
  const [pending, start] = useTransition();
  const all = useRef<HTMLInputElement>(null);

  // A new list (another programme, or after enrolling) starts fully ticked again.
  const key = useMemo(() => people.map((p) => p.id).join(","), [people]);
  useEffect(() => setPicked(new Set(people.map((p) => p.id))), [key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (all.current) all.current.indeterminate = picked.size > 0 && picked.size < people.length;
  }, [picked, people.length]);

  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
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
  return (
    <div>
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] text-slate-600">
          {n} of {people.length} selected{total > people.length ? ` — showing the ${people.length} quiet the longest of ${total}` : ""}. Longest quiet first.
        </p>
        <Button variant="accent" disabled={n === 0 || pending} onClick={() => setAsking(true)}>
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
                  checked={n === people.length}
                  onChange={() => setPicked(n === people.length ? new Set() : new Set(people.map((p) => p.id)))}
                  aria-label={n === people.length ? "Untick everyone" : "Tick everyone"}
                />
              </th>
              <th scope="col" className="px-3 py-2.5">Person</th>
              <th scope="col" className="hidden px-3 py-2.5 sm:table-cell">Source</th>
              <th scope="col" className="hidden px-3 py-2.5 sm:table-cell">Loan</th>
              <th scope="col" className="px-3 py-2.5 text-right">Last in touch</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {people.map((p) => (
              <tr key={p.id} className={picked.has(p.id) ? "" : "bg-slate-50/60 text-slate-500"}>
                <td className="px-5 py-2.5">
                  <Checkbox checked={picked.has(p.id)} onChange={() => toggle(p.id)} aria-label={`Include ${p.name}`} />
                </td>
                <td className="px-3 py-2.5">
                  <span className="font-semibold text-navy-900">{p.name}</span>
                  <span className="block break-all text-[12px] text-slate-500">{p.email}</span>
                  <span className="block text-[12px] text-slate-500 sm:hidden">{p.source} · {p.loan}</span>
                </td>
                <td className="hidden px-3 py-2.5 text-slate-700 sm:table-cell">{p.source}</td>
                <td className="hidden px-3 py-2.5 text-slate-700 sm:table-cell">{p.loan}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-slate-700">
                  {p.quietDays === null ? "Never" : `${p.quietDays} days ago`}
                </td>
              </tr>
            ))}
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
