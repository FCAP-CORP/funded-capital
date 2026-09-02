"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Script from "next/script";
import { GA_ID, analyticsEnabled, pageview } from "@/lib/analytics";

/**
 * Mounts the site's measurement scripts. Rendered once, from the root layout.
 *
 * Performance notes:
 *  - Vercel's two scripts are first-party (served from /_vercel/... on our own
 *    domain, so no extra DNS lookup, no third-party connection, no cookie) and
 *    together are about 2KB. They are loaded lazyOnload so they never compete
 *    with the hero image or the form for bandwidth.
 *  - GA4 is afterInteractive: it starts after the page is usable, so it cannot
 *    delay first paint or push out Largest Contentful Paint. It is also the
 *    only third-party request on the site, and it does not load at all unless
 *    NEXT_PUBLIC_GA_ID is set.
 *  - Nothing here renders visible DOM, so it cannot cause layout shift.
 *
 * Conversion note: this component is what makes every other conversion
 * decision measurable. Until it shipped, changes to the funnel could only be
 * argued about, not tested.
 */

/**
 * Page views on navigation. The App Router does not reload the document
 * between pages, so without this GA would only ever record the landing page —
 * and /apply, which is almost always reached by an internal click, would look
 * like it had no traffic at all.
 *
 * The query string is kept deliberately: /apply?type=broker is a genuinely
 * different funnel from /apply, and we need them separated in the reports.
 */
function PageViews() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!analyticsEnabled || !pathname) return;
    const qs = searchParams?.toString();
    pageview(qs ? `${pathname}?${qs}` : pathname);
  }, [pathname, searchParams]);

  return null;
}

export default function Analytics() {
  return (
    <>
      {/* Vercel Web Analytics — cookieless traffic, first-party path. */}
      <Script
        src="/_vercel/insights/script.js"
        strategy="lazyOnload"
        data-endpoint="/_vercel/insights"
      />

      {/* Vercel Speed Insights — real-user Core Web Vitals from actual
          visitors, which is the number that matters rather than a lab score. */}
      <Script src="/_vercel/speed-insights/script.js" strategy="lazyOnload" />

      {analyticsEnabled && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
            strategy="afterInteractive"
          />
          <Script id="ga-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              window.gtag = gtag;
              gtag('js', new Date());
              gtag('config', '${GA_ID}', {
                send_page_view: false,
                anonymize_ip: true
              });
            `}
          </Script>
          {/* useSearchParams needs a Suspense boundary in the App Router.
              The boundary is empty and client-only, so it streams nothing and
              cannot hold up the page. */}
          <Suspense fallback={null}>
            <PageViews />
          </Suspense>
        </>
      )}
    </>
  );
}
