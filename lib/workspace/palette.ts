/**
 * The ⌘K command bar's decisions, pure (palette.regress.ts).
 *
 * Page navigation works for everyone, from the SAME link list the sidebar
 * shows (lib/workspace/nav.ts, computed on the server from the two real gates)
 * — so a broker's palette can only offer a broker's pages. Search is a staff
 * feature and is decided elsewhere; nothing here grants anything.
 */

import type { NavSection } from "./nav";

export type PaletteLink = { label: string; href: string; section: string; keywords: string };

/** Extra words people type for a page, so "firms" finds Brokers and "quote" finds pricing. */
const KEYWORDS: Record<string, string> = {
  "/crm/dashboard": "home today queue overview",
  "/crm": "deals table applications pipeline",
  "/crm/contacts": "people borrowers book",
  "/crm/brokers": "firms invitations invites",
  "/crm/marketing": "blog linkedin email content",
  "/broker-portal": "home my deals",
  "/broker-portal/price": "quote rate term sheet pricer",
  "/broker-portal/price/portfolio": "blanket multiple properties",
  "/broker-portal/apply": "submit new deal application",
  "/broker-portal/resources": "guides guidelines documents library",
};

export function paletteLinks(sections: NavSection[]): PaletteLink[] {
  const out: PaletteLink[] = [];
  for (const s of sections) {
    for (const i of s.items) {
      out.push({ label: i.label, href: i.href, section: s.label, keywords: KEYWORDS[i.href] ?? "" });
    }
  }
  // The Board is a view of the Pipeline, not a rail item; staff can still jump to it.
  if (out.some((l) => l.href === "/crm")) {
    const at = out.findIndex((l) => l.href === "/crm") + 1;
    out.splice(at, 0, { label: "Pipeline board", href: "/crm/board", section: "Lending OS", keywords: "kanban drag stages columns" });
  }
  return out;
}

/**
 * Every word typed must appear somewhere in the label, section or keywords.
 * Label matches rank first, then prefix matches — "pi" puts Pipeline above
 * Portfolio Pricing. An empty query lists everything, in rail order.
 */
export function matchLinks(links: PaletteLink[], query: string): PaletteLink[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return links;
  const scored: { l: PaletteLink; score: number; i: number }[] = [];
  links.forEach((l, i) => {
    const label = l.label.toLowerCase();
    const hay = `${label} ${l.section.toLowerCase()} ${l.keywords}`;
    if (!words.every((w) => hay.includes(w))) return;
    let score = 0;
    if (words.every((w) => label.includes(w))) score += 2;
    if (label.startsWith(words[0])) score += 1;
    scored.push({ l, score, i });
  });
  return scored.sort((a, b) => b.score - a.score || a.i - b.i).map((s) => s.l);
}

/** Pages that host the record card, where `?open=` works in place. */
const CARD_PAGES = ["/crm", "/crm/board", "/crm/dashboard"];

/**
 * Where a deal result goes. On a page that hosts the record card it opens
 * there, over what you were looking at; anywhere else it opens over the
 * Pipeline, which is the deal list.
 */
export function dealHref(pathname: string, applicationId: string): string {
  const path = (pathname || "").split("?")[0].replace(/\/$/, "") || "/";
  const base = CARD_PAGES.includes(path) ? path : "/crm";
  return `${base}?open=${encodeURIComponent(applicationId)}`;
}

/** A contact with no card of their own opens the Contacts page already filtered to them. */
export function contactHref(lookup: string): string {
  return `/crm/contacts?q=${encodeURIComponent(lookup)}`;
}

/** The shortcut hint to print on the button: ⌘K on a Mac, Ctrl K elsewhere. */
export function shortcutLabel(platform: string | null | undefined): string {
  return /mac|iphone|ipad|ipod/i.test(platform ?? "") ? "⌘K" : "Ctrl K";
}
