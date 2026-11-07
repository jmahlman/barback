import "server-only";
import { db } from "@/lib/db";
import { drinkPageUrl } from "@/lib/providers/cocktaildb";
import {
  drinkKey,
  type ProviderDrink,
  type ProviderId,
  type ProviderIngredient,
} from "@/lib/providers/types";

/**
 * Provider responses are cached in SQLite. Two reasons: upstream keys are
 * rate limited and shared, and caching is what lets every page render without
 * touching the network.
 */

const DRINK_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const QUERY_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CachedRow {
  id: string;
  provider: string;
  externalId: string;
  name: string;
  slug: string;
  thumbUrl: string | null;
  category: string | null;
  alcoholic: string | null;
  glass: string | null;
  instructions: string | null;
  ingredients: string;
}

export function rowToDrink(row: CachedRow): ProviderDrink {
  let ingredients: ProviderIngredient[] = [];
  try {
    ingredients = JSON.parse(row.ingredients) as ProviderIngredient[];
  } catch {
    ingredients = [];
  }

  const provider = (row.provider === "apininjas" ? "apininjas" : "cocktaildb") as ProviderId;

  return {
    provider,
    externalId: row.externalId,
    key: row.id,
    name: row.name,
    slug: row.slug,
    thumbUrl: row.thumbUrl,
    category: row.category,
    alcoholic: row.alcoholic,
    glass: row.glass,
    instructions: row.instructions,
    ingredients,
    sourceUrl: provider === "cocktaildb" ? drinkPageUrl(row.externalId) : null,
  };
}

export async function cacheDrinks(drinks: ProviderDrink[]): Promise<void> {
  for (const drink of drinks) {
    const data = {
      provider: drink.provider,
      externalId: drink.externalId,
      name: drink.name,
      slug: drink.slug,
      thumbUrl: drink.thumbUrl,
      category: drink.category,
      alcoholic: drink.alcoholic,
      glass: drink.glass,
      instructions: drink.instructions,
      ingredients: JSON.stringify(drink.ingredients),
      fetchedAt: new Date(),
    };
    await db.cachedDrink.upsert({
      where: { id: drink.key },
      create: { id: drink.key, ...data },
      update: data,
    });
  }
}

/** Everything cached, for matching against the shelf. No network. */
export async function allCachedDrinks(): Promise<ProviderDrink[]> {
  const rows = await db.cachedDrink.findMany();
  return rows.map(rowToDrink);
}

export async function cachedDrinkCount(): Promise<number> {
  return db.cachedDrink.count();
}

/** Per-provider counts, shown on the Settings page. */
export async function cachedCountsByProvider(): Promise<Record<string, number>> {
  const rows = await db.cachedDrink.groupBy({
    by: ["provider"],
    _count: { _all: true },
  });
  const out: Record<string, number> = {};
  for (const row of rows) out[row.provider] = row._count._all;
  return out;
}

/** One cached drink by its namespaced key. No network. */
export async function getCachedDrink(key: string): Promise<ProviderDrink | null> {
  const row = await db.cachedDrink.findUnique({ where: { id: key } });
  return row ? rowToDrink(row) : null;
}

export async function isDrinkFresh(key: string): Promise<boolean> {
  const row = await db.cachedDrink.findUnique({
    where: { id: key },
    select: { fetchedAt: true },
  });
  return Boolean(row && Date.now() - row.fetchedAt.getTime() < DRINK_TTL_MS);
}

/**
 * Search cached drinks by name. SQLite through Prisma has no case-insensitive
 * `contains`, so the lowercased slug is matched too.
 */
export async function searchCachedDrinks(query: string): Promise<ProviderDrink[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const rows = await db.cachedDrink.findMany({
    where: {
      OR: [
        { name: { contains: trimmed } },
        { slug: { contains: trimmed.toLowerCase() } },
      ],
    },
    orderBy: { name: "asc" },
    take: 60,
  });
  return rows.map(rowToDrink);
}

// --- Query-level caching ---------------------------------------------------

function queryKey(provider: ProviderId, kind: string, value: string): string {
  return `${provider}~${kind}~${value.toLowerCase()}`;
}

/** Drink keys a previous ingredient query returned, if still fresh. */
export async function getCachedQuery(
  provider: ProviderId,
  kind: string,
  value: string,
): Promise<string[] | null> {
  const row = await db.cachedFilter.findUnique({
    where: { key: queryKey(provider, kind, value) },
  });
  if (!row) return null;
  if (Date.now() - row.fetchedAt.getTime() > QUERY_TTL_MS) return null;
  try {
    return JSON.parse(row.drinkIds) as string[];
  } catch {
    return null;
  }
}

export async function setCachedQuery(
  provider: ProviderId,
  kind: string,
  value: string,
  drinkKeys: string[],
): Promise<void> {
  const key = queryKey(provider, kind, value);
  const payload = { drinkIds: JSON.stringify(drinkKeys), fetchedAt: new Date() };
  await db.cachedFilter.upsert({
    where: { key },
    create: { key, ...payload },
    update: payload,
  });
}

export async function clearCache(provider?: ProviderId): Promise<number> {
  if (provider) {
    const removed = await db.cachedDrink.deleteMany({ where: { provider } });
    await db.cachedFilter.deleteMany({
      where: { key: { startsWith: `${provider}~` } },
    });
    return removed.count;
  }
  const removed = await db.cachedDrink.deleteMany({});
  await db.cachedFilter.deleteMany({});
  return removed.count;
}

export { drinkKey };
