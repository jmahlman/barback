import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";

/**
 * Serves the barcode decoder's WebAssembly module from Barback's own origin.
 *
 * This route is the whole point of the exercise: `zxing-wasm` fetches this
 * file from a public CDN by default, which would mean every scan made a
 * third-party request from the browser. That would quietly falsify the one
 * claim in the README a self-hoster can actually check, and scanning would
 * stop working altogether on an instance with no outbound internet access or
 * behind a proxy whose content policy does not list that CDN.
 *
 * The client points the decoder here instead; see `barcode-scanner.tsx`.
 *
 * Deliberately not behind auth, unlike the uploads route: it is a library
 * asset identical for everyone, and gating it would only delay the scanner.
 */

/**
 * Where the decoder lives, relative to the working directory.
 *
 * Deliberately a plain filesystem path rather than `require.resolve`: the
 * bundler reads a resolve call for a `.wasm` specifier as an import and tries
 * to put the module through its WebAssembly loader, which fails at build
 * time. Nothing here goes through the module system.
 *
 * `process.cwd()` is right in both places this runs: `next dev` from the
 * project root, and the standalone server, which starts in `/app` with the
 * file traced in beside it by `outputFileTracingIncludes` in `next.config.ts`.
 * The `turbopackIgnore` comments say the same thing to the bundler, which
 * cannot see that for itself and would otherwise warn about a dynamic path.
 */
const RELATIVE = "node_modules/zxing-wasm/dist/reader/zxing_reader.wasm";

let cached: { path: string; size: number } | null = null;

async function wasmFile(): Promise<{ path: string; size: number } | null> {
  if (cached) return cached;

  const candidate = path.join(/*turbopackIgnore: true*/ process.cwd(), RELATIVE);
  try {
    const info = await stat(/*turbopackIgnore: true*/ candidate);
    if (!info.isFile()) return null;
    cached = { path: candidate, size: info.size };
    return cached;
  } catch {
    return null;
  }
}

export async function GET() {
  const file = await wasmFile();
  if (!file) {
    console.error(`[scanner] the barcode decoder is missing from ${RELATIVE}`);
    return new NextResponse("Barcode decoder not installed", { status: 404 });
  }

  const stream = Readable.toWeb(
    createReadStream(/*turbopackIgnore: true*/ file.path),
  ) as ReadableStream;

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/wasm",
      "Content-Length": String(file.size),
      // Pinned to an exact dependency version, so this never changes under
      // this URL within a given build of Barback.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
