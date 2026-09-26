import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getAllPosts } from "@/lib/blog";
import { STATS } from "@/lib/site/facts";
import { Eyebrow } from "@/components/site/ui";

export const metadata: Metadata = {
  title: "Real Estate Investor Blog — Hard Money, DSCR & Fix & Flip Tips | Funded Capital",
  description:
    "Expert guides on hard money loans, DSCR financing, fix & flip strategies, and real estate investing. Written by Funded Capital — Miami's private real estate lender.",
};

/*
 * Insights index ("Ledger", 25 Sep 2026).
 *
 * PERFORMANCE: a server component with no client JavaScript and no images.
 * Post metadata comes from the MDX front matter at build time, so the page
 * ships as static HTML.
 *
 * CONVERSION: the newest post gets the room of a front page, so a returning
 * investor sees what is new first; the rest sit in a ruled grid that scans
 * like a table of contents. Every card is one large link target.
 */

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function BlogPage() {
  const posts = getAllPosts();
  const [featured, ...rest] = posts;

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section aria-labelledby="blog-heading" className="bg-deep text-bone on-deep">
        <div className="section-container flex flex-col gap-6 py-16 lg:py-24">
          <nav aria-label="Breadcrumb" className="font-figure text-[13px] text-[#A9B3C2]">
            <Link href="/" className="hover:text-bone">
              Home
            </Link>
            <span aria-hidden="true" className="mx-2">
              /
            </span>
            <span className="text-bone" aria-current="page">
              Insights
            </span>
          </nav>
          <Eyebrow onDeep>Insights · For real estate investors</Eyebrow>
          <h1 id="blog-heading" className="max-w-4xl text-5xl leading-[0.98] sm:text-6xl lg:text-[80px]">
            Real Estate Investor Blog
          </h1>
          <p className="max-w-2xl text-lg leading-relaxed text-[#C9D1DD] sm:text-xl">
            Hard money lending, fix &amp; flip financing, DSCR loans and investment strategy, written by the team
            that has funded <span className="font-figure">{STATS.funded}</span> in deals.
          </p>
        </div>
      </section>

      {!featured ? (
        <section aria-label="Articles" className="bg-bone text-deep">
          <div className="section-container py-20">
            <p className="text-lg text-deep-muted">Articles coming soon.</p>
          </div>
        </section>
      ) : (
        <section aria-labelledby="featured-heading" className="bg-bone text-deep">
          <div className="section-container py-16 lg:py-20">
            {/* ── Featured (newest) ──────────────────────────────────── */}
            <h2 id="featured-heading" className="sr-only">
              Latest article
            </h2>
            <Link
              href={`/blog/${featured.slug}`}
              className="group grid gap-6 border-y-2 border-deep py-10 lg:grid-cols-12 lg:gap-6 lg:py-14"
            >
              <div className="flex flex-col gap-3 lg:col-span-4">
                <p className="font-figure text-[13px] uppercase tracking-[0.14em] text-brass-700">
                  Latest · {featured.category}
                </p>
                <p className="font-figure text-[13px] text-deep-soft">
                  {featured.readTime} · {formatDate(featured.date)}
                </p>
              </div>
              <div className="flex flex-col gap-5 lg:col-span-8">
                <p className="font-headline text-4xl font-semibold leading-[1.05] tracking-[-0.02em] transition-colors group-hover:text-brass-700 sm:text-5xl lg:text-[56px]">
                  {featured.title}
                </p>
                <p className="max-w-3xl text-lg leading-relaxed text-deep-muted">{featured.description}</p>
                <span className="inline-flex items-center gap-2 self-start border-b-2 border-brass-500 pb-1 font-semibold">
                  Read the article <ArrowRight size={16} aria-hidden="true" />
                </span>
              </div>
            </Link>

            {/* ── Everything else ───────────────────────────────────── */}
            {rest.length > 0 && (
              <div className="mt-16 lg:mt-20">
                <h2 className="mb-8 text-3xl sm:text-4xl">All articles</h2>
                <ul className="grid grid-cols-1 gap-x-10 md:grid-cols-2 lg:grid-cols-3">
                  {rest.map((post) => (
                    <li key={post.slug} className="border-t border-rule">
                      <Link href={`/blog/${post.slug}`} className="group flex h-full flex-col gap-4 py-8">
                        <p className="font-figure text-[13px] uppercase tracking-[0.1em] text-brass-700">
                          {post.category} · {post.readTime}
                        </p>
                        <h3 className="text-2xl leading-snug transition-colors group-hover:text-brass-700">
                          {post.title}
                        </h3>
                        <p className="flex-1 text-[15px] leading-relaxed text-deep-muted">{post.description}</p>
                        <p className="font-figure text-[13px] text-deep-soft">{formatDate(post.date)}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}
    </>
  );
}
