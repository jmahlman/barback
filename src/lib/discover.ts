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
  getCachedQuery,
  setCachedQuery,
} from "@/lib/providers/cache";
import { providerChain } from "@/lib/providers/registry";
import { ProviderError, type ProviderDrink } from "@/lib/providers/types";

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
 * Match the shelf against drinks already cached locally.
 * Makes NO network requests, so it is safe to render on page load.
 */
export async function discoverFromCache(userId: string): Promise<DiscoverResult> {
  const { items, inventory, savedKeys } = await loadContext(userId);
  if (items.length === 0) return { ...EMPTY, emptyInventory: true };

  const drinks = await allCachedDrinks();
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
  const collected = new Map<string, ProviderDrink>();
  const providersUsed = new Set<string>();
  const errors: string[] = [];

  for (const provider of chain) {
    if (!(await provider.isConfigured())) {
      errors.push(`${provider.label}: no API key configured.`);
      continue;
    }

    let providerFailed = false;

    for (const anchor of chosen) {
      // A previous scan may already cover this ingredient.
      const cachedKeys = await getCachedQuery(provider.id, "i", anchor.slug);
      if (cachedKeys) {
        for (const key of cachedKeys) {
          const existing = collected.get(key);
          if (!existing) {
            const fromCache = (await allCachedDrinks()).find((d) => d.key === key);
            if (fromCache) collected.set(key, fromCache);
          }
        }
        providersUsed.add(provider.label);
        continue;
      }

      try {
        const drinks = await provider.findByIngredient(anchor.slug);
        await cacheDrinks(drinks);
        await setCachedQuery(
          provider.id,
          "i",
          anchor.slug,
          drinks.map((d) => d.key),
        );
        for (const drink of drinks) collected.set(drink.key, drink);
        providersUsed.add(provider.label);
      } catch (error) {
        const message =
          error instanceof ProviderError ? error.message : `${provider.label} failed.`;
        errors.push(message);
        providerFailed = true;
        break;
      }
    }

    // The preferred provider worked, so there is no reason to also hit the
    // fallback and mix two sets of results together.
    if (!providerFailed && collected.size > 0) break;
  }

  if (collected.size === 0) {
    return {
      ...EMPTY,
      anchorsUsed,
      error: errors.length > 0 ? errors.join(" ") : "No cocktails came back.",
    };
  }

  // Score against everything known, not just this scan's results.
  const everything = await allCachedDrinks();
  return assemble(everything, inventory, savedKeys, {
    anchorsUsed,
    providersUsed: [...providersUsed],
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
