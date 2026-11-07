import "server-only";
import { slugifyIngredient } from "@/lib/ingredients";
import {
  externalIdFor,
  parseIngredientString,
  titleCase,
} from "@/lib/providers/api-ninjas-parse";
import { getSetting, SETTING_KEYS } from "@/lib/settings";
import {
  drinkKey,
  ProviderError,
  type CocktailProvider,
  type ProviderDrink,
} from "@/lib/providers/types";

/**
 * API Ninjas cocktail API — https://api-ninjas.com/api/cocktail
 *
 * Returns at most 10 recipes per query, with no ids, no images and no
 * glass/category metadata. Ingredients arrive as single strings with the
 * measure baked in ("1 1/2 oz Tequila, Lunazul Reposado"), so the measure has
 * to be split off before matching can work.
 */

const ENDPOINT = "https://api.api-ninjas.com/v1/cocktail";

interface RawCocktail {
  name?: string;
  ingredients?: string[];
  instructions?: string;
}

function toProviderDrink(raw: RawCocktail): ProviderDrink | null {
  const rawName = raw.name?.trim();
  if (!rawName) return null;

  const name = titleCase(rawName);
  const externalId = externalIdFor(rawName);

  const ingredients = (raw.ingredients ?? [])
    .map(parseIngredientString)
    .filter((ingredient) => ingredient.name);

  return {
    provider: "apininjas",
    externalId,
    key: drinkKey("apininjas", externalId),
    name,
    slug: slugifyIngredient(name),
    // This provider supplies no imagery or metadata.
    thumbUrl: null,
    category: null,
    alcoholic: null,
    glass: null,
    instructions: raw.instructions?.trim() || null,
    ingredients,
    sourceUrl: null,
  };
}

async function request(params: Record<string, string>): Promise<RawCocktail[]> {
  const apiKey = await getSetting(SETTING_KEYS.apiNinjasApiKey);
  if (!apiKey) {
    throw new ProviderError("No API Ninjas key is configured.", "apininjas");
  }

  const url = new URL(ENDPOINT);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  console.info(`[apininjas] GET ${url.pathname}${url.search}`);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "X-Api-Key": apiKey, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new ProviderError("API Ninjas did not respond.", "apininjas");
  }

  if (response.status === 401 || response.status === 403) {
    throw new ProviderError(
      "API Ninjas rejected the key. Check it on the Settings page.",
      "apininjas",
      response.status,
    );
  }
  if (response.status === 429) {
    throw new ProviderError(
      "API Ninjas quota reached for this month.",
      "apininjas",
      429,
    );
  }
  if (!response.ok) {
    throw new ProviderError(
      `API Ninjas returned ${response.status}.`,
      "apininjas",
      response.status,
    );
  }

  try {
    const body = await response.json();
    return Array.isArray(body) ? (body as RawCocktail[]) : [];
  } catch {
    throw new ProviderError("API Ninjas returned a malformed response.", "apininjas");
  }
}

function dedupe(drinks: ProviderDrink[]): ProviderDrink[] {
  const seen = new Map<string, ProviderDrink>();
  for (const drink of drinks) {
    // "martini" and "martini cocktail" are distinct ids but often identical
    // recipes; keeping the first occurrence is enough.
    if (!seen.has(drink.key)) seen.set(drink.key, drink);
  }
  return [...seen.values()];
}

export const apiNinjasProvider: CocktailProvider = {
  id: "apininjas",
  label: "API Ninjas",
  description:
    "Text-only recipes. No photos or glassware, capped at 10 results per search, and ingredient matching is loose — searching “gin” can return drinks containing only ginger ale.",
  attribution: "Recipe data: API Ninjas (https://api-ninjas.com/api/cocktail)",
  capabilities: {
    images: false,
    stableIds: false,
    multiIngredientFilter: true,
    resultLimit: 10,
  },

  async isConfigured() {
    return Boolean(await getSetting(SETTING_KEYS.apiNinjasApiKey));
  },

  async searchByName(query: string) {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const raw = await request({ name: trimmed });
    return dedupe(raw.map(toProviderDrink).filter((d): d is ProviderDrink => d !== null));
  },

  async findByIngredient(slug: string) {
    const trimmed = slug.trim();
    if (!trimmed) return [];
    const raw = await request({ ingredients: trimmed });
    const drinks = dedupe(
      raw.map(toProviderDrink).filter((d): d is ProviderDrink => d !== null),
    );

    // This provider substring-matches ingredient names, so a query for "gin"
    // comes back with drinks whose only match is "ginger ale". Keep only the
    // ones that genuinely contain the ingredient.
    return drinks.filter((drink) =>
      drink.ingredients.some(
        (ingredient) =>
          ingredient.slug === trimmed ||
          ingredient.slug.split(" ").includes(trimmed),
      ),
    );
  },

  async lookupById() {
    // No stable ids upstream; cached copies are the only way back to a drink.
    return null;
  },
};
