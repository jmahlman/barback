import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { contentTypeFor, resolveUploadPath } from "@/lib/uploads";
import { getSession } from "@/lib/session";

/**
 * Serves user-uploaded recipe photos. Behind auth, since a self-hosted bar
 * is nobody else's business.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const session = await getSession();
  if (!session?.user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { path: segments } = await params;
  const relative = segments.map(decodeURIComponent).join("/");
  const resolved = resolveUploadPath(relative);
  if (!resolved) {
    return new NextResponse("Not found", { status: 404 });
  }

  let info;
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
