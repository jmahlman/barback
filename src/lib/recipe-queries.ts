import { db } from "@/lib/db";
import { buildInventoryIndex, evaluateRecipe, type RecipeEvaluation } from "@/lib/matching";
import { uploadUrl } from "@/lib/uploads";

/** Inventory index for a user, ready for matching. */
export async function loadInventoryIndex(userId: string) {
  const items = await db.inventoryItem.findMany({
    where: { userId },
    select: { slug: true, name: true, inStock: true, category: true },
  });
  return buildInventoryIndex(items);
}

export interface RecipeListEntry {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  rating: number | null;
  isFavorite: boolean;
  ingredientCount: number;
  sourceName: string | null;
  evaluation: RecipeEvaluation;
}

/** Every recipe in a user's book, each evaluated against their inventory. */
export async function loadRecipesWithMakeability(userId: string): Promise<RecipeListEntry[]> {
  const [recipes, inventory] = await Promise.all([
    db.recipe.findMany({
      where: { userId },
      orderBy: [{ isFavorite: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        description: true,
        imagePath: true,
        rating: true,
        isFavorite: true,
        sourceName: true,
        ingredients: {
          orderBy: { position: "asc" },
          select: {
            name: true,
            slug: true,
            amount: true,
            unit: true,
            optional: true,
            garnish: true,
          },
        },
      },
    }),
    loadInventoryIndex(userId),
  ]);

  return recipes.map((recipe) => ({
    id: recipe.id,
    name: recipe.name,
    description: recipe.description,
    // Cards draw an 80px square, so they are served a 160px copy rather than
    // the whole photograph.
    imageUrl: uploadUrl(recipe.imagePath, 160),
    rating: recipe.rating,
    isFavorite: recipe.isFavorite,
    ingredientCount: recipe.ingredients.length,
    sourceName: recipe.sourceName,
    evaluation: evaluateRecipe(
      recipe.ingredients.map((i) => ({
        name: i.name,
        slug: i.slug,
        measure: [i.amount, i.unit].filter(Boolean).join(" ") || null,
        optional: i.optional,
        garnish: i.garnish,
      })),
      inventory,
    ),
  }));
}
