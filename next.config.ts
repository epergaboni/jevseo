import type { NextConfig } from "next";

/**
 * BASE_PATH lets the app be served from a sub-path, for example proxied at
 * example.com/jevseo. It must be set at build time, because Next bakes the
 * prefix into every asset URL and route. Leave it unset to serve from the
 * root, which is what local development and a plain Vercel domain do.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH?.replace(/\/$/, "") || undefined;

const nextConfig: NextConfig = {
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // The app fetches arbitrary third-party pages server-side; none of
          // that should ever be framed or sniffed.
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Visitors' API keys pass through this origin, so they must never
          // be cached by an intermediary.
          { key: "Permissions-Policy", value: "geolocation=(), microphone=(), camera=()" },
        ],
      },
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
    ];
  },
};

export default nextConfig;
