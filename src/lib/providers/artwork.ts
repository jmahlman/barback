import "server-only";
import sharp from "sharp";
import { drinkImage, MAX_DRINK_IMAGE_PX } from "@/lib/providers/images";

/**
 * Fetching a drink's picture so an imported recipe keeps it.
 *
 * Linking straight to the provider would be less work, but it would mean a
 * recipe in your own book quietly fetching from someone else's server every
 * time you opened it — and going blank the day they reorganize their files.
 * A recipe you have saved should be yours, pictures included.
 *
 * Like every other outbound call in Barback, this only ever runs from an
 * action the person triggered.
 */

/** Generous for a 350px JPEG; small enough that nothing silly gets through. */
const MAX_BYTES = 4 * 1024 * 1024;

const ACCEPTED = /^image\/(jpeg|png|webp|avif|gif)$/i;

export interface FetchedArtwork {
  data: Buffer;
  /** Always ".webp" — the bytes are re-encoded, whatever arrived. */
  extension: string;
  width: number;
  height: number;
}

/**
 * Download a provider's artwork and re-encode it to at most
 * `MAX_DRINK_IMAGE_PX` square.
 *
 * Returns null rather than throwing on anything going wrong: a missing
 * picture is a cosmetic loss, and it must never be the reason a recipe fails
 * to save.
 */
export async function fetchDrinkArtwork(
  thumbUrl: string | null | undefined,
): Promise<FetchedArtwork | null> {
  // The variant nearest above the cap: downscaling 350 to 300 costs little
  // and avoids pulling the 700px original for no visible gain.
  const url = drinkImage(thumbUrl, MAX_DRINK_IMAGE_PX);
  if (!url) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  // Only ever over TLS, and never a URL that resolves somewhere local.
  if (parsed.protocol !== "https:") return null;

  console.info(`[artwork] GET ${parsed.host}${parsed.pathname}`);

  try {
    const response = await fetch(url, {
      headers: { Accept: "image/*" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.warn(`[artwork] ${url} returned ${response.status}`);
      return null;
    }

    const type = response.headers.get("content-type") ?? "";
    if (!ACCEPTED.test(type.split(";")[0].trim())) {
      console.warn(`[artwork] ${url} is "${type}", not an image Barback stores`);
      return null;
    }

    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_BYTES) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_BYTES) return null;

    const resized = await sharp(buffer)
      .rotate() // Honour EXIF orientation before it is stripped.
      .resize(MAX_DRINK_IMAGE_PX, MAX_DRINK_IMAGE_PX, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });

    return {
      data: resized.data,
      extension: ".webp",
      width: resized.info.width,
      height: resized.info.height,
    };
  } catch (error) {
    // Unreachable, too slow, or not a picture after all. Logged rather than
    // silent: a photo that never arrives is otherwise invisible.
    console.warn(`[artwork] could not use ${url}:`, error);
    return null;
  }
}
