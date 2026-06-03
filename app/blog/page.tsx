import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock, Tag } from "lucide-react";
import { getAllPosts } from "@/lib/blog";

export const metadata: Metadata = {
  title: "Real Estate Investor Blog — Hard Money, DSCR & Fix & Flip Tips | Funded Capital",
  description:
    "Expert guides on hard money loans, DSCR financing, fix & flip strategies, and real estate investing. Written by Funded Capital — Miami's private real estate lender.",
};

const categoryColors: Record<string, string> = {
  "Hard Money Loans": "bg-navy-800 text-gold-400",
  "Fix & Flip": "bg-gold-500/10 text-gold-700",
  "DSCR Loans": "bg-slate-100 text-navy-900",
  "BRRRR Strategy": "bg-slate-100 text-navy-900",
  "New Construction": "bg-slate-100 text-navy-900",
  "General": "bg-slate-100 text-navy-900",
};

export default function BlogPage() {
  const posts = getAllPosts();

  return (
    <>
      {/* Hero */}
      <section className="bg-navy-900 py-16 lg:py-20">
        <div className="section-container max-w-3xl">
          <p className="section-label">Resources</p>
          <h1 className="text-4xl lg:text-5xl font-bold text-white mt-2">
            Real Estate Investor Blog
          </h1>
          <p className="text-slate-300 text-lg mt-4 leading-relaxed">
            Expert insights on hard money lending, fix & flip financing, DSCR
            loans, and real estate investment strategies — written by the team
            that has funded over $500M in deals.
          </p>
        </div>
      </section>

      {/* Posts Grid */}
      <section className="section-padding bg-white">
        <div className="section-container">
          {posts.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-slate-400 text-lg">Articles coming soon.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {posts.map((post) => (
                <Link
                  key={post.slug}
                  href={`/blog/${post.slug}`}
                  className="card flex flex-col gap-4 hover:shadow-card-hover transition-shadow group"
                >
                  {/* Category + Read time */}
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                        categoryColors[post.category] || "bg-slate-100 text-navy-900"
                      }`}
                    >
                      {post.category}
                    </span>
                    <span className="flex items-center gap-1 text-slate-400 text-xs">
                      <Clock size={12} />
                      {post.readTime}
                    </span>
                  </div>

                  {/* Title */}
                  <h2 className="font-bold text-navy-900 text-lg leading-snug group-hover:text-gold-600 transition-colors">
                    {post.title}
                  </h2>

                  {/* Description */}
                  <p className="text-slate-500 text-sm leading-relaxed flex-1">
                    {post.description}
                  </p>

                  {/* Footer */}
                  <div className="flex items-center justify-between mt-auto pt-3 border-t border-slate-100">
                    <span className="text-slate-400 text-xs">
                      {new Date(post.date).toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                    <span className="flex items-center gap-1 text-gold-600 text-sm font-semibold">
                      Read more
                      <ArrowRight size={14} />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-navy-900 py-14">
        <div className="section-container flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h2 className="text-2xl font-bold text-white">
              Ready to fund your next deal?
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              Term sheet in 2 hours. Close in as little as 5 days.
            </p>
          </div>
          <Link href="/apply" className="btn-primary shrink-0">
            Apply Now
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </>
  );
}
