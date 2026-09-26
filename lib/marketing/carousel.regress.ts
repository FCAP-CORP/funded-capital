/**
 * Regression suite for LinkedIn carousel specs (lib/marketing/carousel.ts).
 *
 * The daily task writes these with nobody watching, and nobody looks at a
 * slide until Luis downloads it. So the contract is: anything that would draw
 * badly is REFUSED with a sentence the task can act on. Section 3 is the one
 * that matters.
 */

import {
  wordsOf,
  LIMITS,
  MAX_SLIDES,
  MAX_SPEC_BYTES,
  MIN_SLIDES,
  barShares,
  bigNumberSize,
  statNumberSize,
  fileNameFor,
  groundOf,
  headlineSize,
  highlightRuns,
  pageLabel,
  parseCarouselSpec,
  plain,
  type CarouselSpec,
} from "./carousel";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};

type Raw = Record<string, unknown>;
const cover: Raw = { t: "cover", eyebrow: "Broker submissions", h: "A term sheet does not need *documents.*", s: "It needs five answers." };
const big: Raw = { t: "big", n: "2 hours", h: "From a complete file to a term sheet", s: "The clock starts when the file is complete." };
const steps: Raw = { t: "steps", h: "The five answers", steps: ["The deal", "The property", "The borrower"] };
const bars: Raw = {
  t: "bars",
  h: "What investors say is hardest",
  rows: [
    { label: "Cost of financing", value: 55, text: "55%", best: true },
    { label: "Rising home prices", value: 48, text: "48%" },
  ],
  cap: "Source: RCN Capital survey, published August 5, 2026.",
};
const statement: Raw = { t: "statement", h: "Guessing high on credit costs you.", gold: true };
const cta: Raw = { t: "cta", h: "Send us the first one.", s: "Close in 5-10 business days.", site: "fundedcapital.com" };
const deck = (...middle: Raw[]) => ({ slides: [cover, ...middle, cta] });
const good = deck(big, steps, bars, statement);

const refused = (name: string, raw: unknown, mustSay: RegExp) => {
  const r = parseCarouselSpec(raw);
  check(name, !r.ok && mustSay.test(r.error), r.ok ? "**ACCEPTED**" : r.error);
};

console.log("\n=== 1. A well-formed deck is accepted and cleaned ===");
const ok = parseCarouselSpec(good);
check("the reference deck passes", ok.ok, ok.ok ? `${ok.value.slides.length} slides` : ok.error);
if (ok.ok) {
  check("slide order is kept", ok.value.slides.map((s) => s.t).join(",") === "cover,big,steps,bars,statement,cta", ok.value.slides.map((s) => s.t).join(","));
  const b = ok.value.slides[3];
  check("a missing best flag becomes false", b.t === "bars" && b.rows[1].best === false, "false");
  const g = ok.value.slides[1];
  check("a missing gold flag becomes false", g.t === "big" && g.gold === false, "false");
}
const spaced = parseCarouselSpec(deck({ ...big, h: "  From a   complete\nfile  " }, steps, bars));
check("runs of whitespace collapse to one space", spaced.ok && spaced.value.slides[1].t === "big" && spaced.value.slides[1].h === "From a complete file", spaced.ok ? JSON.stringify((spaced.value.slides[1] as { h: string }).h) : spaced.error);
const legacy = parseCarouselSpec({ id: "C15", ...good });
check("the older compose_v2 shape with an id still passes", legacy.ok, legacy.ok ? "id ignored" : legacy.error);
check("the id is not carried into the stored spec", legacy.ok && !("id" in legacy.value), "dropped");
const withList = parseCarouselSpec(deck(big, steps, { t: "list", h: "Four things", items: ["One", "Two"] }));
check("a list with no tone defaults to the 'bad' marks", withList.ok && withList.value.slides[3].t === "list" && withList.value.slides[3].tone === "bad", "bad");
const ctaNoSite = parseCarouselSpec({ slides: [cover, big, steps, bars, { t: "cta", h: "Talk to us." }] });
check("a cta with no site gets fundedcapital.com", ctaNoSite.ok && ctaNoSite.value.slides[4].t === "cta" && ctaNoSite.value.slides[4].site === "fundedcapital.com", "defaulted");
const allTypes = parseCarouselSpec({
  slides: [
    cover,
    big,
    { t: "stats", h: "What a complete file gets you", stats: [{ n: "2 hrs", label: "To a term sheet" }, { n: "45", label: "States" }] },
    bars,
    steps,
    { t: "list", h: "Moves it", items: ["A", "B"], tone: "good" },
    { t: "compare", h: "Back, or forward", left: { label: "Sends it back", items: ["X", "Y"] }, right: { label: "Moves it", items: ["P", "Q"] } },
    statement,
    cta,
  ],
});
check("every slide type in one deck passes", allTypes.ok, allTypes.ok ? "9 slides" : allTypes.error);

console.log("\n=== 2. The deck's shape ===");
refused("not an object", "slides", /object/);
refused("slides is not a list", { slides: "x" }, /list/);
refused(`fewer than ${MIN_SLIDES} slides`, { slides: [cover, big, steps, cta] }, /5 to 10 slides/);
refused(`more than ${MAX_SLIDES} slides`, deck(big, steps, bars, statement, big, steps, bars, statement, big), /5 to 10 slides/);
refused("first slide is not the cover", { slides: [big, cover, steps, bars, cta] }, /first slide must be the cover/);
refused("last slide is not the cta", { slides: [cover, big, steps, bars, statement] }, /last slide must be the cta/);
refused("a second cover in the middle", deck(big, cover, steps, bars), /Only the first slide/);
refused("a cta in the middle", deck(big, cta, steps, bars), /Only the first slide/);
refused("only one kind of visual slide", deck(big, statement, big, statement), /two different visual slide types/);
refused("an unknown slide type", deck(big, steps, { t: "photo", h: "A house" }), /type "photo"/);
refused("a slide that is not an object", { slides: [cover, big, steps, "bars", cta] }, /must be an object/);

console.log("\n=== 3. Nothing that would draw badly gets through ===");
refused("an arrow, which the font cannot draw", deck({ ...big, h: "Term sheet → close" }, steps, bars), /cannot draw.*"to"/);
refused("an approx sign, with the right suggestion", deck({ ...big, s: "≈ $750K" }, steps, bars), /"About"/);
refused("a check mark", deck(big, steps, { t: "list", h: "Do", items: ["✓ Good", "Fine"] }), /list slide draws its own marks/);
refused("an emoji", deck({ ...big, h: "Close fast \u{1F680}" }, steps, bars), /cannot draw/);
check("curly quotes, dashes and the bullet are fine", parseCarouselSpec(deck({ ...big, h: "“Fast” – and — right • now…" }, steps, bars)).ok, "inside the font");
check("accented Latin is fine", parseCarouselSpec(deck({ ...big, h: "Se habla español" }, steps, bars)).ok, "inside the font");
refused("a headline one character too long", deck({ ...big, h: "x".repeat(LIMITS.h + 1) }, steps, bars), new RegExp(`${LIMITS.h + 1} characters; the most that fits is ${LIMITS.h}`));
check("a headline exactly at the limit passes", parseCarouselSpec(deck({ ...big, h: "x".repeat(LIMITS.h) }, steps, bars)).ok, `${LIMITS.h}`);
check("highlight stars do not count toward the limit", parseCarouselSpec(deck({ ...big, h: `*${"x".repeat(LIMITS.h)}*` }, steps, bars)).ok, "stars are free");
refused("a cover headline over the tighter cover limit", { slides: [{ ...cover, h: "y".repeat(LIMITS.hCover + 1) }, big, steps, bars, cta] }, /most that fits is 80/);
refused("an unclosed highlight", deck({ ...big, h: "A *bold claim" }, steps, bars), /unclosed/);
refused("a missing headline", deck({ ...big, h: "" }, steps, bars), /h is required/);
refused("a big number too long to be big", deck({ ...big, n: "$1,234,567,890" }, steps, bars), /Slide 2 n/);
refused("a headline that is not text", deck({ ...big, h: 42 }, steps, bars), /must be text/);
refused("one step", deck(big, { ...steps, steps: ["Only one"] }, bars), /2 to 5 entries/);
refused("six steps", deck(big, { ...steps, steps: ["1", "2", "3", "4", "5", "6"] }, bars), /2 to 5 entries/);
refused("a step too long", deck(big, { ...steps, steps: ["ok", "z".repeat(LIMITS.item + 1)] }, bars), /steps #2/);
refused("a bar chart with no source", deck(big, steps, { ...bars, cap: undefined }), /name the source/);
refused("a bar chart that is all zeros", deck(big, steps, { ...bars, rows: [{ label: "A", value: 0, text: "0" }, { label: "B", value: 0, text: "0" }] }), /all zero/);
refused("a negative bar", deck(big, steps, { ...bars, rows: [{ label: "A", value: -3, text: "-3" }, { label: "B", value: 1, text: "1" }] }), /0 or more/);
refused("a bar value given as text", deck(big, steps, { ...bars, rows: [{ label: "A", value: "55", text: "55%" }, { label: "B", value: 1, text: "1" }] }), /must be a number/);
refused("seven bars", deck(big, steps, { ...bars, rows: Array.from({ length: 7 }, (_, k) => ({ label: `R${k}`, value: k + 1, text: `${k + 1}` })) }), /2 to 6 entries/);
refused("one stat", deck(big, steps, { t: "stats", h: "Numbers", stats: [{ n: "1", label: "one" }] }), /2 to 4 entries/);
refused("a compare column with five items", deck(big, steps, { t: "compare", h: "Vs", left: { label: "A", items: ["1", "2", "3", "4", "5"] }, right: { label: "B", items: ["1", "2"] } }), /left items needs 2 to 4/);
refused("a compare column with no label", deck(big, steps, { t: "compare", h: "Vs", left: { items: ["1", "2"] }, right: { label: "B", items: ["1", "2"] } }), /left label is required/);
{
  // The size cap is a backstop, never a surprise: the largest deck the field
  // limits allow must still fit under it.
  const q = (n: number) => "q".repeat(n);
  const maxStep = { t: "steps", eyebrow: q(LIMITS.eyebrow), h: q(LIMITS.h), steps: Array.from({ length: 5 }, () => q(LIMITS.item)), cap: q(LIMITS.cap) };
  const maxBars = { t: "bars", eyebrow: q(LIMITS.eyebrow), h: q(LIMITS.h), rows: Array.from({ length: 6 }, (_, k) => ({ label: q(LIMITS.label), value: k + 1, text: q(LIMITS.n) })), cap: q(LIMITS.cap) };
  const biggest = { slides: [{ ...cover, h: q(LIMITS.hCover), s: q(LIMITS.s), cap: q(LIMITS.cap) }, maxStep, maxBars, maxStep, maxBars, maxStep, maxBars, maxStep, maxBars, { ...cta, h: q(LIMITS.h), s: q(LIMITS.s) }] };
  const r = parseCarouselSpec(biggest);
  check("the largest legal deck still fits the storage cap", r.ok && JSON.stringify(r.value).length < MAX_SPEC_BYTES, r.ok ? `${JSON.stringify(r.value).length} of ${MAX_SPEC_BYTES} bytes` : r.error);
}

console.log("\n=== 4. Presentation helpers ===");
const runs = highlightRuns("A term sheet does not need *documents.*");
check("highlight runs split on stars", runs.length === 2 && !runs[0].hi && runs[1].hi && runs[1].text === "documents.", JSON.stringify(runs));
check("a highlight in the middle", highlightRuns("the *first* one").map((r) => `${r.hi ? "+" : "-"}${r.text}`).join("|") === "-the |+first|- one", "3 runs");
check("no stars, one plain run", highlightRuns("plain").length === 1 && !highlightRuns("plain")[0].hi, "1 run");
check("plain() removes the markup", plain("the *first* one") === "the first one", "stars gone");
const sizes = [10, 35, 55, 85].map((n) => headlineSize("x".repeat(n), "content"));
check("longer headlines never get bigger type", sizes.every((v, k) => k === 0 || v <= sizes[k - 1]), sizes.join(" > "));
check("cover type is larger than content type", headlineSize("Short", "cover") > headlineSize("Short", "content"), "yes");
check("stars do not change the size", headlineSize("*abc*", "content") === headlineSize("abc", "content"), "same");
const shares = barShares([{ label: "a", value: 100, text: "", best: true }, { label: "b", value: 50, text: "", best: false }, { label: "c", value: 0, text: "", best: false }]);
check("the longest bar is full width", shares[0] === 1, String(shares[0]));
check("bars are proportional", shares[1] === 0.5, String(shares[1]));
check("a zero bar still shows a sliver", shares[2] > 0 && shares[2] < 0.1, String(shares[2]));
check("page labels are zero-padded", pageLabel(0, 8) === "01 / 08" && pageLabel(9, 10) === "10 / 10", pageLabel(0, 8));
if (allTypes.ok) {
  const grounds = allTypes.value.slides.map(groundOf).join(",");
  check("cover, statement and cta sit on navy; content on light", grounds === "navy,light,light,light,light,light,light,navy,navy", grounds);
  const gold = parseCarouselSpec(deck({ ...big, gold: true }, steps, bars));
  check("a gold big-number slide sits on navy", gold.ok && groundOf(gold.value.slides[1]) === "navy", "navy");
}
const named = fileNameFor({ slides: [{ t: "cover", h: "A *term sheet* doesn't need: documents!" }] } as CarouselSpec);
check("the PDF name is a safe slug", named === "funded-capital-a-term-sheet-doesn-t-need-documents.pdf", named);
const odd = fileNameFor({ slides: [{ t: "cover", h: "¡¿!!" }] } as CarouselSpec);
check("a headline with no letters still gets a name", odd === "funded-capital-carousel.pdf", odd);

const bn = ["45", "2 hours", "$750,000", "$1,250,000"].map(bigNumberSize);
check("big numbers shrink as they lengthen", bn.every((v, k) => k === 0 || v < bn[k - 1]), bn.join(" > "));
const sn = ["45", "2 hrs", "$750K+", "$12,500,000"].map(statNumberSize);
check("stat numbers shrink as they lengthen", sn.every((v, k) => k === 0 || v <= sn[k - 1]), sn.join(" >= "));
refused("a list item over the list limit", deck(big, steps, { t: "list", h: "Do", items: ["ok", "w".repeat(LIMITS.listItem + 1)] }), /items #2/);
refused("a compare item over the compare limit", deck(big, steps, { t: "compare", h: "Vs", left: { label: "A", items: ["1", "v".repeat(LIMITS.compareItem + 1)] }, right: { label: "B", items: ["1", "2"] } }), /left items #2/);

console.log("\n--- words keep punctuation attached (the \"Low .\" cover, 25 Sep 2026) ---");
const flat = (t: string) => wordsOf(t).map((w) => w.map((s) => (s.hi ? `[${s.t}]` : s.t)).join(""));
check("a full stop after a highlight stays on the word", flat("Came Back *Low*.").join("|") === "Came|Back|[Low].", flat("Came Back *Low*.").join("|"));
check("a highlight inside the word keeps its colour", flat("*Low.*").join("|") === "[Low.]", flat("*Low.*").join("|"));
check("words split only at spaces", flat("A *term sheet* needs five").join("|") === "A|[term]|[sheet]|needs|five", flat("A *term sheet* needs five").join("|"));
check("no empty words from double spaces", wordsOf("One  two").length === 2, String(wordsOf("One  two").length));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
