/**
 * Product lookup: turning a barcode into a bottle.
 *
 * Deliberately separate from `src/lib/providers/`, which is about cocktail
 * recipes. The two look superficially similar — a keyed third-party service
 * behind a button, cached locally — but widening `ProviderId` to cover a
 * product database would put it in the Settings provider picker, the recipe
 * fallback chain and the drink-key parser, where it is nonsense.
 *
 * If a second product source is ever added (Open Food Facts is the obvious
 * one), a `ProductProvider` interface is the natural refactor. One
 * implementation does not justify the abstraction yet.
 */

/** What a lookup knows about a bottle. */
export interface ProductLookup {
  /** Normalized barcode. */
  code: string;
  title: string | null;
  brand: string | null;
  /** As reported, e.g. "750 ml". */
  size: string | null;
  /** The service's own category string. */
  category: string | null;
  description: string | null;
  imageUrl: string | null;
  /** Which service answered, e.g. "upcitemdb". */
  source: string;
}

/** How many lookups are left before the service stops answering. */
export interface QuotaState {
  limit: number;
  remaining: number;
  /** ISO timestamp; when the allowance resets. */
  resetAt: string | null;
  /** ISO timestamp; when we last heard from the service. */
  updatedAt: string | null;
  /** Counted locally since `resetAt`, for when the headers go missing. */
  spent: number;
}

export class ProductLookupError extends Error {
  constructor(
    message: string,
    readonly source: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProductLookupError";
  }
}
