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
  partialPrefetching: true,
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
