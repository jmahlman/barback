/**
 * Shrinking a photograph in the browser, before it is ever uploaded.
 *
 * A picture straight off a phone is commonly 5–12 MB, and a server action has
 * a body limit: go past it and the request dies in the framework before any
 * of Barback's code runs, so there is nothing to catch and nothing useful to
 * say — the form just loses everything you typed. Shrinking first means that
 * limit is never reached, and the upload finishes quickly on mobile data.
 *
 * The server resizes again regardless. This is a courtesy, not a control: the
 * browser is not something to trust about file sizes.
 */

/** Long edge, in pixels. The recipe page shows photos about 640px wide. */
export const MAX_UPLOAD_EDGE = 1600;

/** Below this, shrinking costs more quality than it saves bytes. */
const SKIP_BELOW_BYTES = 512 * 1024;

function outputType(): string {
  // WebP keeps transparency and is far smaller; every browser that can run
  // this has supported encoding it for years. JPEG is the safety net.
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  return canvas.toDataURL("image/webp").startsWith("data:image/webp")
    ? "image/webp"
    : "image/jpeg";
}

function renamed(name: string, type: string): string {
  const extension = type === "image/webp" ? ".webp" : ".jpg";
  const base = name.replace(/\.[^.]+$/, "") || "photo";
  return `${base}${extension}`;
}

/**
 * Return a smaller version of `file`, or the original when there is nothing
 * worth doing or the browser cannot read it.
 *
 * Never throws. A photo that cannot be shrunk here is still worth sending —
 * the server will deal with it, or explain why it cannot.
 */
export async function downscaleImage(
  file: File,
  maxEdge: number = MAX_UPLOAD_EDGE,
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  // An animated GIF would come back as a single still frame.
  if (file.type === "image/gif") return file;

  let bitmap: ImageBitmap;
  try {
    // `from-image` applies the EXIF rotation, so a portrait photo does not
    // come out on its side.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // HEIC, AVIF, or something this browser cannot decode. Send it as it is.
    return file;
  }

  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    if (longest <= maxEdge && file.size <= SKIP_BELOW_BYTES) return file;

    const scale = Math.min(1, maxEdge / longest);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, width, height);

    const type = outputType();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, type, 0.85),
    );
    if (!blob || blob.size === 0) return file;

    // Re-encoding a small, already-efficient picture can make it bigger.
    if (blob.size >= file.size && longest <= maxEdge) return file;

    return new File([blob], renamed(file.name, type), {
      type,
      lastModified: Date.now(),
    });
  } catch {
    return file;
  } finally {
    bitmap.close?.();
  }
}
