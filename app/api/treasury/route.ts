import { NextResponse } from "next/server";
import fallback from "@/data/treasury.json";

/**
 * Serves the current 5-yr US Treasury used for DSCR pricing.
 *
 * Auto-fetches the latest 5-year par yield from the U.S. Treasury's free public
 * daily yield-curve feed, cached for 6 hours (works natively on Vercel — no
 * filesystem writes or scheduled task required). If the feed is unreachable it
 * falls back to the committed value in data/treasury.json so pricing never breaks.
 * Caching is handled at the fetch layer (6h) plus the CDN Cache-Control header,
 * so there's no route-level revalidate export to conflict with Cache Components.
 */
type TreasuryPayload = {
  fiveYearUST: number;
  percent: number;
  updatedAt: string;
  source: string;
};

function parseFiveYear(xml: string): { percent: number; date: string } | null {
  const fives = [...xml.matchAll(/<d:BC_5YEAR[^>]*>([^<]+)<\/d:BC_5YEAR>/g)].map((m) => parseFloat(m[1]));
  const dates = [...xml.matchAll(/<d:NEW_DATE[^>]*>([^<]+)<\/d:NEW_DATE>/g)].map((m) => m[1]);
  if (fives.length === 0) return null;
  const i = fives.length - 1; // feed is chronological; take the most recent row
  const percent = fives[i];
  if (!isFinite(percent) || percent <= 0) return null;
  return { percent, date: dates[i] ?? new Date().toISOString() };
}

async function fetchMonth(ym: string): Promise<{ percent: number; date: string } | null> {
  const url =
    "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml" +
    `?data=daily_treasury_yield_curve&field_tdr_date_value_month=${ym}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  return parseFiveYear(await res.text());
}

async function fetchFiveYearUST(): Promise<TreasuryPayload | null> {
  try {
    const now = new Date();
    const ym = (d: Date) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    // Try current month; early in a month (before the first publish) fall back to prior month.
    const prior = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15));
    const hit = (await fetchMonth(ym(now))) ?? (await fetchMonth(ym(prior)));
    if (!hit) return null;
    return {
      fiveYearUST: +(hit.percent / 100).toFixed(5),
      percent: +hit.percent.toFixed(3),
      updatedAt: hit.date,
      source: "U.S. Treasury daily par yield curve",
    };
  } catch {
    return null;
  }
}

export async function GET() {
  const live = await fetchFiveYearUST();
  const data = live ?? (fallback as TreasuryPayload);
  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" },
  });
}
