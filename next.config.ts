import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PLAN.md §7.1 — the service worker is built by `serwist build` (see serwist.config.mjs)
  // and served as a static file from public/. It must never be cached by the browser's
  // HTTP cache, or a bad worker would be sticky and there would be no way to ship a fix.
  // Its scope must be the whole origin even though it is served from /sw.js.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          { key: "Content-Type", value: "application/manifest+json" },
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
