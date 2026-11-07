import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AppShell, PageBody, PageHeader } from "@/components/app-shell";
import { MakeableBadge } from "@/components/recipe-card";
import {
  AddMissingButton,
  DeleteRecipeButton,
  FavoriteButton,
  RatingControl,
} from "@/components/recipe-detail-actions";
import { ReviewNotes } from "@/components/review-notes";
import { CheckIcon, GlassIcon, PencilIcon, XIcon } from "@/components/icons";
import { db } from "@/lib/db";
import { methodLabel } from "@/lib/categories";
import { evaluateRecipe } from "@/lib/matching";
import { loadInventoryIndex } from "@/lib/recipe-queries";
import { requireUser } from "@/lib/session";
import { uploadUrl } from "@/lib/uploads";

async function loadRecipe(userId: string, id: string) {
  return db.recipe.findFirst({
    where: { id, userId },
    include: {
      ingredients: { orderBy: { position: "asc" } },
      reviewNotes: { orderBy: { madeOn: "desc" } },
    },
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const user = await requireUser();
  const { id } = await params;
  const recipe = await db.recipe.findFirst({
    where: { id, userId: user.id },
    select: { name: true },
  });
  return { title: recipe?.name ?? "Recipe" };
}

export default async function RecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const [recipe, inventory] = await Promise.all([
    loadRecipe(user.id, id),
    loadInventoryIndex(user.id),
  ]);
  if (!recipe) notFound();

  const evaluation = evaluateRecipe(
    recipe.ingredients.map((i) => ({
      name: i.name,
      slug: i.slug,
      measure: [i.amount, i.unit].filter(Boolean).join(" ") || null,
      optional: i.optional,
      garnish: i.garnish,
    })),
    inventory,
  );

  const imageUrl = uploadUrl(recipe.imagePath);
  const missingNames = [...evaluation.missing, ...evaluation.missingOptional].map((m) => m.name);

  return (
    <AppShell user={user}>
      <PageHeader
        title={recipe.name}
        subtitle={recipe.description ?? undefined}
        action={
          <div className="flex gap-2">
            <FavoriteButton id={recipe.id} isFavorite={recipe.isFavorite} />
            <Link
              href={`/recipes/${recipe.id}/edit`}
              aria-label="Edit recipe"
              className="btn-secondary size-11 p-0"
            >
              <PencilIcon className="size-5" />
            </Link>
          </div>
        }
      />

      <PageBody>
        {imageUrl ? (
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[var(--radius-card)] border border-bar-800 bg-bar-900">
            <Image
              src={imageUrl}
              alt={recipe.name}
              fill
              sizes="(min-width: 768px) 640px, 100vw"
              className="object-cover"
              unoptimized
              priority
            />
          </div>
        ) : null}

        <MakeableBadge evaluation={evaluation} />

        {/* Facts */}
        <div className="flex flex-wrap gap-2">
          {recipe.method ? <span className="chip">{methodLabel(recipe.method)}</span> : null}
          {recipe.glass ? (
            <span className="chip">
              <GlassIcon className="size-3.5" />
              {recipe.glass}
            </span>
          ) : null}
          {recipe.garnish ? <span className="chip">Garnish: {recipe.garnish}</span> : null}
        </div>

        {/* Ingredients */}
        <section className="space-y-3">
          <h2 className="font-display text-xl text-bar-200">Ingredients</h2>
          <ul className="card divide-y divide-bar-800 overflow-hidden">
            {evaluation.ingredients.map((ingredient, index) => {
              const have = Boolean(ingredient.match) || ingredient.assumed;
              return (
                <li key={`${ingredient.slug}-${index}`} className="flex items-center gap-3 p-3">
                  <span
                    aria-hidden
                    className={`flex size-7 shrink-0 items-center justify-center rounded-md ${
                      have
                        ? "bg-citrus-400/15 text-citrus-400"
                        : ingredient.optional || ingredient.garnish
                          ? "bg-bar-800 text-bar-600"
                          : "bg-cherry-400/15 text-cherry-400"
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
                      {ingredient.optional ? (
                        <span className="text-xs text-bar-400"> (optional)</span>
                      ) : null}
                      {ingredient.garnish ? (
                        <span className="text-xs text-bar-400"> (garnish)</span>
                      ) : null}
                    </p>
                    <p className="text-xs text-bar-400">
                      {ingredient.assumed
                        ? "Assumed on hand"
                        : ingredient.match
                          ? ingredient.match.kind === "exact"
                            ? "In your inventory"
                            : ingredient.match.kind === "substitute"
                              ? `Using ${inventory.names.get(ingredient.match.inventorySlug) ?? ingredient.match.inventorySlug} instead`
                              : `Covered by ${inventory.names.get(ingredient.match.inventorySlug) ?? ingredient.match.inventorySlug}`
                          : "Not in your inventory"}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>

          {missingNames.length > 0 ? <AddMissingButton names={missingNames} /> : null}
        </section>

        {/* Instructions */}
        <section className="space-y-2">
          <h2 className="font-display text-xl text-bar-200">Method</h2>
          <div className="card p-4">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-bar-200">
              {recipe.instructions}
            </p>
          </div>
        </section>

        {recipe.notes ? (
          <section className="space-y-2">
            <h2 className="font-display text-xl text-bar-200">Notes</h2>
            <div className="card p-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-bar-300">
                {recipe.notes}
              </p>
            </div>
          </section>
        ) : null}

        <section className="card space-y-2 p-4">
          <h2 className="text-sm font-medium text-bar-300">Your rating</h2>
          <RatingControl id={recipe.id} rating={recipe.rating} />
        </section>

        <ReviewNotes
          recipeId={recipe.id}
          notes={recipe.reviewNotes.map((note) => ({
            id: note.id,
            body: note.body,
            rating: note.rating,
            madeOn: note.madeOn.toISOString(),
          }))}
        />

        {recipe.sourceUrl ? (
          <p className="text-xs text-bar-400">
            Imported from{" "}
            <a
              href={recipe.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="text-brass-300 underline-offset-4 hover:underline"
            >
              {recipe.sourceName ?? "the source"}
            </a>
            .
          </p>
        ) : null}

        <div className="border-t border-bar-800 pt-4">
          <DeleteRecipeButton id={recipe.id} name={recipe.name} />
        </div>
      </PageBody>
    </AppShell>
  );
}
