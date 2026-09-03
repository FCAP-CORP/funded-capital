"use client";

import { useEffect, useState } from "react";
import {
  HONEYPOT_TEXT_FIELD,
  HONEYPOT_CHECK_FIELD,
  FORM_RENDERED_FIELD,
} from "@/lib/antispam";

/**
 * Invisible bot traps for the public lead forms. Drop one inside any <form>
 * that posts to /api/lead.
 *
 * Three fields, none of them visible or reachable by a real visitor:
 *   - a text honeypot: form-filling bots populate every text input they find
 *   - a checkbox honeypot: bots tick every box (our attacker ticked the real
 *     SMS consent box on 100% of submissions)
 *   - a render timestamp: proves the POST came from a page a browser actually
 *     rendered, and that a human spent time on it
 *
 * Accessibility: the wrapper is aria-hidden and every control is removed from
 * the tab order, so screen readers and keyboard users never encounter it.
 *
 * Performance: no JavaScript beyond a single state set on mount, no network
 * call, no third-party script. Zero effect on LCP or CLS — the wrapper is
 * absolutely positioned out of flow.
 *
 * Conversion: invisible to real visitors, which is the point. A CAPTCHA on a
 * loan application form costs real applications; this costs none.
 */
export default function FormShield() {
  const [renderedAt, setRenderedAt] = useState("");

  // Set after hydration so the value reflects when THIS visitor loaded the
  // form, not when the page was built or cached at the edge.
  useEffect(() => {
    setRenderedAt(String(Date.now()));
  }, []);

  return (
    <div
      aria-hidden="true"
      className="absolute w-px h-px -left-[9999px] overflow-hidden"
    >
      <label htmlFor={HONEYPOT_TEXT_FIELD}>
        Leave this field empty
        <input
          id={HONEYPOT_TEXT_FIELD}
          name={HONEYPOT_TEXT_FIELD}
          type="text"
          tabIndex={-1}
          autoComplete="off"
          defaultValue=""
        />
      </label>
      <label htmlFor={HONEYPOT_CHECK_FIELD}>
        Do not check this box
        <input
          id={HONEYPOT_CHECK_FIELD}
          name={HONEYPOT_CHECK_FIELD}
          type="checkbox"
          tabIndex={-1}
          autoComplete="off"
          value="true"
        />
      </label>
      <input
        type="hidden"
        name={FORM_RENDERED_FIELD}
        value={renderedAt}
        readOnly
      />
    </div>
  );
}
