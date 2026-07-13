import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output: bundles only what's needed for production
  // Required for the production Dockerfile (stage 3: runner)
  output: process.env.NODE_ENV === "production" ? "standalone" : undefined,

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
  },
};

export default nextConfig;
