import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AppShell, PageBody, PageHeader } from "@/components/app-shell";
import { RecipeForm } from "@/components/recipe-form";
import { updateRecipe } from "@/actions/recipes";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { uploadUrl } from "@/lib/uploads";

export const metadata: Metadata = { title: "Edit recipe" };

export default async function EditRecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const recipe = await db.recipe.findFirst({
    where: { id, userId: user.id },
    include: { ingredients: { orderBy: { position: "asc" } } },
  });
  if (!recipe) notFound();

  return (
    <AppShell user={user}>
      <PageHeader title="Edit recipe" subtitle={recipe.name} />
      <PageBody>
        <RecipeForm
          initial={{
            name: recipe.name,
            description: recipe.description,
            instructions: recipe.instructions,
            notes: recipe.notes,
            glass: recipe.glass,
            method: recipe.method,
            garnish: recipe.garnish,
            rating: recipe.rating,
            isFavorite: recipe.isFavorite,
            // The form shows a 96px preview, not the whole picture.
            imageUrl: uploadUrl(recipe.imagePath, 160),
            ingredients: recipe.ingredients.map((i) => ({
              name: i.name,
              amount: [i.amount, i.unit].filter(Boolean).join(" ") || null,
              optional: i.optional,
              garnish: i.garnish,
            })),
          }}
          action={updateRecipe.bind(null, recipe.id)}
          submitLabel="Save changes"
          cancelHref={`/recipes/${recipe.id}`}
        />
      </PageBody>
    </AppShell>
  );
}
