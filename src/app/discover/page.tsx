import Link from "next/link";
import type { Metadata } from "next";
import { AppShell, PageBody, PageHeader } from "@/components/app-shell";
import { DiscoverCard } from "@/components/discover-card";
import {
  ClearCacheButton,
  DiscoverSearchForm,
  ScanButton,
} from "@/components/discover-controls";
import { EmptyState } from "@/components/empty-state";
import { BottleIcon, CartIcon, SparkIcon } from "@/components/icons";
import { cachedDrinkCount, searchCachedDrinks } from "@/lib/providers/cache";
import { discoverFromCache, type DiscoverEntry } from "@/lib/discover";
import { PROVIDER_LIST, providerChain } from "@/lib/providers/registry";
import { evaluateRecipe } from "@/lib/matching";
import { loadInventoryIndex } from "@/lib/recipe-queries";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Discover" };

/**
 * Rendering this page never calls TheCocktailDB. Everything shown comes from
 * the local cache; the API is only contacted when you press a button.
 */
export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireUser();
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  const [cached, chain] = await Promise.all([cachedDrinkCount(), providerChain()]);

  // Credit every provider that has data in the cache, not just the active one.
  const configured = new Set(chain.map((p) => p.id));
  const attributions = PROVIDER_LIST.filter((p) => configured.has(p.id)).map(
    (p) => p.attribution,
  );
  const activeLabel = chain[0]?.label ?? "a cocktail provider";

  return (
    <AppShell user={user}>
      <PageHeader
        title="Discover"
        subtitle={
          query
            ? `Saved cocktails matching “${query}”`
            : `Cocktails from ${activeLabel}, matched to your shelf.`
        }
      />
      <PageBody>
        <DiscoverSearchForm defaultQuery={query} />

        {query ? (
          <CachedSearchResults userId={user.id} query={query} activeLabel={activeLabel} />
        ) : (
          <FromYourShelf userId={user.id} cached={cached} activeLabel={activeLabel} />
        )}

        <div className="space-y-2 border-t border-bar-800 pt-4">
          <p className="text-xs text-bar-400">
            {cached > 0
              ? `${cached} cocktails saved locally. Lookups only run when you ask.`
              : "Nothing saved locally yet. Lookups only run when you ask."}
          </p>
          <ClearCacheButton count={cached} />
          {attributions.map((line) => (
            <p key={line} className="text-xs text-bar-400">
              {line}
            </p>
          ))}
        </div>
      </PageBody>
    </AppShell>
  );
}

async function savedExternalIds(userId: string): Promise<Set<string>> {
  const rows = await db.recipe.findMany({
    where: { userId, externalId: { not: null } },
    select: { externalId: true },
  });
  return new Set(rows.map((r) => r.externalId as string));
}

async function CachedSearchResults({
  userId,
  query,
  activeLabel,
}: {
  userId: string;
  query: string;
  activeLabel: string;
}) {
  const [drinks, inventory, saved] = await Promise.all([
    searchCachedDrinks(query),
    loadInventoryIndex(userId),
    savedExternalIds(userId),
  ]);

  if (drinks.length === 0) {
    return (
      <EmptyState
        title="Not in your saved cocktails"
        body={`Nothing saved matches “${query}”. Use the lookup link above to ask ${activeLabel} — that is the only thing that calls the API.`}
      />
    );
  }

  const entries: DiscoverEntry[] = drinks.map((drink) => ({
    drink,
    imported: saved.has(drink.key),
    evaluation: evaluateRecipe(
      drink.ingredients.map((i) => ({
        name: i.name,
        slug: i.slug,
        measure: i.measure,
      })),
      inventory,
    ),
  }));

  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-bar-400">
        {entries.length} saved result{entries.length === 1 ? "" : "s"}
      </h2>
      <ul className="space-y-3">
        {entries.map((entry) => (
          <li key={entry.drink.key}>
            <DiscoverCard entry={entry} />
          </li>
        ))}
      </ul>
    </section>
  );
}

async function FromYourShelf({
  userId,
  cached,
  activeLabel,
}: {
  userId: string;
  cached: number;
  activeLabel: string;
}) {
  const result = await discoverFromCache(userId);

  if (result.emptyInventory) {
    return (
      <EmptyState
        icon={<BottleIcon className="size-12" />}
        title="Add something to your bar first"
        body="Once Barback knows what you keep on hand, it can tell you which cocktails you can already make."
        action={
          <Link href="/inventory" className="btn-primary">
            Go to inventory
          </Link>
        }
      />
    );
  }

  if (cached === 0) {
    return (
      <EmptyState
        icon={<SparkIcon className="size-12" />}
        title="Ready when you are"
        body={`Barback will ask ${activeLabel} which cocktails your shelf can cover, then keep the answers locally so this page works offline afterwards.`}
        action={<ScanButton label={`Check ${activeLabel} now`} />}
      />
    );
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-bar-400">
          <SparkIcon className="size-4" />
          You can make {result.makeable.length} of {result.considered} saved
        </h2>
        {result.makeable.length === 0 ? (
          <EmptyState
            title="Nothing fully stocked yet"
            body="You are close on a few below. Adding one bottle usually unlocks several drinks."
          />
        ) : (
          <ul className="space-y-3">
            {result.makeable.map((entry) => (
              <li key={entry.drink.key}>
                <DiscoverCard entry={entry} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {result.suggestions.length > 0 ? (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-bar-400">
            <CartIcon className="size-4" />
            Buy one of these next
          </h2>
          <ul className="card divide-y divide-bar-800 overflow-hidden">
            {result.suggestions.map((suggestion) => (
              <li key={suggestion.slug} className="flex items-center justify-between gap-3 p-3">
                <span className="text-sm text-bar-200">{suggestion.name}</span>
                <span className="chip shrink-0">unlocks {suggestion.unlocks}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {result.almost.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-bar-400">
            One ingredient away
          </h2>
          <ul className="space-y-3">
            {result.almost.map((entry) => (
              <li key={entry.drink.key}>
                <DiscoverCard entry={entry} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="card space-y-2 p-4">
        <h2 className="text-sm font-medium text-bar-300">Shelf changed?</h2>
        <p className="text-xs text-bar-400">
          Run another lookup to pick up cocktails your newer ingredients unlock.
        </p>
        <ScanButton label={`Check ${activeLabel} again`} variant="secondary" />
      </section>
    </div>
  );
}
