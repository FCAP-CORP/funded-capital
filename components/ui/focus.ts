/**
 * Focus rings, in one place.
 *
 * GOLD-700 ON LIGHT SURFACES, NOT GOLD-500. A focus ring is a "non-text"
 * element and WCAG 2.2 asks for 3:1 against what it sits on. gold-500 on white
 * is 2.3:1 and gold-600 is 2.9:1 — both fail. gold-700 is 4.1:1. On navy the
 * lighter gold-400 is 8:1. The offset puts a white (or navy) gap between the
 * ring and the control so it reads on any fill colour.
 *
 * `focus-visible`, not `focus`: the ring shows for keyboard users and not on
 * every mouse click, which is what browsers do natively.
 */
export const FOCUS_RING =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-700 focus-visible:ring-offset-2 focus-visible:ring-offset-white";

/** For controls on the navy rail and navy banners. */
export const FOCUS_RING_DARK =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-900";

/** Inside a clipped container (a table cell, a list row) where an offset ring would be cut off. */
export const FOCUS_RING_INSET =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-700";

/** Text inputs: the border changes as well as the ring, so focus survives Windows high-contrast mode. */
export const FIELD_FOCUS =
  "focus:border-gold-700 focus:outline-none focus:ring-2 focus:ring-gold-700/30";
