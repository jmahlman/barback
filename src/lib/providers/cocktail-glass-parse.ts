/**
 * Turning cocktail.glass's catalog into Barback's shape.
 *
 * Kept free of server-only imports so it can be exercised directly: this is
 * all the logic in the provider, and none of it needs the network.
 *
 * cocktail.glass publishes structured data, which makes this the easiest of
 * the three providers to read: amounts are numbers with units rather than
 * free text, every ingredient carries a type, and garnishes arrive in their
 * own list instead of mixed in with what goes in the glass.
 */

import { slugifyIngredient } from "@/lib/ingredients";
import { drinkKey, type ProviderDrink, type ProviderIngredient } from "@/lib/providers/types";

export const COCKTAIL_GLASS_ORIGIN = "https://cocktail.glass";

export interface RawCocktailGlassIngredient {
  ref?: string;
  name?: string;
  type?: string;
  amount?: number | null;
  unit?: string | null;
}

export interface RawCocktailGlassDrink {
  name?: string;
  slug?: string;
  glass?: string | null;
  family?: string | null;
  method?: string | null;
  tags?: string[];
  ingredients?: RawCocktailGlassIngredient[];
  garnish?: string[];
  preparation?: string[];
  url?: string | null;
}

/** The recipe's own page, for the "Imported from" credit. */
export function cocktailGlassPageUrl(slug: string): string {
  return `${COCKTAIL_GLASS_ORIGIN}/${encodeURIComponent(slug)}/`;
}

/**
 * The picture for a drink.
 *
 * The catalog carries no image field, but every recipe has one at a path
 * derived from its slug, in two sizes. The larger one is stored; the smaller
 * is chosen at render time by `drinkImage`, the same way TheCocktailDB's
 * sized variants are.
 */
export function cocktailGlassImageUrl(slug: string): string {
  return `${COCKTAIL_GLASS_ORIGIN}/images/responsive/640/${encodeURIComponent(slug)}.webp`;
}

/** Units that read better in the plural once there is more than one. */
const PLURALS: Record<string, string> = {
  dash: "dashes",
  barspoon: "barspoons",
  pinch: "pinches",
  drop: "drops",
  wedge: "wedges",
  slice: "slices",
  piece: "pieces",
  puff: "puffs",
};

/** "60 ml", "2 dashes", "½ barspoon". Null when there is nothing to say. */
export function formatMeasure(
  amount: number | null | undefined,
  unit: string | null | undefined,
): string | null {
  const cleanUnit = unit?.trim() || "";
  if (amount === null || amount === undefined || !Number.isFinite(amount) || amount <= 0) {
    return cleanUnit || null;
  }

  // A half is the only fraction that turns up, and "0.5 barspoon" reads like
  // a spreadsheet.
  const quantity = amount === 0.5 ? "½" : String(amount);
  if (!cleanUnit) return quantity;

  const plural = amount > 1 ? PLURALS[cleanUnit.toLowerCase()] : undefined;
  return `${quantity} ${plural ?? cleanUnit}`;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toIngredient(raw: RawCocktailGlassIngredient): ProviderIngredient | null {
  const name = text(raw.name);
  if (!name) return null;
  return {
    name,
    slug: slugifyIngredient(name),
    measure: formatMeasure(raw.amount, raw.unit),
  };
}

function toGarnish(raw: unknown): ProviderIngredient | null {
  const name = text(raw);
  if (!name) return null;
  // Lower-case garnishes ("salt rim") sit next to capitalized ones ("Lime
  // wheel") in the source; tidy the first letter so the list looks deliberate.
  const display = name[0].toUpperCase() + name.slice(1);
  return { name: display, slug: slugifyIngredient(display), measure: null, garnish: true };
}

/**
 * One catalog entry as a `ProviderDrink`, or null when it is too incomplete
 * to be useful — no name, no slug, or nothing to put in the glass.
 */
export function toProviderDrink(raw: RawCocktailGlassDrink): ProviderDrink | null {
  const name = text(raw.name);
  const slug = text(raw.slug);
  if (!name || !slug) return null;

  const ingredients = (raw.ingredients ?? [])
    .map(toIngredient)
    .filter((i): i is ProviderIngredient => i !== null);
  if (ingredients.length === 0) return null;

  const garnishes = (raw.garnish ?? [])
    .map(toGarnish)
    .filter((i): i is ProviderIngredient => i !== null);

  const steps = (raw.preparation ?? []).map(text).filter((s): s is string => s !== null);

  return {
    provider: "cocktailglass",
    externalId: slug,
    key: drinkKey("cocktailglass", slug),
    name,
    slug: slugifyIngredient(name),
    thumbUrl: cocktailGlassImageUrl(slug),
    // "Sour", "Spirit-Forward", "Tiki" -- the closest thing it has to a category.
    category: text(raw.family),
    // Their own tag, not a guess from the ingredients: an Angostura Sour has
    // no spirit in it by type and is still very much a drink.
    alcoholic: raw.tags?.includes("non-alcoholic") ? "Non alcoholic" : "Alcoholic",
    glass: text(raw.glass),
    instructions: steps.length > 0 ? steps.join("\n") : null,
    ingredients: [...ingredients, ...garnishes],
    sourceUrl: text(raw.url) ?? cocktailGlassPageUrl(slug),
  };
}

/** The whole catalog, skipping anything unusable rather than failing on it. */
export function parseCatalog(payload: unknown): ProviderDrink[] {
  if (!Array.isArray(payload)) return [];
  const drinks: ProviderDrink[] = [];
  const seen = new Set<string>();
  for (const raw of payload) {
    if (!raw || typeof raw !== "object") continue;
    const drink = toProviderDrink(raw as RawCocktailGlassDrink);
    if (!drink || seen.has(drink.key)) continue;
    seen.add(drink.key);
    drinks.push(drink);
  }
  return drinks;
}

/** Case- and accent-insensitive name search, for the "look it up" box. */
export function matchesName(drink: ProviderDrink, query: string): boolean {
  const fold = (value: string) =>
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "");
  const needle = fold(query.trim());
  return needle.length > 0 && fold(drink.name).includes(needle);
}
