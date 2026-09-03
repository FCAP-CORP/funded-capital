import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable React strict mode for better performance warnings
  reactStrictMode: true,

  // Optimize images with Next.js built-in loader
  images: {
    formats: ["image/avif", "image/webp"],
  },

  // Enable Partial Prerendering for instant loading (renamed in Next.js 16)
  cacheComponents: true,

  // Compress responses
  compress: true,

  /**
   * Legacy URLs from the pre-Next.js site.
   *
   * Google still has these indexed and they were returning 404, which wastes
   * every bit of authority those pages had earned and drops anyone who clicks
   * an old search result onto an error page. A 301 passes the ranking signal
   * to the page that replaced it and turns a dead end into a live visitor.
   *
   * `permanent: true` is a 301, which is what tells Google to transfer the
   * signal and eventually retire the old URL from the index. Redirects are
   * handled at the edge before any rendering, so this costs nothing at runtime.
   *
   * Only add a URL here once it has been confirmed to 404 AND to be indexed —
   * a redirect for a URL nobody requests is dead config, and a redirect that
   * shadows a real route is a bug.
   */
  async redirects() {
    return [
      { source: "/our-story", destination: "/about", permanent: true },
      { source: "/get-funded-now", destination: "/apply", permanent: true },
    ];
  },
};

export default nextConfig;
