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

async function fromPhoton(q: string): Promise<Suggestion[]> {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lang=en`;
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

  return (data.features ?? [])
    .map((f) => f.properties ?? {})
    .filter((p) => p.countrycode === "US")
    .map((p, i) => {
      const street = [p.housenumber, p.street ?? p.name].filter(Boolean).join(" ");
      const tail = [p.city, [p.state, p.postcode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
      const label = [street, tail].filter(Boolean).join(", ");
      return { id: String(p.osm_id ?? i), label };
    })
    .filter((s) => s.label.length > 4)
    .slice(0, 6);
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
