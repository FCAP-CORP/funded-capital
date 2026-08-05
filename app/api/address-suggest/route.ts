import { NextResponse } from "next/server";

/**
 * Address autocomplete proxy.
 *
 * Runs server-side so the API key is never exposed to the browser and there
 * are no CORS issues.
 *
 * Provider:
 *   - If GOOGLE_PLACES_API_KEY is set → Google Places Autocomplete (recommended
 *     for production; best US address coverage, and what most lender portals use).
 *   - Otherwise → Photon (OpenStreetMap), which needs no key. Good enough to
 *     demo/develop against, but swap to Google before launch.
 *
 * To enable Google: add GOOGLE_PLACES_API_KEY=... to .env.local
 */

interface Suggestion {
  id: string;
  label: string;
}

async function fromGoogle(q: string, key: string): Promise<Suggestion[]> {
  const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
    },
    body: JSON.stringify({
      input: q,
      includedRegionCodes: ["us"],
      // Street addresses only — we don't want businesses or cities.
      includedPrimaryTypes: ["street_address", "premise", "subpremise"],
    }),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    suggestions?: { placePrediction?: { placeId?: string; text?: { text?: string } } }[];
  };
  return (data.suggestions ?? [])
    .map((s, i) => ({
      id: s.placePrediction?.placeId ?? String(i),
      label: s.placePrediction?.text?.text ?? "",
    }))
    .filter((s) => s.label);
}

/** Full state names → USPS codes, so "Florida" and "FL" compare equal. */
const STATE_BY_NAME: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO",
  connecticut: "CT", delaware: "DE", "district of columbia": "DC", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY",
  louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN",
  mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR",
  pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD",
  tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA",
  "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
};
const STATE_CODES = new Set(Object.values(STATE_BY_NAME));

const toStateCode = (s?: string): string | null => {
  if (!s) return null;
  const t = s.trim().toLowerCase();
  if (STATE_BY_NAME[t]) return STATE_BY_NAME[t];
  const up = t.toUpperCase();
  return STATE_CODES.has(up) ? up : null;
};

/** Pull a state out of the typed query, e.g. "... Doral FL" or "... Edinburg Pennsylvania". */
function stateFromQuery(q: string): string | null {
  const lower = q.toLowerCase();
  for (const name of Object.keys(STATE_BY_NAME)) {
    if (lower.includes(name)) return STATE_BY_NAME[name];
  }
  const tail = q.trim().match(/\b([A-Za-z]{2})\b\s*\d{0,5}$/);
  const code = tail?.[1]?.toUpperCase();
  return code && STATE_CODES.has(code) ? code : null;
}

/**
 * Photon (OpenStreetMap) fuzzy-matches hard: a search for "450 Ocean Drive Miami
 * Beach FL" happily returns "1 Ocean Drive" and "Edinburg PA" returns Edinburg,
 * New York. We post-filter in tiers so a wrong house number or wrong state never
 * reaches the broker. Google Places (when keyed) needs none of this.
 */
async function fromPhoton(q: string): Promise<Suggestion[]> {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=20&lang=en`;
  const res = await fetch(url, { headers: { "User-Agent": "FundedCapital-BrokerPortal" } });
  if (!res.ok) return [];

  const data = (await res.json()) as {
    features?: {
      properties?: {
        housenumber?: string;
        street?: string;
        name?: string;
        city?: string;
        state?: string;
        postcode?: string;
        countrycode?: string;
        osm_id?: number;
      };
    }[];
  };

  const wantNum = q.trim().match(/^(\d+)/)?.[1] ?? null;
  const wantState = stateFromQuery(q);

  const rows = (data.features ?? [])
    .map((f) => f.properties ?? {})
    .filter((p) => p.countrycode === "US")
    .map((p, i) => {
      const street = [p.housenumber, p.street ?? p.name].filter(Boolean).join(" ");
      const tail = [p.city, [p.state, p.postcode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
      return {
        id: String(p.osm_id ?? i),
        label: [street, tail].filter(Boolean).join(", "),
        num: p.housenumber ?? null,
        state: toStateCode(p.state),
        hasStreet: !!(p.housenumber && (p.street ?? p.name)),
      };
    })
    .filter((s) => s.label.length > 4);

  const stateOk = (s: (typeof rows)[number]) => !wantState || s.state === wantState;
  const numOk = (s: (typeof rows)[number]) => !wantNum || s.num === wantNum;

  // Strictest tier that still returns something.
  const tiers = [
    rows.filter((s) => stateOk(s) && numOk(s) && s.hasStreet),
    rows.filter((s) => stateOk(s) && numOk(s)),
    rows.filter((s) => stateOk(s)),
    rows,
  ];
  const best = tiers.find((t) => t.length > 0) ?? [];
  return best.slice(0, 6).map(({ id, label }) => ({ id, label }));
}

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 3) return NextResponse.json({ suggestions: [] });

  const key = process.env.GOOGLE_PLACES_API_KEY;

  try {
    const suggestions = key ? await fromGoogle(q, key) : await fromPhoton(q);
    return NextResponse.json(
      { suggestions, provider: key ? "google" : "photon" },
      { headers: { "Cache-Control": "private, max-age=30" } }
    );
  } catch {
    // Never break the pricer just because lookup failed — the user can still type.
    return NextResponse.json({ suggestions: [], error: "lookup_failed" });
  }
}
