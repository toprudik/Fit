import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // Allow the dev server to be opened through the Cloudflare quick tunnel (docker compose --profile tunnel).
  allowedDevOrigins: ["*.trycloudflare.com"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "t.me" }, { protocol: "https", hostname: "*.telegram.org" }],
  },
  async headers() {
    return [{ source: "/:path*", headers: [...securityHeaders] }];
  },
  async redirects() {
    // The scaffold's /me became the profile (screens.md §2.3).
    return [{ source: "/me", destination: "/profile", permanent: true }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
