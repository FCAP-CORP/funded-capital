import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import { ArrowRight, ArrowLeft, Clock, Tag } from "lucide-react";
import { getAllSlugs, getPostBySlug } from "@/lib/blog";

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
    },
  };
}

const mdxComponents = {
  h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 className="text-2xl font-bold text-navy-900 mt-10 mb-4" {...props} />
  ),
  h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 className="text-xl font-bold text-navy-900 mt-8 mb-3" {...props} />
  ),
  p: (props: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className="text-slate-600 leading-relaxed mb-4" {...props} />
  ),
  ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="list-disc list-outside ml-6 mb-4 flex flex-col gap-2 text-slate-600" {...props} />
  ),
  ol: (props: React.HTMLAttributes<HTMLOListElement>) => (
    <ol className="list-decimal list-outside ml-6 mb-4 flex flex-col gap-2 text-slate-600" {...props} />
  ),
  li: (props: React.HTMLAttributes<HTMLLIElement>) => (
    <li className="leading-relaxed" {...props} />
  ),
  strong: (props: React.HTMLAttributes<HTMLElement>) => (
    <strong className="font-semibold text-navy-900" {...props} />
  ),
  a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a className="text-gold-600 hover:text-gold-700 font-medium underline underline-offset-2 transition-colors" {...props} />
  ),
  table: (props: React.HTMLAttributes<HTMLTableElement>) => (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 my-6">
      <table className="w-full text-sm" {...props} />
    </div>
  ),
  thead: (props: React.HTMLAttributes<HTMLTableSectionElement>) => (
    <thead className="bg-navy-900" {...props} />
  ),
  th: (props: React.HTMLAttributes<HTMLTableCellElement>) => (
    <th className="px-4 py-3 text-left text-white font-semibold text-xs uppercase tracking-wider" {...props} />
  ),
  td: (props: React.HTMLAttributes<HTMLTableCellElement>) => (
    <td className="px-4 py-3 text-slate-700 border-t border-slate-100" {...props} />
  ),
  blockquote: (props: React.HTMLAttributes<HTMLElement>) => (
    <blockquote className="border-l-4 border-gold-500 pl-4 my-6 text-slate-600 italic" {...props} />
  ),
  hr: () => <hr className="border-slate-200 my-8" />,
};

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const schemaData = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": post.title,
    "description": post.description,
    "datePublished": post.date,
    "author": { "@type": "Organization", "name": "Funded Capital" },
    "publisher": {
      "@type": "Organization",
      "name": "Funded Capital",
      "url": "https://www.fundedcapital.com",
      "logo": { "@type": "ImageObject", "url": "https://www.fundedcapital.com/LogoWhite.png" },
    },
    "mainEntityOfPage": `https://www.fundedcapital.com/blog/${slug}`,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaData) }}
      />

      {/* Hero */}
      <section className="bg-navy-900 py-16 lg:py-20">
        <div className="section-container max-w-3xl">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-sm text-slate-400 mb-6">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <span>/</span>
            <Link href="/blog" className="hover:text-white transition-colors">Blog</Link>
            <span>/</span>
            <span className="text-slate-300 truncate">{post.title}</span>
          </nav>

          <span className="inline-flex items-center gap-1.5 text-gold-500 text-xs font-semibold uppercase tracking-wider mb-4">
            <Tag size={12} />
            {post.category}
          </span>
          <h1 className="text-3xl lg:text-4xl font-bold text-white leading-tight">
            {post.title}
          </h1>
          <div className="flex items-center gap-4 mt-4 text-slate-400 text-sm">
            <span className="flex items-center gap-1.5">
              <Clock size={14} />
              {post.readTime}
            </span>
            <span>
              {new Date(post.date).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="section-padding bg-white">
        <div className="section-container">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">

            {/* Article */}
            <article className="lg:col-span-2 prose-custom max-w-none">
              <MDXRemote source={post.content} components={mdxComponents} />
            </article>

            {/* Sidebar */}
            <aside className="flex flex-col gap-6">
              {/* Apply CTA */}
              <div className="card bg-navy-900 border-navy-800 text-white sticky top-24">
                <p className="section-label">Get Funded Fast</p>
                <h3 className="font-bold text-xl mt-2">
                  Ready to apply?
                </h3>
                <p className="text-slate-400 text-sm mt-2 leading-relaxed">
                  Term sheet in 2 hours. Close in as little as 5 days. No income verification on most programs.
                </p>
                <Link href="/apply" className="btn-primary mt-6 w-full justify-center">
                  Apply Now — It's Free
                  <ArrowRight size={16} />
                </Link>
                <Link href="/contact" className="btn-secondary border-slate-700 text-slate-300 hover:bg-slate-800 hover:border-slate-600 mt-3 w-full justify-center text-sm">
                  Talk to a Loan Officer
                </Link>
              </div>

              {/* Quick Stats */}
              <div className="card bg-slate-50 border-slate-100">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4">
                  Funded Capital at a Glance
                </p>
                {[
                  { value: "$500M+", label: "Loans Funded" },
                  { value: "2 hrs", label: "Time to Term Sheet" },
                  { value: "5 days", label: "Fastest Close" },
                  { value: "44 States", label: "Nationwide" },
                ].map((stat) => (
                  <div key={stat.label} className="flex items-center justify-between py-2 border-b border-slate-200 last:border-0">
                    <span className="text-slate-500 text-sm">{stat.label}</span>
                    <span className="font-bold text-navy-900 text-sm">{stat.value}</span>
                  </div>
                ))}
              </div>
            </aside>
          </div>

          {/* Back to blog */}
          <div className="mt-12 pt-8 border-t border-slate-100">
            <Link href="/blog" className="inline-flex items-center gap-2 text-slate-500 hover:text-navy-900 transition-colors text-sm font-medium">
              <ArrowLeft size={16} />
              Back to Blog
            </Link>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="bg-gold-500 py-14">
        <div className="section-container text-center">
          <h2 className="text-2xl font-bold text-navy-900">
            Experience the Difference Yourself
          </h2>
          <p className="text-navy-800 text-sm mt-2">
            Apply today. Get a term sheet within 2 hours. No obligation, no fees.
          </p>
          <Link
            href="/apply"
            className="inline-flex items-center gap-2 mt-6 bg-navy-900 hover:bg-navy-800 text-white font-semibold px-8 py-4 rounded-xl transition-colors"
          >
            Apply Now
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </>
  );
}
