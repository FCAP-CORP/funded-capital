/**
 * Draw a carousel spec to PNGs and a PDF on disk, without the site running.
 * Usage: npx tsx --conditions=react-server scripts/carousel-preview.tsx <spec.json> <out-dir>
 * (The react-server condition lets the renderer's "server-only" import load.)
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { parseCarouselSpec, fileNameFor, plain } from "../lib/marketing/carousel";
import { renderSlidePng, renderCarouselPdf } from "../lib/marketing/carousel.render";

async function main() {
  const [specPath, outDir] = process.argv.slice(2);
  if (!specPath || !outDir) {
    console.error("Usage: carousel-preview <spec.json> <out-dir>");
    process.exit(2);
  }
  const parsed = parseCarouselSpec(JSON.parse(readFileSync(specPath, "utf8")));
  if (!parsed.ok) {
    console.error("REFUSED:", parsed.error);
    process.exit(1);
  }
  mkdirSync(outDir, { recursive: true });
  const spec = parsed.value;
  const t0 = Date.now();
  for (let i = 0; i < spec.slides.length; i++) {
    writeFileSync(join(outDir, `slide${i + 1}.png`), await renderSlidePng(spec, i));
  }
  const t1 = Date.now();
  writeFileSync(join(outDir, fileNameFor(spec)), await renderCarouselPdf(spec, plain(spec.slides[0].h)));
  console.log(`${spec.slides.length} slides in ${t1 - t0} ms; pdf in ${Date.now() - t1} ms -> ${outDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
