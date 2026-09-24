/**
 * Draws a carousel spec as LinkedIn slides (1080 x 1350, the 4:5 portrait
 * LinkedIn and Instagram both show full-height) and as one PDF — the format
 * LinkedIn's "document" post takes.
 *
 * ENGINE. `next/og` (Satori + resvg), which ships inside Next — no browser, no
 * new rendering dependency. Satori understands a subset of CSS: flexbox only,
 * no grid, no `display: block`, so every box here is a flex box and a
 * multi-colour headline is laid out word by word (see Words). pdf-lib then
 * wraps the PNGs into a PDF.
 *
 * BRAND. Navy #0B1F3A, gold #B88E3E used sparingly, charcoal body text, light
 * gray panels, Inter 400-800 — from the design system in 04-brand. The
 * compliance line belongs in the caption, never on a slide.
 *
 * Server-only: it reads font and logo files from disk.
 */
import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { PDFDocument } from "pdf-lib";
import type { ReactNode } from "react";
import {
  barShares,
  bigNumberSize,
  statNumberSize,
  groundOf,
  headlineSize,
  highlightRuns,
  pageLabel,
  plain,
  type CarouselSpec,
  type Slide,
} from "./carousel";

export const SLIDE_W = 1080;
export const SLIDE_H = 1350;
const PAD = 92;

const C = {
  navy: "#0B1F3A",
  navyDeep: "#07152A",
  navyLift: "#12294B",
  gold: "#B88E3E",
  goldSoft: "#D8B978",
  charcoal: "#2B2B2B",
  slate: "#5B6576",
  slateLight: "#A9B3C4",
  panel: "#F5F6F8",
  line: "#E3E6EB",
  white: "#FFFFFF",
};

/* ------------------------------------------------------------------ assets */

const ASSETS = join(process.cwd(), "lib", "marketing", "carousel-assets");

type Font = { name: string; data: ArrayBuffer; weight: 400 | 500 | 600 | 700 | 800; style: "normal" };
let cache: Promise<{ fonts: Font[]; logoWhite: string; logoNavy: string }> | null = null;

function toArrayBuffer(b: Buffer): ArrayBuffer {
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

/** Loaded once per server instance: five fonts and two logos, about 200 KB. */
function assets() {
  cache ??= (async () => {
    const weights = [400, 500, 600, 700, 800] as const;
    const fonts = await Promise.all(
      weights.map(async (weight): Promise<Font> => ({
        name: "Inter",
        weight,
        style: "normal",
        data: toArrayBuffer(await readFile(join(ASSETS, `inter-latin-${weight}-normal.woff`))),
      })),
    );
    const png = async (f: string) => `data:image/png;base64,${(await readFile(join(ASSETS, f))).toString("base64")}`;
    return { fonts, logoWhite: await png("logo-white.png"), logoNavy: await png("logo-navy.png") };
  })().catch((e) => {
    cache = null; // a failed read must not be remembered forever
    throw e;
  });
  return cache;
}

/* --------------------------------------------------------------- primitives */

type Ground = "navy" | "light";

/**
 * A headline whose *starred* words are coloured. Satori cannot wrap a line of
 * mixed spans, so each word is its own box in a wrapping row.
 */
function Words({ text, size, color, hi, weight = 800, lineHeight = 1.08, spacing = -0.02 }: {
  text: string; size: number; color: string; hi: string; weight?: number; lineHeight?: number; spacing?: number;
}) {
  const words: { w: string; hi: boolean }[] = [];
  for (const run of highlightRuns(text)) {
    for (const w of run.text.split(" ").filter(Boolean)) words.push({ w, hi: run.hi });
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", fontSize: size, fontWeight: weight, lineHeight, letterSpacing: `${spacing}em`, color }}>
      {words.map((x, k) => (
        <span key={k} style={{ color: x.hi ? hi : color, marginRight: size * 0.26 }}>{x.w}</span>
      ))}
    </div>
  );
}

function Eyebrow({ text, ground }: { text: string; ground: Ground }) {
  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: 34 }}>
      <div style={{ width: 44, height: 4, background: C.gold, marginRight: 18, borderRadius: 2 }} />
      <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: ground === "navy" ? C.goldSoft : C.gold }}>
        {text}
      </span>
    </div>
  );
}

function Sub({ text, ground, size = 36 }: { text: string; ground: Ground; size?: number }) {
  return (
    <div style={{ display: "flex", fontSize: size, fontWeight: 400, lineHeight: 1.42, color: ground === "navy" ? "#C9D2E0" : C.slate, marginTop: 34 }}>
      {plain(text)}
    </div>
  );
}

function Cap({ text, ground }: { text: string; ground: Ground }) {
  return (
    <div style={{ display: "flex", fontSize: 22, lineHeight: 1.4, color: ground === "navy" ? C.slateLight : C.slate, marginTop: 28 }}>
      {plain(text)}
    </div>
  );
}

function Chevron({ color }: { color: string }) {
  return (
    <svg width="34" height="22" viewBox="0 0 34 22">
      <path d="M3 3 L11 11 L3 19" stroke={color} strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 3 L25 11 L17 19" stroke={color} strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Tick({ tone, onNavy }: { tone: "good" | "bad"; onNavy?: boolean }) {
  const bg = tone === "good" ? C.gold : onNavy ? "rgba(255,255,255,0.12)" : "#E6E9EE";
  const fg = tone === "good" ? C.white : onNavy ? C.slateLight : C.slate;
  return (
    <div style={{ width: 46, height: 46, borderRadius: 23, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <svg width="22" height="22" viewBox="0 0 22 22">
        {tone === "good" ? (
          <path d="M4 11.5 L9 16 L18 6" stroke={fg} strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M5 5 L17 17 M17 5 L5 17" stroke={fg} strokeWidth="3.2" fill="none" strokeLinecap="round" />
        )}
      </svg>
    </div>
  );
}

/* -------------------------------------------------------------------- frame */

function Frame({ ground, index, total, logo, children }: {
  ground: Ground; index: number; total: number; logo: string; children: ReactNode;
}) {
  const navy = ground === "navy";
  const last = index === total - 1;
  return (
    <div
      style={{
        width: SLIDE_W,
        height: SLIDE_H,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        fontFamily: "Inter",
        color: navy ? C.white : C.charcoal,
        background: navy ? `linear-gradient(165deg, ${C.navyLift} 0%, ${C.navy} 48%, ${C.navyDeep} 100%)` : C.white,
      }}
    >
      {/* Blueprint grid on navy, a hairline column rule on light. */}
      {navy ? (
        <div
          style={{
            position: "absolute", left: 0, top: 0, width: SLIDE_W, height: SLIDE_H, display: "flex",
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)",
            backgroundSize: "54px 54px",
          }}
        />
      ) : (
        <div style={{ position: "absolute", left: 0, top: 0, width: 14, height: SLIDE_H, background: C.navy, display: "flex" }} />
      )}
      
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: `${PAD - 20}px ${PAD}px 0 ${PAD}px` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} width={250} height={81} alt="" style={{ objectFit: "contain", objectPosition: "left" }} />
        <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: "0.14em", color: navy ? C.slateLight : C.slate }}>
          {pageLabel(index, total)}
        </span>
      </div>

      {/* Body */}
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, padding: `0 ${PAD}px`, justifyContent: "center" }}>
        {children}
      </div>

      {/* Footer */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: `0 ${PAD}px 44px ${PAD}px` }}>
        <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: "0.06em", color: navy ? C.slateLight : C.slate }}>fundedcapital.com</span>
        {!last && (
          <div style={{ display: "flex", alignItems: "center" }}>
            <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: "0.2em", marginRight: 14, color: navy ? C.goldSoft : C.gold }}>SWIPE</span>
            <Chevron color={navy ? C.goldSoft : C.gold} />
          </div>
        )}
      </div>
      <div style={{ display: "flex", width: SLIDE_W, height: 8, background: navy ? "rgba(255,255,255,0.10)" : C.line }}>
        <div style={{ width: Math.round((SLIDE_W * (index + 1)) / total), height: 8, background: C.gold }} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- slides */

function Body({ s, ground }: { s: Slide; ground: Ground }) {
  const navy = ground === "navy";
  const ink = navy ? C.white : C.navy;
  const hi = navy ? C.goldSoft : C.gold;

  switch (s.t) {
    case "cover":
      return (
        <div style={{ display: "flex", flexDirection: "column", paddingBottom: 60 }}>
          {s.eyebrow && <Eyebrow text={s.eyebrow} ground={ground} />}
          <Words text={s.h} size={headlineSize(s.h, "cover")} color={ink} hi={hi} lineHeight={1.04} />
          <div style={{ width: 120, height: 8, background: C.gold, borderRadius: 4, marginTop: 48 }} />
          {s.s && <Sub text={s.s} ground={ground} size={38} />}
          {s.cap && <Cap text={s.cap} ground={ground} />}
        </div>
      );

    case "big":
      return (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {s.eyebrow && <Eyebrow text={s.eyebrow} ground={ground} />}
          <div style={{ display: "flex", fontSize: bigNumberSize(s.n), fontWeight: 800, letterSpacing: "-0.045em", lineHeight: 1, color: s.gold ? C.goldSoft : C.navy }}>
            {plain(s.n)}
          </div>
          <div style={{ width: 120, height: 8, background: C.gold, borderRadius: 4, margin: "40px 0 44px 0" }} />
          <Words text={s.h} size={headlineSize(s.h, "content")} color={ink} hi={hi} />
          {s.s && <Sub text={s.s} ground={ground} />}
          {s.cap && <Cap text={s.cap} ground={ground} />}
        </div>
      );

    case "stats":
      return (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {s.eyebrow && <Eyebrow text={s.eyebrow} ground={ground} />}
          <Words text={s.h} size={headlineSize(s.h, "content")} color={ink} hi={hi} />
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", marginTop: 56 }}>
            {s.stats.map((x, k) => (
              <div
                key={k}
                style={{
                  width: s.stats.length === 3 && k === 2 ? 896 : 436, display: "flex", flexDirection: "column",
                  background: k === 0 ? C.navy : C.panel, borderRadius: 20, padding: "38px 36px", marginBottom: 24,
                }}
              >
                <span style={{ fontSize: statNumberSize(x.n), fontWeight: 800, letterSpacing: "-0.03em", color: k === 0 ? C.goldSoft : C.navy, lineHeight: 1 }}>{plain(x.n)}</span>
                <span style={{ fontSize: 29, lineHeight: 1.35, marginTop: 18, color: k === 0 ? "#C9D2E0" : C.slate }}>{plain(x.label)}</span>
              </div>
            ))}
          </div>
          {s.cap && <Cap text={s.cap} ground={ground} />}
        </div>
      );

    case "bars": {
      const shares = barShares(s.rows);
      return (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {s.eyebrow && <Eyebrow text={s.eyebrow} ground={ground} />}
          <Words text={s.h} size={headlineSize(s.h, "content")} color={ink} hi={hi} />
          <div style={{ display: "flex", flexDirection: "column", marginTop: 60 }}>
            {s.rows.map((r, k) => (
              <div key={k} style={{ display: "flex", flexDirection: "column", marginBottom: 34 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
                  <span style={{ fontSize: 32, fontWeight: r.best ? 700 : 500, color: r.best ? C.navy : C.charcoal }}>{plain(r.label)}</span>
                  <span style={{ fontSize: 38, fontWeight: 800, color: r.best ? C.gold : C.navy }}>{plain(r.text)}</span>
                </div>
                <div style={{ display: "flex", width: 896, height: 30, background: C.panel, borderRadius: 15 }}>
                  <div style={{ width: Math.round(896 * shares[k]), height: 30, borderRadius: 15, background: r.best ? C.gold : C.navy, opacity: r.best ? 1 : 0.82 }} />
                </div>
              </div>
            ))}
          </div>
          {s.cap && <Cap text={s.cap} ground={ground} />}
        </div>
      );
    }

    case "steps":
      return (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {s.eyebrow && <Eyebrow text={s.eyebrow} ground={ground} />}
          <Words text={s.h} size={headlineSize(s.h, "content")} color={ink} hi={hi} />
          <div style={{ display: "flex", flexDirection: "column", marginTop: 54, position: "relative" }}>
            <div style={{ position: "absolute", left: 31, top: 40, width: 2, height: (s.steps.length - 1) * 128, background: C.line, display: "flex" }} />
            {s.steps.map((step, k) => (
              <div key={k} style={{ display: "flex", alignItems: "flex-start", minHeight: 128 }}>
                <div style={{ width: 64, height: 64, borderRadius: 32, background: k === 0 ? C.gold : C.navy, color: C.white, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 800, flexShrink: 0 }}>
                  {k + 1}
                </div>
                <div style={{ display: "flex", fontSize: s.steps.length > 4 ? 32 : 35, lineHeight: 1.36, color: C.charcoal, marginLeft: 34, paddingTop: 8, width: 796 }}>
                  {plain(step)}
                </div>
              </div>
            ))}
          </div>
          {s.cap && <Cap text={s.cap} ground={ground} />}
        </div>
      );

    case "list":
      return (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {s.eyebrow && <Eyebrow text={s.eyebrow} ground={ground} />}
          <Words text={s.h} size={headlineSize(s.h, "content")} color={ink} hi={hi} />
          <div style={{ display: "flex", flexDirection: "column", marginTop: 50 }}>
            {s.items.map((item, k) => (
              <div key={k} style={{ display: "flex", alignItems: "center", background: C.panel, borderRadius: 18, padding: s.items.length > 4 ? "22px 28px" : "28px 30px", marginBottom: s.items.length > 4 ? 14 : 18 }}>
                <Tick tone={s.tone} />
                <span style={{ display: "flex", fontSize: s.items.length > 4 ? 30 : 33, lineHeight: 1.33, color: C.charcoal, marginLeft: 26, width: 780 }}>{plain(item)}</span>
              </div>
            ))}
          </div>
          {s.cap && <Cap text={s.cap} ground={ground} />}
        </div>
      );

    case "compare":
      return (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {s.eyebrow && <Eyebrow text={s.eyebrow} ground={ground} />}
          <Words text={s.h} size={headlineSize(s.h, "content")} color={ink} hi={hi} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 54 }}>
            {[s.left, s.right].map((col, side) => {
              const good = side === 1;
              return (
                <div key={side} style={{ width: 436, display: "flex", flexDirection: "column", background: good ? C.navy : C.panel, borderRadius: 22, padding: "36px 32px" }}>
                  <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: good ? C.goldSoft : C.slate, marginBottom: 26 }}>
                    {plain(col.label)}
                  </span>
                  {col.items.map((it, k) => (
                    <div key={k} style={{ display: "flex", alignItems: "flex-start", marginBottom: 22 }}>
                      <Tick tone={good ? "good" : "bad"} onNavy={good} />
                      <span style={{ display: "flex", fontSize: col.items.length > 3 ? 28 : 30, lineHeight: 1.3, color: good ? C.white : C.charcoal, marginLeft: 18, width: 320, paddingTop: 4 }}>{plain(it)}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          {s.cap && <Cap text={s.cap} ground={ground} />}
        </div>
      );

    case "statement":
      return (
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ width: 120, height: 8, background: C.gold, borderRadius: 4, marginBottom: 52 }} />
          {s.eyebrow && <Eyebrow text={s.eyebrow} ground={ground} />}
          <Words text={s.h} size={headlineSize(s.h, "statement")} color={ink} hi={hi} lineHeight={1.1} />
          {s.s && <Sub text={s.s} ground={ground} size={36} />}
          {s.cap && <Cap text={s.cap} ground={ground} />}
        </div>
      );

    case "cta":
      return (
        <div style={{ display: "flex", flexDirection: "column", paddingBottom: 40 }}>
          {s.eyebrow && <Eyebrow text={s.eyebrow} ground={ground} />}
          <Words text={s.h} size={headlineSize(s.h, "cover")} color={ink} hi={hi} lineHeight={1.04} />
          {s.s && <Sub text={s.s} ground={ground} size={36} />}
          <div style={{ display: "flex", marginTop: 64 }}>
            <div style={{ display: "flex", alignItems: "center", background: C.gold, color: C.navy, borderRadius: 999, padding: "26px 44px", fontSize: 32, fontWeight: 800, letterSpacing: "0.02em" }}>
              {plain(s.site)}
            </div>
          </div>
          {s.cap && <Cap text={s.cap} ground={ground} />}
        </div>
      );
  }
}

function SlideView({ spec, index, logoWhite, logoNavy }: { spec: CarouselSpec; index: number; logoWhite: string; logoNavy: string }) {
  const s = spec.slides[index];
  const ground = groundOf(s);
  return (
    <Frame
      ground={ground}
      index={index}
      total={spec.slides.length}
      logo={ground === "navy" ? logoWhite : logoNavy}
    >
      <Body s={s} ground={ground} />
    </Frame>
  );
}

/* ------------------------------------------------------------------ outputs */

/** One slide as PNG bytes. `index` is 0-based and must be in range. */
export async function renderSlidePng(spec: CarouselSpec, index: number): Promise<Uint8Array> {
  if (!Number.isInteger(index) || index < 0 || index >= spec.slides.length) {
    throw new RangeError(`No slide ${index + 1}; this carousel has ${spec.slides.length}.`);
  }
  const { fonts, logoWhite, logoNavy } = await assets();
  const res = new ImageResponse(<SlideView spec={spec} index={index} logoWhite={logoWhite} logoNavy={logoNavy} />, {
    width: SLIDE_W,
    height: SLIDE_H,
    fonts,
  });
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * Every slide, one PDF page each, at the slide's own pixel size.
 *
 * Rendered one after another rather than all at once: resvg holds a full
 * 1080x1350 bitmap per slide, and ten at once is memory for no gain in a
 * single-request function.
 */
export async function renderCarouselPdf(spec: CarouselSpec, title: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setAuthor("Funded Capital");
  pdf.setCreator("fundedcapital.com");
  for (let i = 0; i < spec.slides.length; i++) {
    const png = await pdf.embedPng(await renderSlidePng(spec, i));
    const page = pdf.addPage([SLIDE_W, SLIDE_H]);
    page.drawImage(png, { x: 0, y: 0, width: SLIDE_W, height: SLIDE_H });
  }
  return pdf.save();
}
