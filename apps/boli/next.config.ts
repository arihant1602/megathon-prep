import path from "node:path";
import type { NextConfig } from "next";

// Monorepo root: shared workspace packages and the single lockfile live there.
const root = path.join(__dirname, "../..");

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: root,
  transpilePackages: ["@mega/platform"],
  cacheComponents: true,
  turbopack: {
    root,
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "fastly.picsum.photos" },
    ],
  },
};

export default nextConfig;
