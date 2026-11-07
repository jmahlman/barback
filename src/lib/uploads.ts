import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Resolved lazily: reading it at module scope makes the bundler trace the
 * whole project directory as a possible dependency.
 */
let cachedUploadDir: string | null = null;

export function uploadDir(): string {
  cachedUploadDir ??= path.resolve(
    /*turbopackIgnore: true*/ process.env.UPLOAD_DIR ?? "./data/uploads",
  );
  return cachedUploadDir;
}

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

/** Image types we accept, mapped to the extension we store. */
const ALLOWED: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
  "image/heic": ".heic",
  "image/heif": ".heif",
};

export class UploadError extends Error {}

/**
 * Persist an uploaded image and return its path relative to UPLOAD_DIR.
 * The filename is generated, never taken from the client.
 */
export async function saveRecipeImage(file: File): Promise<string> {
  if (file.size === 0) throw new UploadError("That file is empty.");
  if (file.size > MAX_BYTES) {
    throw new UploadError("Images must be 8 MB or smaller.");
  }

  const extension = ALLOWED[file.type];
  if (!extension) {
    throw new UploadError("Please use a JPEG, PNG, WebP, AVIF, HEIC or GIF image.");
  }

  const relative = `${randomUUID()}${extension}`;
  const root = uploadDir();
  const destination = path.join(/*turbopackIgnore: true*/ root, relative);

  await mkdir(root, { recursive: true });
  await writeFile(destination, Buffer.from(await file.arrayBuffer()));

  return relative;
}

/** Best-effort delete of a previously saved image. */
export async function deleteRecipeImage(relative: string | null | undefined): Promise<void> {
  if (!relative) return;
  const resolved = resolveUploadPath(relative);
  if (!resolved) return;
  try {
    await unlink(resolved);
  } catch {
    // Already gone, or never written. Nothing to do.
  }
}

/**
 * Resolve a stored relative path to an absolute one, refusing anything that
 * escapes UPLOAD_DIR.
 */
export function resolveUploadPath(relative: string): string | null {
  if (!relative || relative.includes("\0")) return null;
  const base = uploadDir();
  const resolved = path.resolve(/*turbopackIgnore: true*/ base, relative);
  const root = base.endsWith(path.sep) ? base : base + path.sep;
  if (resolved !== base && !resolved.startsWith(root)) return null;
  return resolved;
}

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".heic": "image/heic",
  ".heif": "image/heif",
};

export function contentTypeFor(filePath: string): string {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

/** Public URL for a stored image. */
export function uploadUrl(relative: string | null | undefined): string | null {
  if (!relative) return null;
  return `/api/uploads/${relative.split("/").map(encodeURIComponent).join("/")}`;
}
