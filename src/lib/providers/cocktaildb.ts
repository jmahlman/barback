import "server-only";
import { slugifyIngredient } from "@/lib/ingredients";
import { getSetting, SETTING_KEYS } from "@/lib/settings";
import {
  drinkKey,
  ProviderError,
  type CocktailProvider,
  type ProviderDrink,
  type ProviderIngredient,
} from "@/lib/providers/types";

/**
 * TheCocktailDB — https://www.thecocktaildb.com/
 *
 * Per their guidance for automated clients: search or filter for candidates,
 * then always run a full lookup before showing a recipe; pair strIngredientN
 * with strMeasureN keeping order and skipping blanks; and never invent
 * quantities or silently swap ingredients.
 */

function baseUrl(apiKey: string): string {
  return `https://www.thecocktaildb.com/api/json/v1/${apiKey}`;
}

export function drinkPageUrl(externalId: string): string {
  return `https://www.thecocktaildb.com/drink/${externalId}`;
}

interface RawDrink {
  idDrink: string;
  strDrink: string;
  strDrinkThumb?: string | null;
  strCategory?: string | null;
  strAlcoholic?: string | null;
  strGlass?: string | null;
  strInstructions?: string | null;
  [key: string]: unknown;
}

/** Pair strIngredientN with strMeasureN, keeping order and skipping blanks. */
function parseIngredients(raw: RawDrink): ProviderIngredient[] {
  const out: ProviderIngredient[] = [];
  for (let i = 1; i <= 15; i += 1) {
    const name = raw[`strIngredient${i}`];
    if (typeof name !== "string") continue;
    const trimmed = name.trim();
    if (!trimmed) continue;
    const measureRaw = raw[`strMeasure${i}`];
    const measure =
      typeof measureRaw === "string" && measureRaw.trim() ? measureRaw.trim() : null;
    out.push({ name: trimmed, slug: slugifyIngredient(trimmed), measure });
  }
  return out;
}

function toProviderDrink(raw: RawDrink): ProviderDrink {
  return {
    provider: "cocktaildb",
    externalId: raw.idDrink,
    key: drinkKey("cocktaildb", raw.idDrink),
    name: raw.strDrink,
    slug: slugifyIngredient(raw.strDrink),
    thumbUrl: raw.strDrinkThumb?.trim() || null,
    category: raw.strCategory?.trim() || null,
    alcoholic: raw.strAlcoholic?.trim() || null,
    glass: raw.strGlass?.trim() || null,
    instructions: raw.strInstructions?.trim() || null,
    ingredients: parseIngredients(raw),
    sourceUrl: drinkPageUrl(raw.idDrink),
  };
}

async function apiGet<T>(path: string): Promise<T | null> {
  const apiKey = await getSetting(SETTING_KEYS.cocktaildbApiKey);
  if (!apiKey) {
    throw new ProviderError("No TheCocktailDB key is configured.", "cocktaildb");
  }

  console.info(`[cocktaildb] GET ${path}`);

  let response: Response;
  try {
    response = await fetch(`${baseUrl(apiKey)}/${path}`, {
      headers: { Accept: "application/json" },
      // Caching is handled in our own database, with a much longer life.
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new ProviderError("TheCocktailDB did not respond.", "cocktaildb");
  }

  if (response.status === 401 || response.status === 403) {
    throw new ProviderError(
      "TheCocktailDB rejected the key. Check it on the Settings page.",
      "cocktaildb",
      response.status,
    );
  }
  if (response.status === 429) {
    throw new ProviderError("TheCocktailDB is rate limiting us.", "cocktaildb", 429);
  }
  if (!response.ok) {
    throw new ProviderError(
      `TheCocktailDB returned ${response.status}.`,
      "cocktaildb",
      response.status,
    );
  }

  try {
    return (await response.json()) as T;
  } catch {
    // An empty body is how this API says "no results".
    return null;
  }
}

/** Look up several drinks, a few at a time. */
async function lookupMany(ids: string[]): Promise<ProviderDrink[]> {
  const unique = [...new Set(ids)];
  const out: ProviderDrink[] = [];
  const CONCURRENCY = 4;

  for (let i = 0; i < unique.length; i += CONCURRENCY) {
    const batch = unique.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (id) => {
        try {
          return await cocktailDbProvider.lookupById(id);
        } catch {
          return null;
        }
      }),
    );
    for (const drink of results) if (drink) out.push(drink);
  }

  return out;
}

export const cocktailDbProvider: CocktailProvider = {
  id: "cocktaildb",
  label: "TheCocktailDB",
  description:
    "Photos, glassware and category metadata, with measures already separated from ingredient names. Its free key returns only one drink per ingredient search, so Barback downloads the whole catalog once and matches your shelf locally instead. Not licensed for public instances.",
  attribution:
    "Recipe data and imagery: TheCocktailDB (https://www.thecocktaildb.com/)",
  capabilities: {
    images: true,
    stableIds: true,
    multiIngredientFilter: false,
    // filter.php returns a single drink on the free development key, so
    // discovery pulls the catalog instead. See fetchCatalog below.
    resultLimit: null,
    catalog: true,
  },

  async isConfigured() {
    return Boolean(await getSetting(SETTING_KEYS.cocktaildbApiKey));
  },

  async searchByName(query: string) {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const data = await apiGet<{ drinks: RawDrink[] | null }>(
      `search.php?s=${encodeURIComponent(trimmed)}`,
    );
    return (data?.drinks ?? []).map(toProviderDrink);
  },

  async findByIngredient(slug: string) {
    const trimmed = slug.trim();
    if (!trimmed) return [];
    // The free tier filters a single ingredient and returns ids only, so a
    // full lookup follows before anything is shown.
    const data = await apiGet<{ drinks: { idDrink: string }[] | null }>(
      `filter.php?i=${encodeURIComponent(trimmed)}`,
    );
    const ids = (data?.drinks ?? []).map((d) => d.idDrink);
    if (ids.length === 0) return [];
    return lookupMany(ids);
  },

  /**
   * Pull the whole catalog, a letter at a time.
   *
   * `search.php?f=<letter>` is the one free endpoint that returns complete
   * drinks — ingredients, measures, instructions and all — rather than ids
   * to look up one by one. Thirty-six requests gets everything TheCocktailDB
   * has, after which matching against the shelf never needs the network
   * again.
   *
   * This exists because `filter.php?i=<ingredient>` returns exactly ONE
   * drink on the free development key, which made ingredient-led discovery
   * useless: eight shelf ingredients produced eight arbitrary cocktails.
   */
  async fetchCatalog(onProgress?: (done: number, total: number) => void) {
    const letters = "abcdefghijklmnopqrstuvwxyz0123456789".split("");
    const found = new Map<string, ProviderDrink>();
    let failures = 0;

    for (const [index, letter] of letters.entries()) {
      try {
        const data = await apiGet<{ drinks: RawDrink[] | null }>(
          `search.php?f=${letter}`,
        );
        for (const raw of data?.drinks ?? []) {
          const drink = toProviderDrink(raw);
          found.set(drink.key, drink);
        }
      } catch {
        // One bad letter should not lose the other thirty-five.
        failures += 1;
      }
      onProgress?.(index + 1, letters.length);
    }

    if (found.size === 0) {
      throw new ProviderError(
        failures > 0
          ? "TheCocktailDB could not be reached."
          : "TheCocktailDB returned nothing.",
        "cocktaildb",
      );
    }

    return [...found.values()];
  },

  async lookupById(externalId: string) {
    const data = await apiGet<{ drinks: RawDrink[] | null }>(
      `lookup.php?i=${encodeURIComponent(externalId)}`,
    );
    const raw = data?.drinks?.[0];
    return raw ? toProviderDrink(raw) : null;
  },
};
