import { randomUUID } from "node:crypto";
import { mkdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

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

/**
 * Deliberately below the server action body limit in `next.config.ts`.
 *
 * Past that limit the request is refused by the framework before any of this
 * runs, which surfaces as a 500 and an error page rather than a sentence
 * explaining the problem — so there has to be room between the two for this
 * check to be the one that fires.
 */
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Long edge for a stored photograph.
 *
 * Uploads are served straight off disk without being resized on the way out,
 * so whatever is written here is what every future page load downloads. The
 * recipe page shows a photo about 640px wide, so this is generous even on a
 * high-density screen.
 */
const MAX_EDGE = 1600;

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
    throw new UploadError(
      "That picture is too big to send. Most phones take photos well under 10 MB — try a smaller one.",
    );
  }

  const extension = ALLOWED[file.type];
  if (!extension) {
    throw new UploadError("Please use a JPEG, PNG, WebP, AVIF, HEIC or GIF image.");
  }

  const original = Buffer.from(await file.arrayBuffer());
  const { data, extension: storedExtension } = await shrink(original, extension);

  const relative = `${randomUUID()}${storedExtension}`;
  const root = uploadDir();
  const destination = path.join(/*turbopackIgnore: true*/ root, relative);

  await mkdir(root, { recursive: true });
  await writeFile(destination, data);

  return relative;
}

/**
 * Re-encode a photograph down to `MAX_EDGE`, keeping the original bytes if
 * that is not possible.
 *
 * The browser shrinks pictures before sending them, but that is a courtesy
 * and not something to rely on — a different client, a failed canvas, or a
 * format the browser could not decode all arrive here full size. Formats this
 * build of sharp cannot read (AVIF, depending on how it was compiled) fall
 * through unchanged rather than failing the upload, which is the behavior
 * these had before any resizing existed.
 */
async function shrink(
  original: Buffer,
  extension: string,
): Promise<{ data: Buffer; extension: string }> {
  // An animated GIF would survive as a single still frame, which is worse
  // than leaving it alone.
  if (extension === ".gif") return { data: original, extension };

  try {
    const resized = await sharp(original)
      .rotate() // Bake in the EXIF orientation before the metadata is dropped.
      .resize(MAX_EDGE, MAX_EDGE, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();

    // Re-encoding something already small and efficient can make it bigger.
    return resized.byteLength < original.byteLength
      ? { data: resized, extension: ".webp" }
      : { data: original, extension };
  } catch {
    return { data: original, extension };
  }
}

/**
 * Persist an image Barback produced itself, rather than one someone chose.
 *
 * Separate from `saveRecipeImage` on purpose: that one guards against what a
 * browser hands us — type, size, a filename we must not trust. These bytes
 * were re-encoded here moments ago, so the only thing left to do is write
 * them under a generated name.
 */
export async function saveGeneratedImage(
  data: Buffer,
  extension: string,
): Promise<string> {
  if (!Object.values(ALLOWED).includes(extension)) {
    throw new UploadError(`Refusing to write an image as "${extension}".`);
  }

  const relative = `${randomUUID()}${extension}`;
  const root = uploadDir();
  const destination = path.join(/*turbopackIgnore: true*/ root, relative);

  await mkdir(root, { recursive: true });
  await writeFile(destination, data);

  return relative;
}

/** Best-effort delete of a previously saved image. */
export async function deleteRecipeImage(relative: string | null | undefined): Promise<void> {
  if (!relative) return;
  const resolved = resolveUploadPath(relative);
  if (!resolved) return;
  await deleteThumbnails(relative);
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

/**
 * Widths the uploads route will produce, as an allowlist.
 *
 * Closed on purpose: an open `?w=` is an invitation to make the server resize
 * the same picture a thousand times at a thousand sizes.
 */
export const THUMBNAIL_WIDTHS = [160, 320, 640] as const;
export type ThumbnailWidth = (typeof THUMBNAIL_WIDTHS)[number];

export function isThumbnailWidth(value: number): value is ThumbnailWidth {
  return (THUMBNAIL_WIDTHS as readonly number[]).includes(value);
}

/** Where a generated size lives, relative to UPLOAD_DIR. */
function thumbnailRelative(relative: string, width: ThumbnailWidth): string {
  const base = path.basename(relative).replace(/\.[^.]+$/, "");
  return path.join("thumbnails", `${base}.w${width}.webp`);
}

/**
 * Path to a stored image at `width`, generating it the first time it is
 * asked for.
 *
 * Recipe cards draw an 80px square. Without this they would download the
 * whole 1600px photograph to do it, because uploads are served straight from
 * disk — Next's image optimizer cannot be used here, since these files sit
 * behind authentication and it fetches them without the viewer's cookies.
 *
 * Returns null when the size cannot be produced, so the caller can fall back
 * to the original rather than show nothing.
 */
export async function ensureThumbnail(
  relative: string,
  width: ThumbnailWidth,
): Promise<string | null> {
  const source = resolveUploadPath(relative);
  if (!source) return null;

  const target = resolveUploadPath(thumbnailRelative(relative, width));
  if (!target) return null;

  try {
    // Both paths are already resolved inside UPLOAD_DIR; the bundler cannot
    // see that and would otherwise trace the whole project into the output,
    // which is the same reason `uploadDir` is annotated above.
    const [sourceInfo, targetInfo] = await Promise.all([
      stat(/*turbopackIgnore: true*/ source),
      stat(/*turbopackIgnore: true*/ target).catch(() => null),
    ]);
    // Regenerate if the original has been replaced since.
    if (targetInfo && targetInfo.mtimeMs >= sourceInfo.mtimeMs) return target;
  } catch {
    return null;
  }

  try {
    const resized = await sharp(/*turbopackIgnore: true*/ source)
      .rotate()
      .resize(width, width, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    await mkdir(/*turbopackIgnore: true*/ path.dirname(target), { recursive: true });
    await writeFile(/*turbopackIgnore: true*/ target, resized);
    return target;
  } catch {
    // An animated GIF, a format this build cannot read, or a write failure.
    return null;
  }
}

/** Remove every generated size of an image. */
async function deleteThumbnails(relative: string): Promise<void> {
  await Promise.all(
    THUMBNAIL_WIDTHS.map(async (width) => {
      const resolved = resolveUploadPath(thumbnailRelative(relative, width));
      if (!resolved) return;
      try {
        await unlink(resolved);
      } catch {
        // Never existed, or already gone.
      }
    }),
  );
}

/**
 * Public URL for a stored image, optionally at one of the generated sizes.
 *
 * Asking for a width that is larger than the picture gets the picture, not a
 * blown-up copy of it.
 */
export function uploadUrl(
  relative: string | null | undefined,
  width?: ThumbnailWidth,
): string | null {
  if (!relative) return null;
  const encoded = relative.split("/").map(encodeURIComponent).join("/");
  return width ? `/api/uploads/${encoded}?w=${width}` : `/api/uploads/${encoded}`;
}
