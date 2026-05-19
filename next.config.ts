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
};

export default nextConfig;
