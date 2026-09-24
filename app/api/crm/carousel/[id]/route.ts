import { NextResponse } from "next/server";
import { isCrmStaff } from "@/lib/crm/access";
import { QueueApiError, apiGetCarousel } from "@/lib/marketing/queue.api.server";
import { getCarouselForStaff } from "@/lib/marketing/requests.server";
import { fileNameFor, plain, type CarouselSpec } from "@/lib/marketing/carousel";
import { renderCarouselPdf, renderSlidePng } from "@/lib/marketing/carousel.render";

/**
 * A blog post's LinkedIn carousel, drawn on request from the words stored with
 * the request.
 *
 *   GET /api/crm/carousel/<id>            → the PDF LinkedIn's document post takes (download)
 *   GET /api/crm/carousel/<id>?inline=1   → the same PDF, opened in the browser
 *   GET /api/crm/carousel/<id>?slide=3    → one slide as a PNG, for previews
 *
 * TWO WAYS IN, and only two. Luis, signed in and on the staff allowlist, from
 * /crm/marketing. Or the daily task with the queue token, so it can LOOK at the
 * slides it just attached before it reports them done. Anyone else gets a 404,
 * like every other /crm surface — the route does not advertise itself.
 *
 * WHY DRAWN AND NOT STORED. The first carousels were PNGs uploaded to Drive
 * from the task's sandbox, and the upload failed from the cloud. Words are a
 * few kilobytes and go through the same API as the blog draft; the design lives
 * in lib/marketing/carousel.render.tsx, so improving it improves every carousel
 * on the next push.
 *
 * PERFORMANCE. Staff-only and rare — a few requests a day. A slide is about
 * 400 ms to draw and a full PDF about 4 s, well inside the 300 s function
 * limit. Responses are private and never cached by a CDN.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_FOUND = () => NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

function bytes(body: Uint8Array, type: string, extra: Record<string, string> = {}) {
  return new Response(body as unknown as BodyInit, {
    headers: { "content-type": type, "cache-control": "private, no-store", ...extra },
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NOT_FOUND();

  let spec: CarouselSpec;
  try {
    if (request.headers.get("authorization")) {
      // The task. apiGetCarousel checks the token itself and throws 401/403.
      const found = await apiGetCarousel(id);
      if (!found) return NOT_FOUND();
      spec = found;
    } else {
      if (!(await isCrmStaff())) return NOT_FOUND();
      const found = await getCarouselForStaff(id);
      if (!found) return NOT_FOUND();
      if ("error" in found) {
        return NextResponse.json({ ok: false, error: `This carousel no longer passes the checks: ${found.error}` }, { status: 422 });
      }
      spec = found.spec;
    }
  } catch (err) {
    if (err instanceof QueueApiError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    }
    console.error("[api/crm/carousel] read", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }

  const url = new URL(request.url);
  const slideParam = url.searchParams.get("slide");

  try {
    if (slideParam !== null) {
      const n = Number(slideParam);
      if (!Number.isInteger(n) || n < 1 || n > spec.slides.length) {
        return NextResponse.json(
          { ok: false, error: `slide must be 1 to ${spec.slides.length}.` },
          { status: 400 },
        );
      }
      return bytes(await renderSlidePng(spec, n - 1), "image/png");
    }

    const name = fileNameFor(spec);
    const disposition = url.searchParams.get("inline") === "1" ? "inline" : "attachment";
    return bytes(await renderCarouselPdf(spec, plain(spec.slides[0].h)), "application/pdf", {
      "content-disposition": `${disposition}; filename="${name}"`,
    });
  } catch (err) {
    console.error("[api/crm/carousel] render", err);
    return NextResponse.json({ ok: false, error: "The slides could not be drawn." }, { status: 500 });
  }
}
