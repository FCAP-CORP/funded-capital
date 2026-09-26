import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { DEFAULT_AUTHOR, getAllPosts, getAllSlugs, getPostBySlug } from "@/lib/blog";
import { COMPANY, COMPLIANCE, STATS } from "@/lib/site/facts";
import { Faq } from "@/components/site/ui";

/*
 * Article template ("Ledger", 25 Sep 2026).
 *
 * PERFORMANCE: a server component. The MDX is compiled on the server and the
 * page ships no client JavaScript; the FAQ uses native <details>. The only
 * image is a 52px author photo served by next/image at the exact size.
 *
 * CONVERSION: a 700px measure keeps the read comfortable, so visitors reach
 * the end. The desktop rail keeps "Price a deal" one click away the whole
 * time, the closing box turns the finished read into one action, and three
 * related posts keep a researching investor on the site.
 *
 * NOTE: `dynamicParams = false` is not used here. With cacheComponents on,
 * exporting it fails the build ("not compatible with
 * nextConfig.cacheComponents"); unknown slugs still hit notFound() below.
 */

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return {};
  return {
    title: `${post.title} | Funded Capital`,
    description: post.description,
    keywords: post.keywords,
    openGraph: {
      title: post.title,
      description: post.description,
      type: "article",
      publishedTime: post.date,
      modifiedTime: post.updated,
      authors: [post.author],
    },
  };
}

const mdxComponents = {
  h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 className="mb-5 mt-14 text-[32px] leading-[1.15] text-deep sm:text-[36px]" {...props} />
  ),
  h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 className="mb-3 mt-10 text-2xl leading-snug text-deep" {...props} />
  ),
  p: (props: React.HTMLAttributes<HTMLParagraphElement>) => <p className="mb-6" {...props} />,
  ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="mb-6 ml-6 flex list-outside list-disc flex-col gap-2 marker:text-brass-700" {...props} />
  ),
  ol: (props: React.HTMLAttributes<HTMLOListElement>) => (
    <ol
      className="mb-6 ml-6 flex list-outside list-decimal flex-col gap-2 marker:font-figure marker:text-brass-700"
      {...props}
    />
  ),
  li: (props: React.HTMLAttributes<HTMLLIElement>) => <li className="pl-1" {...props} />,
  strong: (props: React.HTMLAttributes<HTMLElement>) => <strong className="font-semibold text-deep" {...props} />,
  a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a
      className="border-b-2 border-brass-500 font-medium text-deep transition-colors hover:text-brass-700"
      {...props}
    />
  ),
  table: (props: React.HTMLAttributes<HTMLTableElement>) => (
    <div className="my-8 overflow-x-auto">
      <table className="w-full border-collapse text-left text-[16px] leading-normal tabular-nums" {...props} />
    </div>
  ),
  thead: (props: React.HTMLAttributes<HTMLTableSectionElement>) => (
    <thead className="border-b-2 border-deep" {...props} />
  ),
  th: (props: React.ThHTMLAttributes<HTMLTableCellElement>) => (
    <th
      scope="col"
      className="px-3 py-3 font-figure text-xs font-medium uppercase tracking-[0.1em] text-deep first:pl-0"
      {...props}
    />
  ),
  td: (props: React.TdHTMLAttributes<HTMLTableCellElement>) => (
    <td className="border-b border-rule px-3 py-3.5 align-top text-[#1E2A3C] first:pl-0" {...props} />
  ),
  blockquote: (props: React.HTMLAttributes<HTMLElement>) => (
    <blockquote
      className="my-8 border-l-[3px] border-brass-500 py-1 pl-7 font-headline text-2xl font-medium leading-[1.4] text-deep sm:text-[28px] [&>p]:mb-0"
      {...props}
    />
  ),
  hr: () => <hr className="my-12 border-rule" />,
};

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const related = getAllPosts()
    .filter((p) => p.slug !== slug)
    .slice(0, 3);

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": post.title,
    "description": post.description,
    "datePublished": post.date,
    "dateModified": post.updated || post.date,
    "author": {
      "@type": "Person",
      "name": post.author,
      "jobTitle": post.authorTitle,
      "url": "https://www.fundedcapital.com/about",
      "worksFor": { "@type": "Organization", "name": "Funded Capital" },
    },
    "publisher": {
      "@type": "Organization",
      "name": "Funded Capital",
      "url": "https://www.fundedcapital.com",
      "logo": { "@type": "ImageObject", "url": "https://www.fundedcapital.com/LogoWhite.png" },
    },
    "mainEntityOfPage": `https://www.fundedcapital.com/blog/${slug}`,
  };

  const faqSchema =
    post.faq.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "mainEntity": post.faq.map((item) => ({
            "@type": "Question",
            "name": item.q,
            "acceptedAnswer": { "@type": "Answer", "text": item.a },
          })),
        }
      : null;

  const schemaData = faqSchema ? [articleSchema, faqSchema] : [articleSchema];

  const isLuis = post.author === DEFAULT_AUTHOR;
  const initials = post.author
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const avatar = (alt: string) =>
    isLuis ? (
    <Image
      src="/profile-luis.png"
      alt={alt}
      width={52}
      height={52}
      className="h-[52px] w-[52px] shrink-0 rounded-full object-cover"
    />
  ) : (
    <span
      aria-hidden="true"
      className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-deep font-headline text-xl font-semibold text-brass-300"
    >
      {initials}
    </span>
  );

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaData) }} />

      {/* ── Article header ───────────────────────────────────────────── */}
      <header className="border-b border-rule bg-bone text-deep">
        <div className="section-container grid py-14 lg:grid-cols-12 lg:gap-6 lg:py-20">
          <div className="flex flex-col gap-6 lg:col-span-10 lg:col-start-2 xl:col-span-9 xl:col-start-2">
            <nav aria-label="Breadcrumb" className="font-figure text-[13px] text-deep-soft">
              <Link href="/" className="hover:text-deep">
                Home
              </Link>
              <span aria-hidden="true" className="mx-2">
                /
              </span>
              <Link href="/blog" className="hover:text-deep">
                Insights
              </Link>
            </nav>
            <p className="font-figure text-[13px] uppercase tracking-[0.14em] text-brass-700">
              {post.category} · {post.readTime} · <time dateTime={post.date}>{formatDate(post.date)}</time>
            </p>
            <h1 className="text-[40px] leading-[1.04] tracking-[-0.025em] sm:text-5xl lg:text-[64px]">{post.title}</h1>
            <div className="mt-2 flex items-center gap-4">
              {avatar("Luis Fajardo")}
              <div className="flex flex-col gap-0.5">
                <span className="text-base font-semibold">{post.author}</span>
                <span className="text-sm text-deep-muted">{post.authorTitle}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ── Body ─────────────────────────────────────────────────────── */}
      <div className="bg-bone text-deep">
        <div className="section-container grid gap-12 py-14 lg:grid-cols-12 lg:gap-6 lg:py-20">
          <article className="min-w-0 lg:col-span-8 lg:col-start-2 xl:col-span-7 xl:col-start-2">
            <div className="prose-ledger max-w-[700px]">
              <MDXRemote
                source={post.content}
                components={mdxComponents}
                options={{ mdxOptions: { remarkPlugins: [remarkGfm] } }}
              />
            </div>

            {/* FAQ — rendered from frontmatter so it always matches the FAQPage schema */}
            {post.faq.length > 0 && (
              <section aria-labelledby="post-faq-heading" className="mt-14 max-w-[700px]">
                <h2 id="post-faq-heading" className="mb-6 text-[32px] leading-[1.15] sm:text-[36px]">
                  Frequently Asked Questions
                </h2>
                <Faq items={post.faq} idPrefix="post-faq" />
              </section>
            )}

            {/* Author bio */}
            <div className="mt-14 flex max-w-[700px] items-center gap-4 border-y border-rule py-6">
              {avatar("")}
              <div>
                <p className="font-semibold leading-tight">{post.author}</p>
                <p className="mt-1 text-sm leading-snug text-deep-muted">
                  {post.authorTitle} · Lending to real estate investors nationwide:{" "}
                  <span className="font-figure">{STATS.funded}</span> funded across{" "}
                  <span className="font-figure">{STATS.deals}</span> deals.
                </p>
              </div>
            </div>

            {/* Closing call to action */}
            <div className="on-deep mt-10 flex max-w-[700px] flex-col gap-6 bg-deep p-7 text-bone sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-2">
                <p className="font-headline text-[26px] font-semibold leading-tight">Have a deal in hand? Send the file.</p>
                <p className="text-[15px] text-[#C9D1DD]">
                  Term sheet in <span className="font-figure">{STATS.termSheet}</span> on average. Close in{" "}
                  <span className="font-figure">{STATS.close}</span>.
                </p>
              </div>
              <Link href="/apply" className="btn-primary shrink-0 text-base">
                Apply now <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
            <p className="mt-4 max-w-[700px] text-sm text-deep-soft">{COMPLIANCE}</p>

            <p className="mt-10">
              <Link
                href="/blog"
                className="inline-flex min-h-[44px] items-center gap-2 text-[15px] font-medium text-deep-muted transition-colors hover:text-deep"
              >
                <ArrowLeft size={16} aria-hidden="true" />
                Back to Insights
              </Link>
            </p>
          </article>

          {/* Right rail — desktop only */}
          <aside aria-label="Price a deal" className="hidden lg:col-span-3 lg:col-start-10 lg:block">
            <div className="sticky top-28 flex flex-col gap-4 border border-rule bg-paper p-6">
              <p className="font-figure text-[11px] uppercase tracking-[0.14em] text-brass-700">Price a deal</p>
              <p className="font-headline text-2xl font-semibold leading-tight">Three inputs. A real number.</p>
              <p className="text-[15px] leading-relaxed text-deep-muted">
                Loan amount, monthly interest and estimated profit on your deal, before you apply.
              </p>
              <Link href="/calculator" className="btn-dark text-[15px]">
                Open the calculator
              </Link>
              <a
                href={COMPANY.phoneHref}
                className="flex min-h-[44px] items-center justify-center font-figure text-[13px] text-deep hover:text-brass-700"
              >
                {COMPANY.phone}
              </a>
            </div>
          </aside>
        </div>
      </div>

      {/* ── Related posts ────────────────────────────────────────────── */}
      {related.length > 0 && (
        <section aria-labelledby="related-heading" className="border-t border-rule bg-linen text-deep">
          <div className="section-container py-16 lg:py-20">
            <h2 id="related-heading" className="mb-8 text-3xl sm:text-4xl">
              Keep reading
            </h2>
            <ul className="grid grid-cols-1 gap-x-10 md:grid-cols-3">
              {related.map((p) => (
                <li key={p.slug} className="border-t-2 border-deep">
                  <Link href={`/blog/${p.slug}`} className="group flex h-full flex-col gap-3 py-6">
                    <p className="font-figure text-[13px] uppercase tracking-[0.1em] text-brass-700">
                      {p.category} · {p.readTime}
                    </p>
                    <h3 className="text-2xl leading-snug transition-colors group-hover:text-brass-700">{p.title}</h3>
                    <p className="text-[15px] leading-relaxed text-deep-muted">{p.description}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </>
  );
}
