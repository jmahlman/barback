import "server-only";
import {
  COCKTAIL_GLASS_ORIGIN,
  matchesName,
  parseCatalog,
} from "@/lib/providers/cocktail-glass-parse";
import {
  ProviderError,
  type CocktailProvider,
  type ProviderDrink,
} from "@/lib/providers/types";

/**
 * cocktail.glass — https://cocktail.glass/
 *
 * Five hundred recipes in one keyless request, with ingredients that arrive
 * structured — an amount, a unit and a type — rather than as text to be
 * picked apart. That makes it the best of the three providers to match a
 * shelf against, and why it is the default.
 *
 * It publishes no per-recipe or search endpoint, only the whole catalog, so
 * every method here reads that one file. Barback keeps a local copy with the
 * site's permission; see the Outside services page.
 */

const CATALOG_PATH = "/cocktails.json";

/**
 * How long one download is reused within a running server.
 *
 * Search and single-drink lookups both need the catalog. Without this, typing
 * three searches in a row would fetch the same 340 KB file three times. It is
 * a convenience for one session, not the real cache: what Discover matches
 * against is the copy in the database.
 */
const MEMO_MS = 10 * 60 * 1000;

let memo: { at: number; drinks: ProviderDrink[] } | null = null;

async function fetchAll(): Promise<ProviderDrink[]> {
  if (memo && Date.now() - memo.at < MEMO_MS) return memo.drinks;

  console.info(`[cocktailglass] GET ${CATALOG_PATH}`);

  let response: Response;
  try {
    response = await fetch(`${COCKTAIL_GLASS_ORIGIN}${CATALOG_PATH}`, {
      headers: { Accept: "application/json" },
      // Caching is handled in our own database, with a much longer life.
      cache: "no-store",
      // The whole catalog in one go, so a little longer than a lookup.
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new ProviderError("cocktail.glass did not respond.", "cocktailglass");
  }

  if (response.status === 429) {
    throw new ProviderError("cocktail.glass is rate limiting us.", "cocktailglass", 429);
  }
  if (!response.ok) {
    throw new ProviderError(
      `cocktail.glass returned ${response.status}.`,
      "cocktailglass",
      response.status,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ProviderError("cocktail.glass sent something unreadable.", "cocktailglass");
  }

  const drinks = parseCatalog(payload);
  if (drinks.length === 0) {
    throw new ProviderError("cocktail.glass returned no recipes.", "cocktailglass");
  }

  memo = { at: Date.now(), drinks };
  return drinks;
}

export const cocktailGlassProvider: CocktailProvider = {
  id: "cocktailglass",
  label: "cocktail.glass",
  description:
    "Five hundred cocktails in a single download, with no key to sign up for. Measures come as numbers and units rather than free text, and garnishes are listed separately, so matching against your shelf is the most accurate of the three. Photos for every recipe.",
  attribution: "Recipe data and imagery: cocktail.glass (https://cocktail.glass/)",
  capabilities: {
    images: true,
    stableIds: true,
    // No filter endpoint at all -- but with the whole catalog local, matching
    // on any number of ingredients is free.
    multiIngredientFilter: false,
    resultLimit: null,
    catalog: true,
  },

  async isConfigured() {
    // Nothing to configure: no key, no sign-up.
    return true;
  },

  async searchByName(query: string) {
    if (!query.trim()) return [];
    const drinks = await fetchAll();
    return drinks.filter((drink) => matchesName(drink, query));
  },

  async findByIngredient(slug: string) {
    const wanted = slug.trim();
    if (!wanted) return [];
    const drinks = await fetchAll();
    return drinks.filter((drink) =>
      drink.ingredients.some((ingredient) => !ingredient.garnish && ingredient.slug === wanted),
    );
  },

  async lookupById(externalId: string) {
    const drinks = await fetchAll();
    return drinks.find((drink) => drink.externalId === externalId) ?? null;
  },

  /** One request for everything, rather than TheCocktailDB's thirty-six. */
  async fetchCatalog(onProgress?: (done: number, total: number) => void) {
    // Discover always wants a fresh copy when someone presses the button, so
    // skip the in-process reuse that search and lookup get.
    memo = null;
    const drinks = await fetchAll();
    onProgress?.(1, 1);
    return drinks;
  },
};
