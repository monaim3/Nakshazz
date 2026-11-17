/** @type {import('next').NextConfig} */
const nextConfig = {
  // Dev only: let phones on the local network load the dev scripts (http://<pc-ip>:3000).
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*"],
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
