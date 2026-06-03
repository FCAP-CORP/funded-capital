import { MetadataRoute } from "next";
import { getAllSlugs } from "@/lib/blog";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://www.fundedcapital.com";
  const now = new Date();
  const blogSlugs = getAllSlugs();

  return [
    // Core — highest priority
    { url: baseUrl, lastModified: now, changeFrequency: "weekly", priority: 1.0 },

    // Loan Program Landing Pages — high priority, PPC targets
    { url: `${baseUrl}/fix-and-flip-loans`, lastModified: now, changeFrequency: "weekly", priority: 0.95 },
    { url: `${baseUrl}/dscr-loans`, lastModified: now, changeFrequency: "weekly", priority: 0.95 },
    { url: `${baseUrl}/new-construction-loans`, lastModified: now, changeFrequency: "weekly", priority: 0.95 },
    { url: `${baseUrl}/multifamily-loans`, lastModified: now, changeFrequency: "weekly", priority: 0.95 },

    // Key conversion pages
    { url: `${baseUrl}/loan-programs`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${baseUrl}/apply`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${baseUrl}/calculator`, lastModified: now, changeFrequency: "monthly", priority: 0.85 },

    // Supporting pages
    { url: `${baseUrl}/broker-program`, lastModified: now, changeFrequency: "monthly", priority: 0.75 },
    { url: `${baseUrl}/how-it-works`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${baseUrl}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${baseUrl}/why-us`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${baseUrl}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },

    // Blog index
    { url: `${baseUrl}/blog`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },

    // Blog posts — auto-generated from content/blog/
    ...blogSlugs.map((slug) => ({
      url: `${baseUrl}/blog/${slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.65,
    })),

    // Note: /thank-you is intentionally excluded (noindex)
  ];
}
