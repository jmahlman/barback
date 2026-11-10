/**
 * Picking a provider's artwork at a sensible size.
 *
 * TheCocktailDB serves sized variants by appending /small, /medium or /large
 * to the thumbnail URL:
 *
 *   /small   200x200     /medium  350x350
 *   /large   500x500     (none)   700x700
 *
 * cocktail.glass keeps two sizes under different directories:
 *
 *   /images/responsive/320/<slug>.webp     /images/responsive/640/<slug>.webp
 *
 * API Ninjas has no imagery, so this is a no-op for it.
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

  // cocktail.glass: swap the size directory. 320 already clears the cap.
  if (/cocktail\.glass\/images\/responsive\/\d+\//.test(thumbUrl)) {
    const size = renderedPx <= 320 ? "320" : "640";
    return thumbUrl.replace(/\/responsive\/\d+\//, `/responsive/${size}/`);
  }

  if (!/thecocktaildb\.com/.test(thumbUrl)) return thumbUrl;
  // Already pinned to a variant by whoever stored it.
  if (/\/(small|medium|large)$/.test(thumbUrl)) return thumbUrl;
  return `${thumbUrl}/${renderedPx <= 200 ? "small" : "medium"}`;
}

/**
 * The size of a provider's largest picture, for the enlarged view.
 *
 * Drawing past this would only blow the image up, so the viewer stops here.
 */
export function drinkImageFullPx(thumbUrl: string | null | undefined): number {
  if (thumbUrl && /cocktail\.glass\//.test(thumbUrl)) return 640;
  // TheCocktailDB's originals.
  return 700;
}
