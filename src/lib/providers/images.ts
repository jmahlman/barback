/**
 * TheCocktailDB serves sized variants by appending /small, /medium or /large
 * to the thumbnail URL. Other providers have no imagery, so this is a no-op
 * for them.
 */
export function drinkImage(
  thumbUrl: string | null | undefined,
  size: "small" | "medium" | "large" = "medium",
): string | null {
  if (!thumbUrl) return null;
  if (!/thecocktaildb\.com/.test(thumbUrl)) return thumbUrl;
  if (/\/(small|medium|large)$/.test(thumbUrl)) return thumbUrl;
  return `${thumbUrl}/${size}`;
}
