import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AlertTriangle, CircleCheck, CircleHelp, Download, ExternalLink, FileText, GalleryHorizontal, TriangleAlert } from "lucide-react";
import { isCrmStaff } from "@/lib/crm/access";
import { getAllPosts } from "@/lib/blog";
import { listRequests, lastPublishedByChannel } from "@/lib/marketing/requests.server";
import {
  CHANNELS,
  CHANNEL_SPEC,
  STATUS_LABEL,
  cadenceFor,
  isSettled,
  stuckRequests,
  type Cadence,
  type CadenceLevel,
  type ContentStatus,
} from "@/lib/marketing/requests";
import { articleWordCount, effectiveStatus, safeHref, type EffectiveStatus } from "@/lib/marketing/published";
import { ageLabel, shortDate } from "@/lib/crm/view";
import { daysSince } from "@/lib/crm/view";
import { GridSkeleton, StatSkeleton } from "../Skeleton";
import { CancelRequest, MarkPublished, RequestForm, RetryRequest } from "./Controls";

/**
 * Marketing — is it running, and what have we asked for?
 *
 * THE CADENCE CARDS COME FIRST, AND THAT IS THE WHOLE POINT. The blog engine
 * was meant to publish daily and stopped on 30 August 2026; nobody noticed for
 * twenty-four days, because a pipeline that stops produces no error. A screen
 * with a "write me a post" button at the top would have made that worse — more
 * drafts, same silence. So the first thing on the page is how long it has been.
 *
 * THE PORTAL ASKS; IT DOES NOT WRITE. Adding a request inserts a row. A
 * scheduled Claude task picks it up and uses the brand-voice and research skills
 * that already exist. Keeping generation out of the web app means one definition
 * of the voice rather than two, and no model API key in a public-facing service.
 *
 * NO `export const dynamic` — same rule as every /crm page. Static shell,
 * everything live inside <Suspense>.
 *
 * PERFORMANCE: the cadence cards and the whole queue table render on the server;
 * the only client JavaScript is the request form and the row buttons. The blog's
 * cadence is read from the MDX files already on disk, so it costs a directory
 * read rather than a network call.
 *
 * CONVERSION — the internal kind: the thing most likely to make Funded Capital
 * money here is not a new post, it is the 48 drafts that were written and never
 * sent. So a draft row carries its link and a one-click "Published", and a
 * failure carries the reason and a retry that keeps the brief.
 *
 * BLOG "PUBLISHED" COMES FROM THE SITE (24 Sep 2026). A drafted blog request
 * whose slug is a live post is shown as published, with the post's date, even
 * if nobody clicked the button — `lib/marketing/published.ts` decides, and the
 * page never writes to the database while rendering. A blog draft that is not
 * live yet can be read right here: a native <details>, no JavaScript, and the
 * body is only fetched for those rows.
 */

export const metadata = {
  title: "Marketing | Funded Capital Lending OS",
};

const LEVEL_STYLE: Record<CadenceLevel, { box: string; value: string; Icon: React.ComponentType<{ size?: number; className?: string }> }> = {
  ok:       { box: "border-emerald-200 bg-emerald-50", value: "text-emerald-800", Icon: CircleCheck },
  slipping: { box: "border-amber-200 bg-amber-50",     value: "text-amber-800",   Icon: TriangleAlert },
  stalled:  { box: "border-red-200 bg-red-50",         value: "text-red-800",     Icon: AlertTriangle },
  unknown:  { box: "border-slate-200 bg-white",        value: "text-slate-700",   Icon: CircleHelp },
};

/**
 * Never colour alone. Each card carries an icon and a word as well as a tone,
 * so a stalled channel is still obviously stalled in greyscale.
 */
function CadenceCard({ cadence }: { cadence: Cadence }) {
  const spec = CHANNEL_SPEC[cadence.channel];
  const style = LEVEL_STYLE[cadence.level];
  const { Icon } = style;

  return (
    <div className={`rounded-xl border p-4 ${style.box}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">{spec.label}</p>
        <Icon size={15} className={style.value} />
      </div>
      <p className={`mt-1 text-xl font-bold ${style.value}`}>{cadence.headline}</p>
      <p className="mt-0.5 text-xs text-slate-600">
        {cadence.level === "stalled" && "Well past target. "}
        {cadence.level === "slipping" && "Behind target. "}
        Aiming for {spec.targetDays === 1 ? "one a day" : `one every ${spec.targetDays} days`}.
      </p>
      {cadence.caveat && <p className="mt-1 text-[11px] leading-snug text-slate-500">{cadence.caveat}</p>}
    </div>
  );
}

const STATUS_STYLE: Record<ContentStatus, string> = {
  requested:   "bg-slate-100 text-slate-700 border-slate-200",
  in_progress: "bg-sky-50 text-sky-800 border-sky-200",
  drafted:     "bg-gold-400/20 text-gold-700 border-gold-400/40",
  published:   "bg-emerald-50 text-emerald-800 border-emerald-200",
  failed:      "bg-red-50 text-red-700 border-red-200",
  cancelled:   "bg-slate-100 text-slate-500 border-slate-200",
};

/**
 * Where a draft is, in a form that actually opens.
 *
 * A blog draft's `draft_url` is a repository path, not a URL — rendering it as
 * a link opened a 404 under /crm. So a blog row shows the post once it is live
 * and the path as plain text until then. Other channels link out, but only to
 * http(s): the value is written by a task holding a token, not by a person.
 */
function DraftLink({ channel, draftUrl, eff }: { channel: string; draftUrl: string | null; eff: EffectiveStatus }) {
  if (!draftUrl) return null;
  if (channel === "blog") {
    if (eff.fromSite && eff.slug) {
      return (
        <a href={`/blog/${eff.slug}`} target="_blank" rel="noopener noreferrer"
           className="mt-1 inline-flex items-center gap-1 text-xs text-gold-700 hover:underline">
          View the live post <ExternalLink size={11} />
        </a>
      );
    }
    return <p className="mt-1 font-mono text-[11px] text-slate-500 break-all">{draftUrl}</p>;
  }
  const href = safeHref(draftUrl);
  if (!href) return <p className="mt-1 text-[11px] text-slate-500 break-all">{draftUrl}</p>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
       className="mt-1 inline-flex items-center gap-1 text-xs text-gold-700 hover:underline">
      Open the draft <ExternalLink size={11} />
    </a>
  );
}

/**
 * Read a blog draft without leaving the page, and without any JavaScript.
 *
 * A native <details> opens and closes in the browser on its own; the MDX is
 * server-rendered as escaped text inside it, so nothing in a draft can run.
 */
/**
 * The LinkedIn carousel for a post, when the daily task made one.
 *
 * Plain links to the route that draws it — no client JavaScript, and nothing
 * is drawn until it is clicked. "Preview" opens the PDF in a tab; "Download"
 * saves the file LinkedIn's document post takes.
 */
function CarouselLinks({ id }: { id: string }) {
  const href = `/api/crm/carousel/${id}`;
  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <span className="inline-flex items-center gap-1 font-semibold text-navy-900">
        <GalleryHorizontal size={13} aria-hidden="true" /> LinkedIn carousel
      </span>
      <a href={`${href}?inline=1`} target="_blank" rel="noopener noreferrer" className="text-gold-700 hover:underline">
        Preview
      </a>
      <a href={href} download className="inline-flex items-center gap-1 text-gold-700 hover:underline">
        <Download size={12} aria-hidden="true" /> Download PDF
      </a>
    </p>
  );
}

function DraftReader({ body }: { body: string }) {
  const words = articleWordCount(body);
  return (
    <details className="mt-2">
      <summary className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-gold-700 hover:underline">
        <FileText size={11} /> Read the draft · {words.toLocaleString("en-US")} words
      </summary>
      <p className="mt-1 text-[11px] text-slate-500">
        To publish it: run fc-pull-drafts.bat, look it over in content\blog, then run publish-blog.bat.
      </p>
      <pre className="mt-2 max-h-96 max-w-2xl overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-700">
        {body}
      </pre>
    </details>
  );
}

async function Marketing() {
  // Checked here as well as in the layout — a layout and its page render
  // concurrently. The server module asserts a third time, for itself.
  if (!(await isCrmStaff())) notFound();

  const [requests, portalPublished] = await Promise.all([listRequests(), lastPublishedByChannel()]);

  /*
   * The blog's history is the MDX files, not this table.
   *
   * Reading it from content_requests would report "no record yet" on day one
   * despite fifty published posts — which is the opposite of the mistake this
   * screen exists to catch. The other two channels have no archive here, so
   * they are measured from the portal and say so on the card.
   */
  const posts = getAllPosts();
  const newestPost = posts[0]?.date ?? null;
  const liveSlugs = new Map(posts.map((p) => [p.slug, p.date] as const));

  const cadences = CHANNELS.map((channel) => {
    if (channel === "blog" && newestPost) {
      return cadenceFor({ channel, lastPublishedAt: newestPost, source: "archive" });
    }
    return cadenceFor({ channel, lastPublishedAt: portalPublished[channel] ?? null, source: "portal" });
  });

  const stuck = stuckRequests(requests);
  // What the screen says, as opposed to what the table says. Read-only.
  const shown = requests.map((r) => ({ r, eff: effectiveStatus(r, liveSlugs) }));
  const live = shown.filter(({ eff }) => !isSettled(eff.status));
  const settled = shown.filter(({ eff }) => isSettled(eff.status));

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        {cadences.map((c) => <CadenceCard key={c.channel} cadence={c} />)}
      </div>

      {stuck.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900 flex items-center gap-2">
            <TriangleAlert size={16} /> {stuck.length} {stuck.length === 1 ? "request has" : "requests have"} been picked up and not finished
          </p>
          <p className="mt-1 text-xs text-amber-800">
            Something claimed the job and did not come back. Nothing will retry on its own — use
            &ldquo;Try again&rdquo; below, which keeps the brief.
          </p>
        </div>
      )}

      <div className="mb-8"><RequestForm /></div>

      <section className="mb-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <h2 className="text-lg font-bold text-navy-900">In the queue</h2>
          <p className="text-sm text-slate-500">{live.length === 0 ? "Nothing waiting" : `${live.length} open`}</p>
        </div>

        {live.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
            <p className="text-sm text-slate-600">
              Nothing queued. The cadence cards above still tell you whether anything is going out.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                  <th className="py-2.5 px-4 font-semibold">Channel</th>
                  <th className="py-2.5 pr-4 font-semibold">Topic</th>
                  <th className="py-2.5 pr-4 font-semibold">Status</th>
                  <th className="py-2.5 pr-4 font-semibold">Asked</th>
                  <th className="py-2.5 pr-4 font-semibold text-right">&nbsp;</th>
                </tr>
              </thead>
              <tbody>
                {live.map(({ r, eff }) => (
                  <tr key={r.id} className="border-t border-slate-100 align-top">
                    <td className="py-3 px-4 text-sm text-slate-700 whitespace-nowrap">{CHANNEL_SPEC[r.channel].label}</td>
                    <td className="py-3 pr-4">
                      <p className="text-sm font-medium text-navy-900">{r.topic}</p>
                      {r.notes && <p className="mt-0.5 text-xs text-slate-500">{r.notes}</p>}
                      {r.draftSummary && <p className="mt-1 text-xs text-slate-600">{r.draftSummary}</p>}
                      {r.error && <p className="mt-1 text-xs text-red-600">{r.error}</p>}
                      <DraftLink channel={r.channel} draftUrl={r.draftUrl} eff={eff} />
                      {r.hasCarousel && <CarouselLinks id={r.id} />}
                      {eff.status === "drafted" && r.draftBody && <DraftReader body={r.draftBody} />}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[eff.status]}`}>
                        {STATUS_LABEL[eff.status]}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-sm tabular-nums text-slate-600 whitespace-nowrap">
                      {ageLabel(daysSince(r.requestedAt))}
                    </td>
                    <td className="py-3 pr-4 text-right whitespace-nowrap">
                      <span className="inline-flex items-center gap-2">
                        {eff.status === "drafted" && <MarkPublished id={r.id} />}
                        {eff.status === "failed" && <RetryRequest id={r.id} />}
                        <CancelRequest id={r.id} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {settled.length > 0 && (
        <section>
          <h2 className="text-lg font-bold text-navy-900 mb-3">Done</h2>
          <ul className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
            {settled.slice(0, 25).map(({ r, eff }) => {
              const link = eff.fromSite && eff.slug ? `/blog/${eff.slug}` : safeHref(r.publishedUrl);
              return (
                <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5">
                  <span className="text-sm text-slate-700">
                    <span className="text-slate-500">{CHANNEL_SPEC[r.channel].label}</span> — {r.topic}
                    {r.hasCarousel && <CarouselLinks id={r.id} />}
                  </span>
                  <span className="text-xs text-slate-500">
                    {STATUS_LABEL[eff.status]}
                    {eff.publishedAt && ` · ${shortDate(eff.publishedAt)}`}
                    {eff.fromSite && " · live on the site"}
                    {link && (
                      <>
                        {" · "}
                        <a href={link} target="_blank" rel="noopener noreferrer" className="text-gold-700 hover:underline">
                          link
                        </a>
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}

export default function MarketingPage() {
  return (
    <main className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-navy-900">Marketing</h1>
        <p className="mt-1 text-sm text-slate-500">
          Whether anything is going out, and what you have asked for next.
        </p>
      </header>

      <Suspense fallback={<><StatSkeleton /><GridSkeleton /></>}>
        <Marketing />
      </Suspense>
    </main>
  );
}
