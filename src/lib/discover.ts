import "server-only";
import { db } from "@/lib/db";
import { loadInventoryIndex } from "@/lib/recipe-queries";
import {
  evaluateRecipe,
  rankByMakeability,
  shoppingSuggestions,
  type RecipeEvaluation,
} from "@/lib/matching";
import { prettifyIngredient } from "@/lib/ingredients";
import {
  allCachedDrinks,
  cacheDrinks,
  searchCachedDrinks,
  getCachedQuery,
  setCachedQuery,
} from "@/lib/providers/cache";
import { providerChain } from "@/lib/providers/registry";
import { ProviderError, type ProviderDrink } from "@/lib/providers/types";
import { onePerCocktail } from "@/lib/providers/visible";

/** Categories worth querying upstream — a base spirit anchors most drinks. */
const ANCHOR_CATEGORIES = new Set(["spirit", "liqueur", "vermouth", "wine"]);

/** Cap on upstream queries per scan, to stay polite. */
const MAX_ANCHORS = 8;

export interface DiscoverEntry {
  drink: ProviderDrink;
  evaluation: RecipeEvaluation;
  /** Already saved in the user's book. */
  imported: boolean;
}

export interface DiscoverResult {
  makeable: DiscoverEntry[];
  almost: DiscoverEntry[];
  suggestions: { slug: string; name: string; unlocks: number }[];
  anchorsUsed: string[];
  emptyInventory: boolean;
  considered: number;
  /** Set when a scan hit the network and every provider failed. */
  error: string | null;
  /** Which providers answered during a scan. */
  providersUsed: string[];
}

const EMPTY: DiscoverResult = {
  makeable: [],
  almost: [],
  suggestions: [],
  anchorsUsed: [],
  emptyInventory: false,
  considered: 0,
  error: null,
  providersUsed: [],
};

async function loadContext(userId: string) {
  const [items, inventory, savedKeys] = await Promise.all([
    db.inventoryItem.findMany({
      where: { userId, inStock: true },
      select: { slug: true, name: true, category: true },
      orderBy: { name: "asc" },
    }),
    loadInventoryIndex(userId),
    db.recipe
      .findMany({
        where: { userId, externalId: { not: null } },
        select: { externalId: true },
      })
      .then((rows) => new Set(rows.map((r) => r.externalId as string))),
  ]);
  return { items, inventory, savedKeys };
}

function assemble(
  drinks: ProviderDrink[],
  inventory: Awaited<ReturnType<typeof loadInventoryIndex>>,
  savedKeys: Set<string>,
  meta: Partial<DiscoverResult>,
): DiscoverResult {
  const entries = drinks.map((drink) => ({
    item: drink,
    evaluation: evaluateRecipe(
      drink.ingredients.map((ingredient) => ({
        name: ingredient.name,
        slug: ingredient.slug,
        measure: ingredient.measure,
        // Only some providers list garnishes apart; for the rest this is
        // simply absent, and the ingredient counts like any other.
        garnish: ingredient.garnish ?? false,
      })),
      inventory,
    ),
  }));

  const ranked = rankByMakeability(entries, (drink) => drink.name);

  const toEntry = (e: (typeof ranked)[number]): DiscoverEntry => ({
    drink: e.item,
    evaluation: e.evaluation,
    imported: savedKeys.has(e.item.key),
  });

  return {
    ...EMPTY,
    ...meta,
    makeable: ranked.filter((e) => e.evaluation.makeable).map(toEntry),
    almost: ranked.filter((e) => e.evaluation.missing.length === 1).slice(0, 30).map(toEntry),
    suggestions: shoppingSuggestions(ranked).map((s) => ({
      ...s,
      name: s.name || prettifyIngredient(s.slug),
    })),
    considered: ranked.length,
  };
}

/**
 * The cached drinks Discover shows: only from the providers in use, and one
 * copy of each cocktail, from whichever of them you prefer. No network.
 */
export async function visibleCachedDrinks(): Promise<ProviderDrink[]> {
  const ids = (await providerChain()).map((p) => p.id);
  return onePerCocktail(await allCachedDrinks(ids), ids);
}

/** Search the visible cached drinks by name. No network. */
export async function searchVisibleDrinks(query: string): Promise<ProviderDrink[]> {
  const ids = (await providerChain()).map((p) => p.id);
  return onePerCocktail(await searchCachedDrinks(query, ids), ids);
}

/**
 * Match the shelf against drinks already cached locally.
 * Makes NO network requests, so it is safe to render on page load.
 */
export async function discoverFromCache(userId: string): Promise<DiscoverResult> {
  const { items, inventory, savedKeys } = await loadContext(userId);
  if (items.length === 0) return { ...EMPTY, emptyInventory: true };

  const drinks = await visibleCachedDrinks();
  if (drinks.length === 0) return EMPTY;

  return assemble(drinks, inventory, savedKeys, {});
}

/**
 * Query the configured provider(s) for cocktails the shelf can support.
 *
 * Only ever reached from an explicit user action. Results are cached so later
 * page loads can run offline.
 */
export async function scanForCocktails(userId: string): Promise<DiscoverResult> {
  const { items, inventory, savedKeys } = await loadContext(userId);
  if (items.length === 0) return { ...EMPTY, emptyInventory: true };

  const anchors = items.filter((i) => ANCHOR_CATEGORIES.has(i.category));
  const chosen = (anchors.length > 0 ? anchors : items).slice(0, MAX_ANCHORS);
  const anchorsUsed = chosen.map((c) => c.name);

  const chain = await providerChain();
  const providersUsed = new Set<string>();
  const errors: string[] = [];

  for (const provider of chain) {
    if (!(await provider.isConfigured())) {
      errors.push(`${provider.label}: no API key configured.`);
      continue;
    }

    // Preferred: take the whole catalog and match locally. The alternative,
    // querying per ingredient, is barely usable on free tiers — TheCocktailDB's
    // free key returns a single drink per ingredient.
    //
    // Fetched on every press, never skipped as recent: it is one request,
    // and a changed shelf needs no new data, so the only reason to press is
    // to get the provider's latest recipes.
    if (provider.capabilities.catalog && provider.fetchCatalog) {
      const key = `catalog:${provider.id}`;
      try {
        const drinks = await provider.fetchCatalog();
        await cacheDrinks(drinks);
        await setCachedQuery(
          provider.id,
          "catalog",
          key,
          drinks.map((d) => d.key),
        );
        providersUsed.add(provider.label);
        break;
      } catch (error) {
        errors.push(
          error instanceof ProviderError ? error.message : `${provider.label} failed.`,
        );
        continue;
      }
    }

    // Otherwise, ask about each thing on the shelf in turn.
    let providerFailed = false;
    for (const anchor of chosen) {
      const cachedKeys = await getCachedQuery(provider.id, "i", anchor.slug);
      if (cachedKeys) {
        providersUsed.add(provider.label);
        continue;
      }
      try {
        const drinks = await provider.findByIngredient(anchor.slug);
        await cacheDrinks(drinks);
        await setCachedQuery(provider.id, "i", anchor.slug, drinks.map((d) => d.key));
        providersUsed.add(provider.label);
      } catch (error) {
        errors.push(
          error instanceof ProviderError ? error.message : `${provider.label} failed.`,
        );
        providerFailed = true;
        break;
      }
    }
    if (!providerFailed) break;
  }

  const everything = await visibleCachedDrinks();

  if (everything.length === 0) {
    return {
      ...EMPTY,
      anchorsUsed,
      error:
        errors.length > 0
          ? errors.join(" ")
          : "No cocktails came back. Check that a provider is configured in Settings.",
    };
  }

  return assemble(everything, inventory, savedKeys, {
    anchorsUsed,
    providersUsed: [...providersUsed],
    // Surfaced even on success, so a partial result is not read as a full one.
    error: errors.length > 0 ? errors.join(" ") : null,
  });
}

/** Search by name through the provider chain. Network; action-only. */
export async function searchUpstreamByName(query: string): Promise<{
  drinks: ProviderDrink[];
  error: string | null;
}> {
  const chain = await providerChain();
  const errors: string[] = [];

  for (const provider of chain) {
    if (!(await provider.isConfigured())) {
      errors.push(`${provider.label}: no API key configured.`);
      continue;
    }
    try {
      const drinks = await provider.searchByName(query);
      await cacheDrinks(drinks);
      if (drinks.length > 0) return { drinks, error: null };
    } catch (error) {
      errors.push(
        error instanceof ProviderError ? error.message : `${provider.label} failed.`,
      );
    }
  }

  return { drinks: [], error: errors.length > 0 ? errors.join(" ") : null };
}
