/**
 * Analytics — the measurement layer for fundedcapital.com.
 *
 * Added 2026-08-30. Until this existed the site had no traffic or conversion
 * data at all, which is why a sixteen-day lead gap could not be diagnosed:
 * there was no way to tell "nobody visited" from "visitors bounced off the
 * form". Every question about lead volume was an opinion.
 *
 * Two independent measurement systems, deliberately:
 *   1. Vercel Web Analytics + Speed Insights — cookieless, first-party, ~1KB.
 *      Traffic and real-user Core Web Vitals. Always on.
 *   2. Google Analytics 4 — the funnel. Only loads when NEXT_PUBLIC_GA_ID is
 *      set, so the site ships with zero third-party JS until that env var
 *      exists in Vercel.
 *
 * No npm dependency is used for either. Both are loaded as plain scripts via
 * next/script, which keeps the bundle unchanged, avoids a lockfile change, and
 * means a deploy is a push and nothing else.
 *
 * EVERY function here is a safe no-op when analytics is absent (server render,
 * blocked by an ad blocker, GA not configured). Nothing in this file may ever
 * be able to throw inside a form submit handler — losing a lead to a analytics
 * error would be worse than having no analytics.
 */

export const GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? "";
export const analyticsEnabled = GA_ID.length > 0;

type ParamValue = string | number | boolean | undefined;
type Params = Record<string, ParamValue>;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

/** True only in a browser that actually has gtag loaded. */
function ready(): boolean {
  return typeof window !== "undefined" && typeof window.gtag === "function";
}

/**
 * Record a page view. GA is configured with send_page_view:false so that the
 * App Router can send exactly one view per navigation — otherwise the initial
 * load is counted twice.
 */
export function pageview(path: string): void {
  if (!ready()) return;
  try {
    window.gtag!("event", "page_view", {
      page_path: path,
      page_location: window.location.href,
      page_title: document.title,
    });
  } catch {
    /* measurement must never break the page */
  }
}

/** Fire a named GA4 event. Undefined params are dropped. */
export function track(event: string, params: Params = {}): void {
  if (!ready()) return;
  try {
    const clean: Params = {};
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") clean[k] = v;
    }
    window.gtag!("event", event, clean);
  } catch {
    /* measurement must never break the page */
  }
}

/* ────────────────────────── the funnel events ──────────────────────────
 * Three events, in the order a visitor hits them. Together they answer the
 * question the August lead gap could not answer:
 *
 *   page_view on /apply   →  did anyone arrive?
 *   form_start            →  did they begin filling it in?
 *   generate_lead         →  did they finish?
 *
 * form_start ÷ page_view is interest. generate_lead ÷ form_start is the
 * completion rate — the number that tells us whether the twelve required
 * fields are costing us leads, and the number a two-step form has to beat.
 */

/** Fired once per page, the first time the visitor touches any field. */
export function trackFormStart(formType: "apply" | "contact"): void {
  track("form_start", { form_type: formType });
}

/** Fired only after the server has confirmed the lead was captured. */
export function trackLead(
  formType: "apply" | "contact",
  detail: { loanType?: string; smsConsent?: boolean } = {}
): void {
  // generate_lead is a GA4 recommended event, so it appears in the standard
  // reports and can be marked as a key event (conversion) without setup.
  track("generate_lead", {
    form_type: formType,
    loan_type: detail.loanType,
    sms_consent: detail.smsConsent,
  });
}

/**
 * Fired when the visitor saw the failure UI instead of the thank-you page.
 * If this ever shows up in the reports, a real person tried to apply and the
 * pipeline turned them away — treat any occurrence as an incident.
 */
export function trackLeadError(
  formType: "apply" | "contact",
  status: number | string
): void {
  track("lead_submit_failed", { form_type: formType, status: String(status) });
}
