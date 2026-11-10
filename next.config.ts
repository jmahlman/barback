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
      // The barcode decoder, streamed by /api/scanner/wasm so that scanning
      // never reaches out to a CDN. Tracing cannot see it: the route resolves
      // the path at request time.
      "./node_modules/zxing-wasm/dist/reader/zxing_reader.wasm",
    ],
  },
  // Not setting `devIndicators: false` on purpose. It hides the floating
  // dev-tools badge, but on Next 16.4.5 it also puts the dev server into a
  // full-page-reload loop. The badge only ever renders under `next dev` —
  // it is absent from a production build and from the Docker image — so
  // living with it costs nothing that matters.

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "www.thecocktaildb.com" },
      { protocol: "https", hostname: "thecocktaildb.com" },
      { protocol: "https", hostname: "cocktail.glass", pathname: "/images/**" },
    ],
  },
  experimental: {
    // Server Actions receive multipart uploads for recipe photos. Kept above
    // the limit enforced in src/lib/uploads.ts: past this number the request
    // is refused by the framework before any of Barback's code runs, so the
    // person gets an error page instead of a sentence telling them what to
    // do. The browser shrinks pictures before sending, so neither limit
    // should be reachable in normal use.
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
