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
import { cachedDrinkCount, lastFetchedByProvider } from "@/lib/providers/cache";
import { LocalTime } from "@/components/local-time";
import { discoverFromCache, searchVisibleDrinks, type DiscoverEntry } from "@/lib/discover";
import { PROVIDER_LIST, providerChain } from "@/lib/providers/registry";
import { evaluateRecipe } from "@/lib/matching";
import { loadInventoryIndex } from "@/lib/recipe-queries";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Discover" };

/**
 * Rendering this page never calls a cocktail provider. Everything shown comes from
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

  const [cached, chain, fetchedAt] = await Promise.all([
    cachedDrinkCount(),
    providerChain(),
    lastFetchedByProvider(),
  ]);
  // Only the providers Discover is showing; one you have switched away from
  // keeps its drinks, but they are not what is on the page.
  const lastFetched = chain.flatMap((p) => {
    const at = fetchedAt[p.id];
    return at ? [{ id: p.id, label: p.label, iso: at.toISOString() }] : [];
  });

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
        <DiscoverSearchForm defaultQuery={query} providerLabel={activeLabel} />

        {query ? (
          <CachedSearchResults userId={user.id} query={query} activeLabel={activeLabel} />
        ) : (
          <FromYourShelf
            userId={user.id}
            activeLabel={activeLabel}
            wholeCatalog={chain[0]?.capabilities.catalog ?? false}
          />
        )}

        <div className="space-y-2 border-t border-bar-800 pt-4">
          <p className="text-xs text-bar-400">
            {cached > 0
              ? `${cached} cocktails saved locally. Lookups only run when you ask.`
              : "Nothing saved locally yet. Lookups only run when you ask."}
          </p>
          {lastFetched.map((entry) => (
            <p key={entry.id} className="text-xs text-bar-400">
              Last fetched from {entry.label} on <LocalTime iso={entry.iso} />.
            </p>
          ))}
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
    searchVisibleDrinks(query),
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
        garnish: i.garnish ?? false,
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
  activeLabel,
  wholeCatalog,
}: {
  userId: string;
  activeLabel: string;
  /** The provider hands over everything at once, so the shelf is matched locally. */
  wholeCatalog: boolean;
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

  // Counted from what Discover shows, not from the whole cache: drinks saved
  // from a provider you have since switched away from are not shown, so a
  // cache holding only those still means nothing has been checked yet.
  if (result.considered === 0) {
    return (
      <EmptyState
        icon={<SparkIcon className="size-12" />}
        title="Ready when you are"
        body={`Barback will ask ${activeLabel} which cocktails your shelf can cover, then keep the answers locally so this page works offline afterwards.`}
        action={<ScanButton label={`Check ${activeLabel} now`} providerLabel={activeLabel} />}
      />
    );
  }

  return (
    <div className="space-y-8">
      <section id="makeable" className="scroll-mt-6 space-y-3">
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
        {wholeCatalog ? (
          <>
            <h2 className="text-sm font-medium text-bar-300">Want the latest recipes?</h2>
            <p className="text-xs text-bar-400">
              Barback keeps all of {activeLabel}&rsquo;s cocktails, so a changed shelf is
              matched straight away. Check again to pick up any they have added since.
            </p>
          </>
        ) : (
          <>
            <h2 className="text-sm font-medium text-bar-300">Shelf changed?</h2>
            <p className="text-xs text-bar-400">
              Run another lookup to pick up cocktails your newer ingredients unlock.
            </p>
          </>
        )}
        <ScanButton
          label={`Check ${activeLabel} again`}
          providerLabel={activeLabel}
          variant="secondary"
        />
      </section>
    </div>
  );
}
