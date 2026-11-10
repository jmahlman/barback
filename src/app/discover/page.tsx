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
import { lookupProvider, PROVIDER_LIST, providerChain } from "@/lib/providers/registry";
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

  // Which provider a lookup button would actually reach. Usually the
  // preferred one; another when it has no key and fallback is on; none at
  // all when nothing in the chain is configured.
  const asker = await lookupProvider(chain);
  const lookupLabel = asker?.label ?? null;
  const preferredReady = Boolean(asker && asker.id === chain[0]?.id);

  return (
    <AppShell user={user}>
      <PageHeader
        title="Discover"
        subtitle={
          query
            ? `Saved cocktails matching “${query}”`
            : `Cocktails from ${preferredReady ? activeLabel : (lookupLabel ?? activeLabel)}, matched to your shelf.`
        }
      />
      <PageBody>
        {!preferredReady ? (
          <MissingKeyNotice
            preferredLabel={activeLabel}
            fallbackLabel={lookupLabel}
            isAdmin={user.role === "admin"}
          />
        ) : null}

        <DiscoverSearchForm defaultQuery={query} providerLabel={lookupLabel} />

        {query ? (
          <CachedSearchResults userId={user.id} query={query} lookupLabel={lookupLabel} />
        ) : (
          <FromYourShelf
            userId={user.id}
            lookupLabel={lookupLabel}
            wholeCatalog={asker?.capabilities.catalog ?? false}
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

/**
 * The preferred provider has no key. Said before anything is pressed, since
 * otherwise the only sign is an error after a lookup that could never work.
 */
function MissingKeyNotice({
  preferredLabel,
  fallbackLabel,
  isAdmin,
}: {
  preferredLabel: string;
  /** Who lookups go to instead, when fallback found someone. */
  fallbackLabel: string | null;
  isAdmin: boolean;
}) {
  return (
    <div className="card space-y-1 border-brass-400/40 p-4 text-sm">
      <p className="text-bar-200">
        {fallbackLabel
          ? `${preferredLabel} has no API key, so lookups go to ${fallbackLabel} until you add one.`
          : `${preferredLabel} needs an API key before Barback can look anything up.`}
      </p>
      <p className="text-xs text-bar-400">
        {isAdmin ? (
          <>
            Add one, or choose a provider that needs none, in{" "}
            <Link
              href="/settings#cocktail-data"
              className="text-brass-300 underline-offset-4 hover:underline"
            >
              Settings → Cocktail data
            </Link>
            . Cocktails already saved still work.
          </>
        ) : (
          "Whoever runs this Barback can add one in Settings. Cocktails already saved still work."
        )}
      </p>
    </div>
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
  lookupLabel,
}: {
  userId: string;
  query: string;
  lookupLabel: string | null;
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
        body={
          lookupLabel
            ? `Nothing saved matches “${query}”. Use the lookup link above to ask ${lookupLabel} — that is the only thing that calls the API.`
            : `Nothing saved matches “${query}”.`
        }
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
  lookupLabel,
  wholeCatalog,
}: {
  userId: string;
  /** The provider a lookup would reach, or null when none can be asked. */
  lookupLabel: string | null;
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
    // The notice above already says why; no button that can only fail.
    if (!lookupLabel) {
      return (
        <EmptyState
          icon={<SparkIcon className="size-12" />}
          title="Nothing to check yet"
          body="Once a cocktail provider is set up, Barback can find what your shelf can make."
        />
      );
    }
    return (
      <EmptyState
        icon={<SparkIcon className="size-12" />}
        title="Ready when you are"
        body={`Barback will ask ${lookupLabel} which cocktails your shelf can cover, then keep the answers locally so this page works offline afterwards.`}
        action={<ScanButton label={`Check ${lookupLabel} now`} providerLabel={lookupLabel} />}
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

      {lookupLabel ? (
        <section className="card space-y-2 p-4">
          {wholeCatalog ? (
            <>
              <h2 className="text-sm font-medium text-bar-300">Want the latest recipes?</h2>
              <p className="text-xs text-bar-400">
                Barback keeps all of {lookupLabel}&rsquo;s cocktails, so a changed shelf is
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
            label={`Check ${lookupLabel} again`}
            providerLabel={lookupLabel}
            variant="secondary"
          />
        </section>
      ) : null}
    </div>
  );
}
