/**
 * Picking a provider's artwork at a sensible size.
 *
 * TheCocktailDB serves sized variants by appending /small, /medium or /large
 * to the thumbnail URL. Other providers have no imagery, so this is a no-op
 * for them.
 *
 *   /small   200x200     /medium  350x350
 *   /large   500x500     (none)   700x700
 */

/**
 * The largest a cocktail picture ever gets in Barback, in pixels.
 *
 * Provider artwork is square and decorative, and the full-size files are
 * several times bigger than anything on screen warrants — a 700px image
 * behind a thumbnail is wasted bytes on a phone. It also bounds what an
 * import writes to disk, which matters because uploaded pictures are served
 * straight from the filesystem without being resized on the way out.
 */
export const MAX_DRINK_IMAGE_PX = 300;

/**
 * The best variant URL for a picture that will be drawn `renderedPx` across.
 *
 * Asks for the smallest variant that is still at least as large as the box it
 * goes in, so nothing is ever upscaled — and never for `/large` or the
 * original, which are bigger than `MAX_DRINK_IMAGE_PX` allows.
 */
export function drinkImage(
  thumbUrl: string | null | undefined,
  renderedPx: number = MAX_DRINK_IMAGE_PX,
): string | null {
  if (!thumbUrl) return null;
  if (!/thecocktaildb\.com/.test(thumbUrl)) return thumbUrl;
  // Already pinned to a variant by whoever stored it.
  if (/\/(small|medium|large)$/.test(thumbUrl)) return thumbUrl;
  return `${thumbUrl}/${renderedPx <= 200 ? "small" : "medium"}`;
}
