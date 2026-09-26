import { getImageProps } from "next/image";
import { STATS } from "@/lib/site/facts";

/**
 * The home page's one photograph: a full-bleed band under the proof strip.
 *
 * It sits below the fold on purpose, so the headline, the brass button and the
 * figures load first and stay the strongest things on screen. The photo is
 * lazy-loaded and never competes for Largest Contentful Paint.
 *
 * Brand protection is done with three layers over the photo, not by editing
 * the file: a solid-to-clear navy fade from the proof strip above (the band
 * reads as a continuation of the navy, not a new block), a flat navy wash that
 * pulls the warm stock colours toward the palette, and a navy floor so the
 * caption stays AA-legible at any crop.
 *
 * Art direction: a wide 12:5 crop for tablet and desktop, a 4:5 crop for
 * phones, via <picture> so each device downloads only its own file.
 *
 * Source: Adobe Stock #321718959, licensed on Funded Capital's Adobe account.
 * Keep the caption about the asset class; it is not a funded deal and must
 * never be captioned as one.
 */
export function HomePhotoBand() {
  const common = { alt: "", sizes: "100vw" } as const;
  const {
    props: { srcSet: wide },
  } = getImageProps({ ...common, src: "/images/home-neighborhood-wide.jpg", width: 2400, height: 1000 });
  const {
    props: { srcSet: tall, ...img },
  } = getImageProps({ ...common, src: "/images/home-neighborhood-tall.jpg", width: 1200, height: 1500 });

  return (
    <section aria-label="The homes we lend on" className="relative isolate overflow-hidden bg-deep-2">
      <picture>
        <source media="(min-width: 768px)" srcSet={wide} />
        <source srcSet={tall} />
        <img
          {...img}
          loading="lazy"
          decoding="async"
          className="block h-[560px] w-full object-cover md:h-auto md:max-h-[640px] md:min-h-[420px] md:aspect-[12/5]"
        />
      </picture>

      {/* 1. Fade in from the proof strip */}
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1/4 bg-gradient-to-b from-deep-2 to-transparent" />
      {/* 2. Navy wash: keeps the photo inside the palette */}
      <div aria-hidden="true" className="absolute inset-0 bg-deep/25" />
      {/* 3. Floor for the caption */}
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-deep/90 to-transparent" />

      <div className="section-container absolute inset-x-0 bottom-0 pb-10 lg:pb-14">
        <div className="flex max-w-2xl flex-col gap-3 border-l-2 border-brass-500 pl-5 text-bone">
          <p className="font-figure text-xs tracking-[0.14em] text-brass-300">WHAT WE LEND ON</p>
          <p className="font-headline text-3xl font-semibold leading-tight sm:text-4xl lg:text-[44px]">
            Flips, rentals and new builds, funded in {STATS.states} states.
          </p>
        </div>
      </div>
    </section>
  );
}
