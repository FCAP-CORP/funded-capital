"use client";

import { useEffect, useRef } from "react";
import {
  HONEYPOT_TEXT_FIELD,
  HONEYPOT_CHECK_FIELD,
  FORM_ELAPSED_FIELD,
} from "@/lib/antispam";

/**
 * Invisible bot traps for the public lead forms. Drop one inside any <form>
 * that posts to /api/lead.
 *
 * Three fields, none visible or reachable by a real visitor:
 *   - a text honeypot: form-filling bots populate every text input they find
 *   - a checkbox honeypot: bots tick every box (our attacker ticked the real
 *     SMS consent box on 100% of its submissions)
 *   - how long the visitor spent on the form
 *
 * THREE THINGS HERE ARE LOAD-BEARING. All three were learned by breaking a
 * real submission on 2026-09-03, hours after the first version shipped.
 *
 * 1. THE FIELD NAMES MUST STAY MEANINGLESS. The first version named the text
 *    honeypot "website". Password managers and Chrome autofill match on names
 *    like that and fill the field even though it sits off-screen — so a
 *    visitor with autofill enabled tripped the trap by doing nothing wrong.
 *    The data-* attributes below are the documented opt-outs for 1Password,
 *    LastPass, Bitwarden and Dashlane; autoComplete="off" alone is ignored by
 *    most of them.
 *
 * 2. THE TIMER MUST BE performance.now(), NOT Date.now(). We send ELAPSED
 *    milliseconds measured entirely inside this browser, never a wall-clock
 *    timestamp the server has to difference against its own clock. Wall-clock
 *    comparison made every visitor whose machine clock ran fast look like an
 *    instant submit. performance.now() is monotonic — no skew, no timezone,
 *    never negative.
 *
 * 3. THE ELAPSED VALUE MUST BE WRITTEN AT SUBMIT TIME, from a listener, not
 *    rendered as JSX. These forms are uncontrolled: React does not re-render
 *    on keystrokes, so a value computed during render would be frozen at
 *    roughly zero and make every genuine submission look instant. The
 *    capture-phase submit listener below runs before the form's own onSubmit
 *    builds its FormData, so the value is always current.
 *
 * Accessibility: the wrapper is aria-hidden and every control is out of the
 * tab order, so screen readers and keyboard users never meet it.
 *
 * Performance: two refs and one listener, no state, no network call, no
 * third-party script. Absolutely positioned, so no effect on LCP or CLS.
 *
 * Conversion: invisible to real visitors, which is the point. A CAPTCHA on a
 * loan application costs real applications; this costs none — as long as the
 * three rules above hold.
 */
export default function FormShield() {
  const elapsedInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const input = elapsedInput.current;
    const form = input?.form;
    if (!input || !form) return;

    const mountedAt = performance.now();
    const stamp = () => {
      input.value = String(Math.round(performance.now() - mountedAt));
    };

    // Keep it fresh as they type, and — the one that matters — write it once
    // more in the capture phase of submit, before any FormData is built.
    form.addEventListener("input", stamp);
    form.addEventListener("submit", stamp, true);
    stamp();

    return () => {
      form.removeEventListener("input", stamp);
      form.removeEventListener("submit", stamp, true);
    };
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
          data-1p-ignore="true"
          data-lpignore="true"
          data-bwignore="true"
          data-form-type="other"
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
          data-1p-ignore="true"
          data-lpignore="true"
          data-bwignore="true"
          data-form-type="other"
        />
      </label>
      <input
        ref={elapsedInput}
        type="hidden"
        name={FORM_ELAPSED_FIELD}
        defaultValue=""
      />
    </div>
  );
}
