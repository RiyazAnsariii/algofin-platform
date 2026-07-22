import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output: bundles only what's needed for production
  // Required for the production Dockerfile (stage 3: runner)
  output: process.env.NODE_ENV === "production" ? "standalone" : undefined,

  // Prevent Next.js from issuing 308 redirects on trailing-slash mismatches
  // for API proxy routes. Without this, Authorization headers get dropped
  // on redirect, causing 401 errors on valid sessions.
  skipTrailingSlashRedirect: true,

  // Enable compression
  compress: true,

  // Production headers for static assets & caching
  async headers() {
    return [
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/fonts/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/favicon.ico",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
    ];
  },

  // API rewrites: /api/* → backend
  // Dev: http://localhost:8000  |  Prod: Nginx proxies directly, no rewrite needed
  async rewrites() {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiBase}/api/v1/:path*`,
      },
    ];
  },

  // Image optimization
  images: {
    remotePatterns: [],
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 86400,
  },
};

export default nextConfig;
