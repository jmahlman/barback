import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { IngredientRow } from "@/components/ingredient-row";
import { AppShell, PageBody, PageHeader } from "@/components/app-shell";
import { MakeableBadge } from "@/components/recipe-card";
import {
  AddMissingButton,
  DeleteRecipeButton,
  FavoriteButton,
  RatingControl,
} from "@/components/recipe-detail-actions";
import { ReviewNotes } from "@/components/review-notes";
import { GlassIcon, PencilIcon } from "@/components/icons";
import { db } from "@/lib/db";
import { methodLabel } from "@/lib/categories";
import { evaluateRecipe } from "@/lib/matching";
import { loadInventoryIndex } from "@/lib/recipe-queries";
import { requireUser } from "@/lib/session";
import { uploadUrl } from "@/lib/uploads";
import { MAX_DRINK_IMAGE_PX } from "@/lib/providers/images";
import { PhotoViewer } from "@/components/photo-viewer";

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

  // The page loads a display-sized copy; the full picture is fetched only if
  // someone opens it.
  const imageUrl = uploadUrl(recipe.imagePath, 640);
  const fullImageUrl = uploadUrl(recipe.imagePath);
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
          /* A photograph you took fills the width; a provider's square is
             shown at the size it actually is, since stretching 300px across a
             phone only makes it soft. */
          <div
            className="w-full"
            style={
              recipe.imageFromSource ? { maxWidth: MAX_DRINK_IMAGE_PX } : undefined
            }
          >
            <PhotoViewer
              src={imageUrl}
              fullSrc={fullImageUrl ?? imageUrl}
              alt={recipe.name}
              className={`w-full overflow-hidden rounded-[var(--radius-card)] border border-bar-800 bg-bar-900 ${
                recipe.imageFromSource ? "aspect-square" : "aspect-[4/3]"
              }`}
              sizes={
                recipe.imageFromSource
                  ? `${MAX_DRINK_IMAGE_PX}px`
                  : "(min-width: 768px) 640px, 100vw"
              }
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
            {evaluation.ingredients.map((ingredient, index) => (
              <IngredientRow
                // biome-ignore lint/suspicious/noArrayIndexKey: a recipe can list the same ingredient slug twice, so the position is part of what makes the key unique
                key={`${ingredient.slug}-${index}`}
                ingredient={ingredient}
                inventory={inventory}
              />
            ))}
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
            {recipe.imageFromSource && recipe.imagePath
              ? ", photograph and all — saved here, so it stays put. Add your own picture and this one makes way for it."
              : "."}
          </p>
        ) : null}

        <div className="border-t border-bar-800 pt-4">
          <DeleteRecipeButton id={recipe.id} name={recipe.name} />
        </div>
      </PageBody>
    </AppShell>
  );
}
