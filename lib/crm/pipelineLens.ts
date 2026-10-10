/**
 * The Pipeline page's "which deals" switch (10 Oct 2026).
 *
 * Luis asked for one place to see every broker lead. The table already filters
 * by stage; this sits above it and narrows by where the deal came from first,
 * so "Broker deals" + a stage chip answers "which broker files are stuck in
 * underwriting" in two clicks. Pure, covered by pipelineLens.regress.ts.
 */

export const LENSES = ["all", "broker", "website", "biggerpockets", "other"] as const;
export type Lens = (typeof LENSES)[number];

export const LENS_LABEL: Record<Lens, string> = {
  all: "All deals",
  broker: "Broker deals",
  website: "Website",
  biggerpockets: "BiggerPockets",
  other: "Other",
};

type LensRow = { viaBroker: boolean; leadSource: string };

/**
 * Where a deal belongs. A broker on the deal wins over its lead source: a
 * broker who found the borrower on BiggerPockets still owns the conversation.
 */
export function lensOf(r: LensRow): Exclude<Lens, "all"> {
  if (r.viaBroker || r.leadSource === "broker") return "broker";
  if (r.leadSource === "website") return "website";
  if (r.leadSource === "biggerpockets") return "biggerpockets";
  return "other";
}

export function inLens(r: LensRow, lens: Lens): boolean {
  return lens === "all" || lensOf(r) === lens;
}

export function lensCounts(rows: LensRow[]): Record<Lens, number> {
  const out: Record<Lens, number> = { all: rows.length, broker: 0, website: 0, biggerpockets: 0, other: 0 };
  for (const r of rows) out[lensOf(r)]++;
  return out;
}

/** `?view=broker` → "broker"; anything else → "all". Never trusts the string beyond the list. */
export function parseLens(v: string | null | undefined): Lens {
  return (LENSES as readonly string[]).includes(v ?? "") ? (v as Lens) : "all";
}

/**
 * What the Last contact cell shows. The borrower's own last contact as before;
 * on a broker's deal, the broker's when it is more recent (or the only one),
 * labelled so it is never mistaken for the borrower having been reached.
 */
export function effectiveLastContact(r: {
  lastContactAt: string | null;
  lastContactDirection: string | null;
  brokerContactAt: string | null;
}): { at: string | null; direction: string | null; viaBroker: boolean } {
  const own = r.lastContactAt ? new Date(r.lastContactAt).getTime() : NaN;
  const bro = r.brokerContactAt ? new Date(r.brokerContactAt).getTime() : NaN;
  if (Number.isFinite(bro) && (!Number.isFinite(own) || bro > own)) {
    return { at: r.brokerContactAt, direction: null, viaBroker: true };
  }
  return { at: r.lastContactAt, direction: r.lastContactDirection, viaBroker: false };
}
