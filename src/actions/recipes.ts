"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { slugifyIngredient } from "@/lib/ingredients";
import {
  UploadError,
  deleteRecipeImage,
  saveGeneratedImage,
  saveRecipeImage,
} from "@/lib/uploads";
import { fetchDrinkArtwork } from "@/lib/providers/artwork";
import { getCachedDrink } from "@/lib/providers/cache";
import { getProvider, isProviderId } from "@/lib/providers/registry";
import type { ActionResult } from "@/actions/inventory";

export type { ActionResult };

const ingredientSchema = z.object({
  name: z.string().trim().min(1).max(120),
  amount: z.string().trim().max(40).optional(),
  unit: z.string().trim().max(24).optional(),
  optional: z.boolean().optional(),
  garnish: z.boolean().optional(),
  note: z.string().trim().max(200).optional(),
});

const recipeSchema = z.object({
  name: z.string().trim().min(1, "Every drink needs a name.").max(140),
  description: z.string().trim().max(500).optional(),
  instructions: z.string().trim().min(1, "Say how to make it.").max(5000),
  notes: z.string().trim().max(5000).optional(),
  glass: z.string().trim().max(80).optional(),
  method: z.string().trim().max(24).optional(),
  garnish: z.string().trim().max(160).optional(),
  rating: z.number().int().min(1).max(5).nullable(),
  isFavorite: z.boolean(),
  ingredients: z.array(ingredientSchema).min(1, "Add at least one ingredient."),
});

function flatten(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "form";
    out[key] ??= issue.message;
  }
  return out;
}

/** Make a URL-ish slug unique within this user's book. */
async function uniqueRecipeSlug(
  userId: string,
  name: string,
  ignoreId?: string,
): Promise<string> {
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "drink";

  for (let attempt = 0; ; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const clash = await db.recipe.findUnique({
      where: { userId_slug: { userId, slug: candidate } },
      select: { id: true },
    });
    if (!clash || clash.id === ignoreId) return candidate;
  }
}

function parseRecipe(formData: FormData) {
  const rawIngredients = formData.get("ingredients");
  let ingredients: unknown = [];
  if (typeof rawIngredients === "string" && rawIngredients) {
    try {
      ingredients = JSON.parse(rawIngredients);
    } catch {
      ingredients = [];
    }
  }

  const ratingRaw = formData.get("rating");
  const rating = ratingRaw && String(ratingRaw) !== "" ? Number(ratingRaw) : null;

  return recipeSchema.safeParse({
    name: formData.get("name") ?? "",
    description: formData.get("description") || undefined,
    instructions: formData.get("instructions") ?? "",
    notes: formData.get("notes") || undefined,
    glass: formData.get("glass") || undefined,
    method: formData.get("method") || undefined,
    garnish: formData.get("garnish") || undefined,
    rating: rating === null || Number.isNaN(rating) ? null : rating,
    isFavorite: formData.get("isFavorite") === "true",
    ingredients,
  });
}

function revalidateRecipes(id?: string) {
  revalidatePath("/recipes");
  revalidatePath("/");
  if (id) revalidatePath(`/recipes/${id}`);
}

export async function createRecipe(
  formData: FormData,
): Promise<ActionResult & { id?: string }> {
  const user = await requireUser();
  const parsed = parseRecipe(formData);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: flatten(parsed.error),
    };
  }

  const data = parsed.data;
  let imagePath: string | null = null;
  const image = formData.get("image");
  if (image instanceof File && image.size > 0) {
    try {
      imagePath = await saveRecipeImage(image);
    } catch (error) {
      const message =
        error instanceof UploadError ? error.message : "Could not save that image.";
      return { ok: false, fieldErrors: { image: message } };
    }
  }

  const slug = await uniqueRecipeSlug(user.id, data.name);

  const recipe = await db.recipe.create({
    data: {
      userId: user.id,
      name: data.name,
      slug,
      description: data.description || null,
      instructions: data.instructions,
      notes: data.notes || null,
      glass: data.glass || null,
      method: data.method || null,
      garnish: data.garnish || null,
      rating: data.rating,
      isFavorite: data.isFavorite,
      imagePath,
      ingredients: {
        create: data.ingredients.map((ingredient, index) => ({
          name: ingredient.name,
          slug: slugifyIngredient(ingredient.name),
          amount: ingredient.amount || null,
          unit: ingredient.unit || null,
          optional: ingredient.optional ?? false,
          garnish: ingredient.garnish ?? false,
          note: ingredient.note || null,
          position: index,
        })),
      },
    },
    select: { id: true },
  });

  revalidateRecipes(recipe.id);
  return { ok: true, id: recipe.id };
}

export async function updateRecipe(
  id: string,
  formData: FormData,
): Promise<ActionResult & { id?: string }> {
  const user = await requireUser();
  const existing = await db.recipe.findFirst({
    where: { id, userId: user.id },
    select: { id: true, imagePath: true, imageFromSource: true },
  });
  if (!existing) return { ok: false, error: "That recipe is no longer in your book." };

  const parsed = parseRecipe(formData);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: flatten(parsed.error),
    };
  }

  const data = parsed.data;
  let imagePath = existing.imagePath;
  const removeImage = formData.get("removeImage") === "true";
  const image = formData.get("image");

  // Once someone puts their own picture here — or takes one away — it is no
  // longer the provider's, so the credit line goes with it.
  let imageFromSource = existing.imageFromSource;

  if (image instanceof File && image.size > 0) {
    try {
      imagePath = await saveRecipeImage(image);
      await deleteRecipeImage(existing.imagePath);
      imageFromSource = false;
    } catch (error) {
      const message =
        error instanceof UploadError ? error.message : "Could not save that image.";
      return { ok: false, fieldErrors: { image: message } };
    }
  } else if (removeImage) {
    await deleteRecipeImage(existing.imagePath);
    imagePath = null;
    imageFromSource = false;
  }

  const slug = await uniqueRecipeSlug(user.id, data.name, id);

  // Ingredients are small and order matters, so replace them wholesale.
  await db.$transaction([
    db.recipeIngredient.deleteMany({ where: { recipeId: id } }),
    db.recipe.update({
      where: { id },
      data: {
        name: data.name,
        slug,
        description: data.description || null,
        instructions: data.instructions,
        notes: data.notes || null,
        glass: data.glass || null,
        method: data.method || null,
        garnish: data.garnish || null,
        rating: data.rating,
        isFavorite: data.isFavorite,
        imagePath,
        imageFromSource,
        ingredients: {
          create: data.ingredients.map((ingredient, index) => ({
            name: ingredient.name,
            slug: slugifyIngredient(ingredient.name),
            amount: ingredient.amount || null,
            unit: ingredient.unit || null,
            optional: ingredient.optional ?? false,
            garnish: ingredient.garnish ?? false,
            note: ingredient.note || null,
            position: index,
          })),
        },
      },
    }),
  ]);

  revalidateRecipes(id);
  return { ok: true, id };
}

export async function deleteRecipe(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const existing = await db.recipe.findFirst({
    where: { id, userId: user.id },
    select: { imagePath: true },
  });
  if (!existing) return { ok: false, error: "That recipe is already gone." };

  await db.recipe.delete({ where: { id } });
  await deleteRecipeImage(existing.imagePath);

  revalidateRecipes();
  return { ok: true };
}

export async function toggleFavorite(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const existing = await db.recipe.findFirst({
    where: { id, userId: user.id },
    select: { isFavorite: true },
  });
  if (!existing) return { ok: false, error: "That recipe is no longer in your book." };

  await db.recipe.update({
    where: { id },
    data: { isFavorite: !existing.isFavorite },
  });

  revalidateRecipes(id);
  return { ok: true };
}

export async function setRating(id: string, rating: number | null): Promise<ActionResult> {
  const user = await requireUser();
  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
    return { ok: false, error: "Ratings run from 1 to 5." };
  }

  const result = await db.recipe.updateMany({
    where: { id, userId: user.id },
    data: { rating },
  });
  if (result.count === 0) return { ok: false, error: "That recipe is no longer in your book." };

  revalidateRecipes(id);
  return { ok: true };
}

// --- Review notes ----------------------------------------------------------

const reviewSchema = z.object({
  body: z.string().trim().min(1, "Write a word or two.").max(2000),
  rating: z.number().int().min(1).max(5).nullable(),
  madeOn: z.string().trim().optional(),
});

export async function addReviewNote(
  recipeId: string,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const owned = await db.recipe.findFirst({
    where: { id: recipeId, userId: user.id },
    select: { id: true },
  });
  if (!owned) return { ok: false, error: "That recipe is no longer in your book." };

  const ratingRaw = formData.get("rating");
  const rating = ratingRaw && String(ratingRaw) !== "" ? Number(ratingRaw) : null;

  const parsed = reviewSchema.safeParse({
    body: formData.get("body") ?? "",
    rating: rating === null || Number.isNaN(rating) ? null : rating,
    madeOn: formData.get("madeOn") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: flatten(parsed.error) };
  }

  const madeOn = parsed.data.madeOn ? new Date(parsed.data.madeOn) : new Date();

  await db.reviewNote.create({
    data: {
      recipeId,
      userId: user.id,
      body: parsed.data.body,
      rating: parsed.data.rating,
      madeOn: Number.isNaN(madeOn.getTime()) ? new Date() : madeOn,
    },
  });

  revalidateRecipes(recipeId);
  return { ok: true };
}

export async function deleteReviewNote(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const note = await db.reviewNote.findFirst({
    where: { id, userId: user.id },
    select: { recipeId: true },
  });
  if (!note) return { ok: false, error: "That note is already gone." };

  await db.reviewNote.delete({ where: { id } });
  revalidateRecipes(note.recipeId);
  return { ok: true };
}

// --- Importing from TheCocktailDB -----------------------------------------

/**
 * Copy a provider's drink into the user's own book, preserving the upstream
 * measures and instructions verbatim and recording where it came from.
 *
 * Reads the cached copy first; only falls back to the network for providers
 * that can look a drink up by id.
 */
export async function importExternalRecipe(
  key: string,
): Promise<ActionResult & { id?: string }> {
  const user = await requireUser();

  const already = await db.recipe.findFirst({
    where: { userId: user.id, externalId: key },
    select: { id: true, name: true },
  });
  if (already) {
    return {
      ok: true,
      id: already.id,
      error: `"${already.name}" is already in your book.`,
    };
  }

  let drink = await getCachedDrink(key);

  if (!drink) {
    const separator = key.indexOf("~");
    const providerId = separator > 0 ? key.slice(0, separator) : "";
    const externalId = separator > 0 ? key.slice(separator + 1) : "";

    if (!isProviderId(providerId)) {
      return { ok: false, error: "Unknown provider for that drink." };
    }

    const provider = getProvider(providerId);
    if (!provider.capabilities.stableIds || !(await provider.isConfigured())) {
      return {
        ok: false,
        error: `That drink is not saved locally and ${provider.label} cannot fetch it by id. Search for it again first.`,
      };
    }

    drink = await provider.lookupById(externalId);
    if (!drink) {
      return { ok: false, error: `Could not reach ${provider.label} for that drink.` };
    }
  }

  const providerLabel = getProvider(drink.provider).label;
  const slug = await uniqueRecipeSlug(user.id, drink.name);

  const recipe = await db.recipe.create({
    data: {
      userId: user.id,
      name: drink.name,
      slug,
      description: [drink.category, drink.alcoholic].filter(Boolean).join(" \u00b7 ") || null,
      instructions: drink.instructions ?? "",
      glass: drink.glass,
      externalId: drink.key,
      sourceProvider: drink.provider,
      sourceName: providerLabel,
      sourceUrl: drink.sourceUrl,
      ingredients: {
        create: drink.ingredients.map((ingredient, index) => ({
          name: ingredient.name,
          slug: ingredient.slug,
          // Keep the measure exactly as published.
          amount: ingredient.measure,
          garnish: ingredient.garnish ?? false,
          position: index,
        })),
      },
    },
    select: { id: true },
  });

  // The picture comes after the recipe exists, so a provider that is slow,
  // unreachable or has reorganized its files costs you the photo and nothing
  // else. Imported artwork is re-encoded to at most MAX_DRINK_IMAGE_PX square
  // on the way in; uploads are served straight off disk without resizing.
  const artwork = await fetchDrinkArtwork(drink.thumbUrl);
  if (artwork) {
    let written: string | null = null;
    try {
      written = await saveGeneratedImage(artwork.data, artwork.extension);
      await db.recipe.update({
        where: { id: recipe.id },
        data: { imagePath: written, imageFromSource: true },
      });
    } catch (error) {
      // Take the file back out if the recipe never learned about it, so a
      // failure here does not leave something nothing points at.
      await deleteRecipeImage(written);
      // Keep the recipe; it simply has no photo. Logged rather than silent,
      // because a picture that never appears looks like nothing happened.
      console.warn(`[artwork] could not attach a photo to ${recipe.id}:`, error);
    }
  }

  revalidateRecipes(recipe.id);
  revalidatePath("/discover");
  return { ok: true, id: recipe.id };
}
