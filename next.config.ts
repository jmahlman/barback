import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits a minimal self-contained server bundle for the Docker image.
  output: "standalone",
  outputFileTracingIncludes: {
    // The generated client and the native SQLite binding are loaded at
    // runtime, so tracing needs to be told about them explicitly.
    "/**": [
      "./src/generated/prisma/**/*",
      "./node_modules/better-sqlite3/build/Release/*.node",
    ],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "www.thecocktaildb.com" },
      { protocol: "https", hostname: "thecocktaildb.com" },
    ],
  },
  experimental: {
    // Server Actions receive multipart uploads for recipe photos.
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
