/**
 * LinkedIn carousels: what a slide deck may contain, checked before it is stored.
 *
 * WHY THE SITE DRAWS THEM NOW. Until 24 Sep 2026 the daily blog task drew each
 * carousel with a Python script in its own sandbox and uploaded the PNGs to
 * Drive. That broke twice: the upload failed from the cloud, and every design
 * change meant editing a script that lives outside the repo. Now the task sends
 * only the WORDS (this spec) to the queue API, and the site draws the slides
 * itself — app/api/crm/carousel/[id]/route.ts. The design lives here, in
 * version control, and a better design reaches every future carousel on push.
 *
 * WHY SO STRICT. Nobody looks at a slide between the task writing it and Luis
 * downloading it. So everything that could make a slide ugly is refused here,
 * with a message the task can act on: text too long to fit, too many rows, a
 * character the font cannot draw. The renderer then never has to guess.
 *
 * Pure: no database, no React. Tested by carousel.regress.ts.
 */

export const SLIDE_TYPES = [
  "cover",
  "big",
  "stats",
  "bars",
  "steps",
  "list",
  "compare",
  "statement",
  "cta",
] as const;
export type SlideType = (typeof SLIDE_TYPES)[number];

export const MIN_SLIDES = 5;
export const MAX_SLIDES = 10;
/** A stored spec is small. This bounds what the API will keep. */
export const MAX_SPEC_BYTES = 16_384;

/** Field limits. Each one is the longest text that still fits its box at its smallest type size. */
export const LIMITS = {
  eyebrow: 48,
  h: 90,
  hCover: 80,
  s: 200,
  n: 12,
  cap: 160,
  item: 110,
  listItem: 80,
  compareItem: 50,
  label: 40,
  statLabel: 60,
  site: 40,
} as const;

export interface BarRow {
  label: string;
  value: number;
  text: string;
  best: boolean;
}
export interface Stat {
  n: string;
  label: string;
}
export interface Column {
  label: string;
  items: string[];
}

interface Base {
  eyebrow?: string;
  cap?: string;
}
export type Slide =
  | (Base & { t: "cover"; h: string; s?: string })
  | (Base & { t: "big"; n: string; h: string; s?: string; gold: boolean })
  | (Base & { t: "stats"; h: string; stats: Stat[] })
  | (Base & { t: "bars"; h: string; rows: BarRow[] })
  | (Base & { t: "steps"; h: string; steps: string[] })
  | (Base & { t: "list"; h: string; items: string[]; tone: "bad" | "good" })
  | (Base & { t: "compare"; h: string; left: Column; right: Column })
  | (Base & { t: "statement"; h: string; s?: string; gold: boolean })
  | (Base & { t: "cta"; h: string; s?: string; site: string });

export interface CarouselSpec {
  slides: Slide[];
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/*
 * THE FONT. The slides use the Latin subset of Inter, which has no arrows, no
 * approx sign, no check marks and no emoji. A character outside the set below
 * renders as a blank box, so it is refused instead. Straight and curly quotes,
 * en and em dashes, the bullet and the ellipsis are all inside it.
 */
const ALLOWED = /^[ -~ -ÿ‐-‧‰-⁞€™−]*$/;

/** The friendliest replacement for the characters the task reaches for most. */
const SUGGEST: Record<string, string> = {
  "→": '"to" or ">"',
  "←": '"from" or "<"',
  "≈": '"About"',
  "✓": "nothing (the list slide draws its own marks)",
  "✔": "nothing (the list slide draws its own marks)",
  "✗": "nothing (the list slide draws its own marks)",
  "≤": '"<=" or "up to"',
  "≥": '">=" or "at least"',
};

function badChars(s: string): string[] {
  const out = new Set<string>();
  for (const ch of s) if (!ALLOWED.test(ch)) out.add(ch);
  return [...out];
}

class SpecError extends Error {}

function where(i: number, field: string): string {
  return `Slide ${i + 1} ${field}`;
}

function text(v: unknown, i: number, field: string, max: number, required: boolean): string | undefined {
  if (v === undefined || v === null || (typeof v === "string" && !v.trim())) {
    if (required) throw new SpecError(`${where(i, field)} is required.`);
    return undefined;
  }
  if (typeof v !== "string") throw new SpecError(`${where(i, field)} must be text.`);
  const t = v.replace(/\s+/g, " ").trim();
  const bad = badChars(t);
  if (bad.length) {
    const hints = bad.map((c) => (SUGGEST[c] ? `"${c}" (use ${SUGGEST[c]})` : `"${c}"`));
    throw new SpecError(`${where(i, field)} has characters the slide font cannot draw: ${hints.join(", ")}.`);
  }
  // Count what the reader sees: *gold* markers are not printed.
  const visible = t.replace(/\*/g, "");
  if (visible.length > max) {
    throw new SpecError(`${where(i, field)} is ${visible.length} characters; the most that fits is ${max}. Shorten it.`);
  }
  if ((t.match(/\*/g) ?? []).length % 2 !== 0) {
    throw new SpecError(`${where(i, field)} has an unclosed *highlight*. Use *two* asterisks around the words.`);
  }
  return t;
}

function texts(v: unknown, i: number, field: string, min: number, max: number, maxLen: number): string[] {
  if (!Array.isArray(v)) throw new SpecError(`${where(i, field)} must be a list.`);
  if (v.length < min || v.length > max) {
    throw new SpecError(`${where(i, field)} needs ${min} to ${max} entries; it has ${v.length}.`);
  }
  return v.map((x, k) => text(x, i, `${field} #${k + 1}`, maxLen, true) as string);
}

function bool(v: unknown): boolean {
  return v === true;
}

function slide(raw: unknown, i: number): Slide {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new SpecError(`Slide ${i + 1} must be an object.`);
  const r = raw as Record<string, unknown>;
  const t = r.t;
  if (typeof t !== "string" || !(SLIDE_TYPES as readonly string[]).includes(t)) {
    throw new SpecError(`Slide ${i + 1} has type "${String(t)}". Use one of: ${SLIDE_TYPES.join(", ")}.`);
  }
  const base: Base = {};
  const eyebrow = text(r.eyebrow, i, "eyebrow", LIMITS.eyebrow, false);
  if (eyebrow) base.eyebrow = eyebrow;
  const cap = text(r.cap, i, "cap", LIMITS.cap, false);
  if (cap) base.cap = cap;

  switch (t as SlideType) {
    case "cover":
      return { ...base, t: "cover", h: text(r.h, i, "h", LIMITS.hCover, true)!, s: text(r.s, i, "s", LIMITS.s, false) };
    case "big":
      return {
        ...base,
        t: "big",
        n: text(r.n, i, "n", LIMITS.n, true)!,
        h: text(r.h, i, "h", LIMITS.h, true)!,
        s: text(r.s, i, "s", LIMITS.s, false),
        gold: bool(r.gold),
      };
    case "stats": {
      if (!Array.isArray(r.stats) || r.stats.length < 2 || r.stats.length > 4) {
        throw new SpecError(`${where(i, "stats")} needs 2 to 4 entries.`);
      }
      const stats = r.stats.map((x, k): Stat => {
        const o = (x ?? {}) as Record<string, unknown>;
        return {
          n: text(o.n, i, `stats #${k + 1} n`, LIMITS.n, true)!,
          label: text(o.label, i, `stats #${k + 1} label`, LIMITS.statLabel, true)!,
        };
      });
      return { ...base, t: "stats", h: text(r.h, i, "h", LIMITS.h, true)!, stats };
    }
    case "bars": {
      if (!Array.isArray(r.rows) || r.rows.length < 2 || r.rows.length > 6) {
        throw new SpecError(`${where(i, "rows")} needs 2 to 6 entries.`);
      }
      const rows = r.rows.map((x, k): BarRow => {
        const o = (x ?? {}) as Record<string, unknown>;
        const value = typeof o.value === "number" ? o.value : Number.NaN;
        if (!Number.isFinite(value) || value < 0) {
          throw new SpecError(`${where(i, `rows #${k + 1} value`)} must be a number, 0 or more.`);
        }
        return {
          label: text(o.label, i, `rows #${k + 1} label`, LIMITS.label, true)!,
          value,
          text: text(o.text, i, `rows #${k + 1} text`, LIMITS.n, true)!,
          best: bool(o.best),
        };
      });
      if (rows.every((row) => row.value === 0)) throw new SpecError(`${where(i, "rows")} are all zero; there is nothing to draw.`);
      if (!base.cap) throw new SpecError(`${where(i, "cap")} is required on a bars slide: name the source and its date.`);
      return { ...base, t: "bars", h: text(r.h, i, "h", LIMITS.h, true)!, rows };
    }
    case "steps":
      return { ...base, t: "steps", h: text(r.h, i, "h", LIMITS.h, true)!, steps: texts(r.steps, i, "steps", 2, 5, LIMITS.item) };
    case "list":
      return {
        ...base,
        t: "list",
        h: text(r.h, i, "h", LIMITS.h, true)!,
        items: texts(r.items, i, "items", 2, 5, LIMITS.listItem),
        tone: r.tone === "good" ? "good" : "bad",
      };
    case "compare": {
      const col = (v: unknown, side: string): Column => {
        const o = (v ?? {}) as Record<string, unknown>;
        return {
          label: text(o.label, i, `${side} label`, LIMITS.label, true)!,
          items: texts(o.items, i, `${side} items`, 2, 4, LIMITS.compareItem),
        };
      };
      return { ...base, t: "compare", h: text(r.h, i, "h", LIMITS.h, true)!, left: col(r.left, "left"), right: col(r.right, "right") };
    }
    case "statement":
      return { ...base, t: "statement", h: text(r.h, i, "h", LIMITS.h, true)!, s: text(r.s, i, "s", LIMITS.s, false), gold: bool(r.gold) };
    case "cta":
      return {
        ...base,
        t: "cta",
        h: text(r.h, i, "h", LIMITS.h, true)!,
        s: text(r.s, i, "s", LIMITS.s, false),
        site: text(r.site, i, "site", LIMITS.site, false) ?? "fundedcapital.com",
      };
  }
}

/**
 * Check a carousel spec from the outside world and return a clean copy.
 *
 * Accepts the older compose_v2 shape too ({ id, slides }): the id is ignored,
 * because the queue request id is the carousel's identity now.
 */
export function parseCarouselSpec(raw: unknown): Parsed<CarouselSpec> {
  try {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new SpecError("carouselSpec must be an object with a slides list.");
    const slidesRaw = (raw as Record<string, unknown>).slides;
    if (!Array.isArray(slidesRaw)) throw new SpecError("carouselSpec.slides must be a list.");
    if (slidesRaw.length < MIN_SLIDES || slidesRaw.length > MAX_SLIDES) {
      throw new SpecError(`A carousel needs ${MIN_SLIDES} to ${MAX_SLIDES} slides; this one has ${slidesRaw.length}.`);
    }
    const slides = slidesRaw.map(slide);
    if (slides[0].t !== "cover") throw new SpecError("The first slide must be the cover.");
    if (slides[slides.length - 1].t !== "cta") throw new SpecError("The last slide must be the cta.");
    if (slides.slice(1, -1).some((s) => s.t === "cover" || s.t === "cta")) {
      throw new SpecError("Only the first slide may be a cover and only the last may be a cta.");
    }
    const visual = new Set(slides.filter((s) => ["big", "stats", "bars", "steps", "compare"].includes(s.t)).map((s) => s.t));
    if (visual.size < 2) {
      throw new SpecError("Use at least two different visual slide types from: big, stats, bars, steps, compare.");
    }
    const spec: CarouselSpec = { slides };
    if (JSON.stringify(spec).length > MAX_SPEC_BYTES) throw new SpecError("The carousel is too large to store.");
    return { ok: true, value: spec };
  } catch (e) {
    if (e instanceof SpecError) return { ok: false, error: e.message };
    throw e;
  }
}

/**
 * Split "A term sheet needs *five answers*." into runs, so the renderer can
 * colour the starred words. Stars are the only markup there is.
 */
export function highlightRuns(s: string): { text: string; hi: boolean }[] {
  const parts = s.split("*");
  return parts
    .map((text, k) => ({ text, hi: k % 2 === 1 }))
    .filter((p) => p.text.length > 0);
}

/**
 * The headline cut into words, each word keeping the colour of every run inside
 * it — so "*Low*." is one word, not "Low" and a stray ".". See Words() in
 * carousel.render.tsx.
 */
export function wordsOf(text: string): { t: string; hi: boolean }[][] {
  const words: { t: string; hi: boolean }[][] = [];
  let cur: { t: string; hi: boolean }[] = [];
  for (const run of highlightRuns(text)) {
    run.text.split(" ").forEach((piece, i) => {
      if (i > 0 && cur.length) {
        words.push(cur);
        cur = [];
      }
      if (piece) cur.push({ t: piece, hi: run.hi });
    });
  }
  if (cur.length) words.push(cur);
  return words;
}

/** The text with the markup removed, for alt text and file names. */
export function plain(s: string): string {
  return s.replace(/\*/g, "");
}

/**
 * Headline size for a given length, in px on a 1080-wide slide.
 *
 * Longer headlines get smaller type instead of spilling off the slide. The
 * steps were measured against Inter ExtraBold at a 900px text column: each size
 * is the largest at which the longest allowed headline for that band still
 * takes at most four lines.
 */
export function headlineSize(s: string, kind: "cover" | "content" | "statement"): number {
  const n = plain(s).length;
  if (kind === "cover") return n <= 28 ? 104 : n <= 44 ? 92 : n <= 60 ? 80 : 70;
  if (kind === "statement") return n <= 30 ? 92 : n <= 50 ? 80 : n <= 70 ? 68 : 60;
  return n <= 30 ? 80 : n <= 50 ? 70 : n <= 70 ? 62 : 56;
}

/**
 * Type size for the one big number on a "big" slide. "$1,250,000" at the size
 * that suits "2 hours" runs off the slide, so the size follows the length.
 */
export function bigNumberSize(n: string): number {
  const k = plain(n).length;
  return k <= 4 ? 260 : k <= 7 ? 200 : k <= 9 ? 160 : 132;
}

/** Type size for a number inside a stats card (364px of usable width). */
export function statNumberSize(n: string): number {
  const k = plain(n).length;
  return k <= 4 ? 88 : k <= 6 ? 74 : k <= 8 ? 60 : 50;
}

/** Bar widths as a share of the longest bar, never below a visible sliver. */
export function barShares(rows: readonly BarRow[]): number[] {
  const max = Math.max(...rows.map((r) => r.value));
  if (!(max > 0)) return rows.map(() => 0);
  return rows.map((r) => Math.max(0.04, r.value / max));
}

/** "02 / 07". */
export function pageLabel(index: number, total: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(index + 1)} / ${pad(total)}`;
}

/**
 * Which ground a slide sits on. Dark slides open, punctuate and close the
 * deck; content slides are light, so a swipe always changes something.
 */
export function groundOf(s: Slide): "navy" | "light" {
  return s.t === "cover" || s.t === "statement" || s.t === "cta" || (s.t === "big" && s.gold) ? "navy" : "light";
}

/** A download name for the PDF, from the cover headline. */
export function fileNameFor(spec: CarouselSpec): string {
  const first = spec.slides[0];
  const slug = plain(first.h)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `funded-capital-${slug || "carousel"}.pdf`;
}
