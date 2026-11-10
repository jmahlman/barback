import type { Metadata } from "next";
import { AppShell, PageBody, PageHeader } from "@/components/app-shell";
import { MakeableBadge } from "@/components/recipe-card";
import { ImportButton } from "@/components/import-button";
import { AddMissingButton } from "@/components/recipe-detail-actions";
import { EmptyState } from "@/components/empty-state";
import { FetchDrinkButton } from "@/components/fetch-drink-button";
import { CheckIcon, GlassIcon, SparkIcon, XIcon } from "@/components/icons";
import { drinkImage, drinkImageFullPx, MAX_DRINK_IMAGE_PX } from "@/lib/providers/images";
import { getCachedDrink } from "@/lib/providers/cache";
import { getProvider } from "@/lib/providers/registry";
import { parseDrinkKey } from "@/lib/providers/types";
import { evaluateRecipe } from "@/lib/matching";
import { loadInventoryIndex } from "@/lib/recipe-queries";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PhotoViewer } from "@/components/photo-viewer";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  // Cache-only: generating a title must never trigger an API call.
  const drink = await getCachedDrink(id);
  return { title: drink?.name ?? "Cocktail" };
}

export default async function DiscoverDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const parsed = parseDrinkKey(id);
  const provider = parsed ? getProvider(parsed.provider) : null;
  const providerLabel = provider?.label ?? "the provider";
  const attribution = provider?.attribution ?? "";

  const [drink, inventory, saved] = await Promise.all([
    getCachedDrink(id),
    loadInventoryIndex(user.id),
    db.recipe.findFirst({
      where: { userId: user.id, externalId: id },
      select: { id: true },
    }),
  ]);

  if (!drink) {
    return (
      <AppShell user={user}>
        <PageHeader title="Cocktail" />
        <PageBody>
          <EmptyState
            icon={<SparkIcon className="size-12" />}
            title="Not saved locally"
            body={`Barback has not saved this drink yet. Nothing is requested from ${providerLabel} until you ask for it.`}
            action={
              provider?.capabilities.stableIds ? (
                <FetchDrinkButton
                  drinkKey={id}
                  providerLabel={provider?.label ?? "the provider"}
                />
              ) : null
            }
          />
          <p className="text-xs text-bar-400">{attribution}</p>
        </PageBody>
      </AppShell>
    );
  }

  const evaluation = evaluateRecipe(
    drink.ingredients.map((i) => ({
      name: i.name,
      slug: i.slug,
      measure: i.measure,
      garnish: i.garnish ?? false,
    })),
    inventory,
  );

  const image = drinkImage(drink.thumbUrl);
  // Enlarging is an explicit request, so it gets the provider's original
  // rather than the capped copy the page draws.
  const fullImage = drink.thumbUrl?.trim() || image;
  const fullPx = drinkImageFullPx(drink.thumbUrl);
  const missingNames = evaluation.missing.map((m) => m.name);

  return (
    <AppShell user={user}>
      <PageHeader
        title={drink.name}
        subtitle={[drink.category, drink.alcoholic].filter(Boolean).join(" · ") || undefined}
      />
      <PageBody>
        {/* Capped rather than full-bleed: provider artwork is a decorative
            square, and at full width it pushed the recipe itself off the
            screen on a phone. */}
        {image ? (
          <div className="w-full" style={{ maxWidth: MAX_DRINK_IMAGE_PX }}>
            <PhotoViewer
              src={image}
              fullSrc={fullImage ?? image}
              alt={drink.name}
              className="aspect-square w-full overflow-hidden rounded-[var(--radius-card)] border border-bar-800 bg-bar-900"
              sizes={`${MAX_DRINK_IMAGE_PX}px`}
              // Let Next fetch and re-serve the provider's picture, so the
              // browser never talks to them directly.
              unoptimized={false}
              // Both numbers are needed: one decides which variant is
              // fetched, the other how large it is allowed to be drawn.
              fullSizes={`(min-width: 768px) ${fullPx}px, 100vw`}
              fullMaxPx={fullPx}
              priority
            />
          </div>
        ) : null}

        <MakeableBadge evaluation={evaluation} />

        <ImportButton drinkKey={drink.key} imported={Boolean(saved)} />

        {drink.glass ? (
          <div className="flex flex-wrap gap-2">
            <span className="chip">
              <GlassIcon className="size-3.5" />
              {drink.glass}
            </span>
          </div>
        ) : null}

        <section className="space-y-3">
          <h2 className="font-display text-xl text-bar-200">Ingredients</h2>
          <ul className="card divide-y divide-bar-800 overflow-hidden">
            {evaluation.ingredients.map((ingredient, index) => {
              const have = Boolean(ingredient.match) || ingredient.assumed;
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: a recipe can list the same ingredient slug twice, so the position is part of what makes the key unique
                <li key={`${ingredient.slug}-${index}`} className="flex items-center gap-3 p-3">
                  <span
                    aria-hidden
                    className={`flex size-7 shrink-0 items-center justify-center rounded-md ${
                      have ? "bg-citrus-400/15 text-citrus-400" : "bg-cherry-400/15 text-cherry-400"
                    }`}
                  >
                    {have ? <CheckIcon className="size-4" /> : <XIcon className="size-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-bar-200">
                      {ingredient.measure ? (
                        <span className="font-medium text-brass-300">{ingredient.measure} </span>
                      ) : null}
                      {ingredient.name}
                    </p>
                    {ingredient.match && ingredient.match.kind !== "exact" ? (
                      <p className="text-xs text-bar-400">
                        {ingredient.match.kind === "substitute" ? "Using" : "Covered by"}{" "}
                        {inventory.names.get(ingredient.match.inventorySlug) ??
                          ingredient.match.inventorySlug}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>

          {missingNames.length > 0 ? <AddMissingButton names={missingNames} /> : null}
        </section>

        {drink.instructions ? (
          <section className="space-y-2">
            <h2 className="font-display text-xl text-bar-200">Method</h2>
            <div className="card p-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-bar-200">
                {drink.instructions}
              </p>
            </div>
          </section>
        ) : null}

        <p className="border-t border-bar-800 pt-4 text-xs text-bar-400">
          {attribution}
          {drink.sourceUrl ? (
            <>
              {" · "}
              <a
                href={drink.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="text-brass-300 underline-offset-4 hover:underline"
              >
                View on {providerLabel}
              </a>
            </>
          ) : null}
        </p>
      </PageBody>
    </AppShell>
  );
}
