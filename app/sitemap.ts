import { MetadataRoute } from "next";
import { getAllPosts, postLastModified } from "@/lib/blog";

/**
 * lastModified is a real date or it is left out (30 Sep 2026).
 *
 * This used to stamp every URL with the time of the build, so every deploy
 * told Google that all ~80 pages had changed that minute. Search engines learn
 * to ignore a lastmod that is always "now", which throws away the one signal
 * that matters here: a new or updated blog post. So:
 *   - a blog post carries its frontmatter `updated` date, else its `date`;
 *   - /blog carries the newest of those (it changes when a post is added);
 *   - static pages carry nothing, because no page records when it last changed
 *     and a guessed date is worse than none.
 * The URL set is unchanged (lib/seo.regress.ts counts it).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://www.fundedcapital.com";
  const posts = getAllPosts();
  const postDates = posts.map((p) => postLastModified(p)).filter((d): d is string => !!d);
  const newestPost = postDates.length ? postDates.reduce((a, b) => (a > b ? a : b)) : undefined;

  return [
    // Core — highest priority
    { url: baseUrl, changeFrequency: "weekly", priority: 1.0 },

    // Loan Program Landing Pages — high priority, PPC targets
    { url: `${baseUrl}/fix-and-flip-loans`, changeFrequency: "weekly", priority: 0.95 },
    { url: `${baseUrl}/dscr-loans`, changeFrequency: "weekly", priority: 0.95 },
    { url: `${baseUrl}/new-construction-loans`, changeFrequency: "weekly", priority: 0.95 },
    { url: `${baseUrl}/multifamily-loans`, changeFrequency: "weekly", priority: 0.95 },

    // Key conversion pages
    { url: `${baseUrl}/loan-programs`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${baseUrl}/apply`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${baseUrl}/calculator`, changeFrequency: "monthly", priority: 0.85 },

    // Supporting pages
    { url: `${baseUrl}/broker-program`, changeFrequency: "monthly", priority: 0.75 },
    { url: `${baseUrl}/broker-program/register`, changeFrequency: "monthly", priority: 0.75 },
    { url: `${baseUrl}/how-it-works`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${baseUrl}/about`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${baseUrl}/why-us`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${baseUrl}/contact`, changeFrequency: "monthly", priority: 0.6 },

    // Legal pages
    { url: `${baseUrl}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${baseUrl}/terms`, changeFrequency: "yearly", priority: 0.3 },

    // Blog index — changes when a post is added or updated
    { url: `${baseUrl}/blog`, ...(newestPost ? { lastModified: newestPost } : {}), changeFrequency: "weekly", priority: 0.7 },

    // Blog posts — auto-generated from content/blog/
    ...posts.map((post) => {
      const lastModified = postLastModified(post);
      return {
        url: `${baseUrl}/blog/${post.slug}`,
        ...(lastModified ? { lastModified } : {}),
        changeFrequency: "monthly" as const,
        priority: 0.65,
      };
    }),

    // Note: /thank-you is intentionally excluded (noindex)
  ];
}
