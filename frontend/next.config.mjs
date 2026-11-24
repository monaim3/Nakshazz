/** @type {import('next').NextConfig} */
const nextConfig = {
  // Dev only: let phones on the local network load the dev scripts (http://<pc-ip>:3000).
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*"],
  // Self-contained server bundle for cPanel's Node.js app (Passenger): .next/standalone/server.js
  output: "standalone",
  // Built on Windows, served on Linux: skip the native image optimiser (sharp). Our images are
  // already optimised WebP from the API and small brand assets.
  images: { unoptimized: true },
  // Don't advertise the framework in every response.
  poweredByHeader: false,
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
  // Files in /public are not fingerprinted, so Next sends them with no caching. These folders
  // only hold versioned artwork and the try-on models: let browsers keep them for a month.
  async headers() {
    const month = [{ key: "Cache-Control", value: "public, max-age=2592000" }];
    // Security headers on every route. Camera stays allowed for our own pages: the virtual
    // try-on uses it. HSTS is ignored by browsers on plain-http localhost.
    const security = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
      { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
      // Safe CSP baseline: no plug-ins, no <base> hijack, forms only post to us, only our own
      // pages may frame us, http asset links are upgraded. (Script sources are not restricted:
      // that needs per-request nonces, which conflict with the prerendered shop pages.)
      { key: "Content-Security-Policy", value: "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; upgrade-insecure-requests" },
    ];
    return [
      { source: "/:path*", headers: security },
      { source: "/hero/:path*", headers: month },
      { source: "/brand/:path*", headers: month },
      { source: "/tryon/:path*", headers: month },
    ];
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
