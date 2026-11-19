/** @type {import('next').NextConfig} */
const nextConfig = {
  // Dev only: let phones on the local network load the dev scripts (http://<pc-ip>:3000).
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*"],
  // Self-contained server bundle for cPanel's Node.js app (Passenger): .next/standalone/server.js
  output: "standalone",
  // Built on Windows, served on Linux: skip the native image optimiser (sharp). Our images are
  // already optimised WebP from the API and small brand assets.
  images: { unoptimized: true },
  cacheComponents: true,
  // Shared hosting throttles bursts of API requests: prerender gently, retry failed pages.
  experimental: {
    cpus: 2,
    staticGenerationMaxConcurrency: 4,
    staticGenerationRetryCount: 3,
  },
  partialPrefetching: true,
  // Same-origin proxy for uploaded media: the virtual try-on draws product photos on a canvas
  // and saves the result, which browsers only allow for same-origin (or CORS) images.
  async rewrites() {
    const backend = (process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000").replace(/\/$/, "");
    return [{ source: "/media/:path*", destination: `${backend}/storage/:path*` }];
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
