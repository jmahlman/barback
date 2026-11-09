import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import {
  contentTypeFor,
  ensureThumbnail,
  isThumbnailWidth,
  resolveUploadPath,
} from "@/lib/uploads";
import { getSession } from "@/lib/session";

/**
 * Serves user-uploaded recipe photos. Behind auth, since a self-hosted bar
 * is nobody else's business.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const session = await getSession();
  if (!session?.user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { path: segments } = await params;
  const relative = segments.map(decodeURIComponent).join("/");
  const original = resolveUploadPath(relative);
  if (!original) {
    return new NextResponse("Not found", { status: 404 });
  }

  // `?w=` asks for one of the generated sizes. A card drawing an 80px square
  // has no business downloading a 1600px photograph to do it. An unknown
  // width, or one that cannot be produced, falls back to the original rather
  // than failing.
  const requested = Number(new URL(request.url).searchParams.get("w"));
  const resolved =
    Number.isFinite(requested) && isThumbnailWidth(requested)
      ? ((await ensureThumbnail(relative, requested)) ?? original)
      : original;

  let info: Awaited<ReturnType<typeof stat>>;
  try {
    info = await stat(resolved);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
  if (!info.isFile()) {
    return new NextResponse("Not found", { status: 404 });
  }

  const stream = Readable.toWeb(createReadStream(resolved)) as ReadableStream;

  return new NextResponse(stream, {
    headers: {
      "Content-Type": contentTypeFor(resolved),
      "Content-Length": String(info.size),
      // Filenames are random UUIDs, so contents never change under a URL.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
