"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { slugifyIngredient } from "@/lib/ingredients";
import { CATEGORY_SLUGS } from "@/lib/categories";

export interface ActionResult {
  ok: boolean;
  error?: string;
  /** Field-level messages, keyed by input name. */
  fieldErrors?: Record<string, string>;
}

const itemSchema = z.object({
  name: z.string().trim().min(1, "Give it a name.").max(120),
  category: z.enum(CATEGORY_SLUGS as [string, ...string[]]).default("other"),
  brand: z.string().trim().max(120).optional().or(z.literal("")),
  quantity: z.string().trim().max(60).optional().or(z.literal("")),
  abv: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v) : null))
    .refine((v) => v === null || (!Number.isNaN(v) && v >= 0 && v <= 100), {
      message: "ABV must be between 0 and 100.",
    }),
  upc: z.string().trim().max(32).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  /**
   * Optional override for the match key. Most people never touch this, but it
   * is the escape hatch when "Uncle Pete's Mystery Amaro" should match "amaro".
   */
  matchAs: z.string().trim().max(120).optional().or(z.literal("")),
});

function flatten(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

function parse(formData: FormData) {
  return itemSchema.safeParse({
    name: formData.get("name") ?? "",
    category: formData.get("category") || "other",
    brand: formData.get("brand") ?? "",
    quantity: formData.get("quantity") ?? "",
    abv: formData.get("abv") ?? "",
    upc: formData.get("upc") ?? "",
    notes: formData.get("notes") ?? "",
    matchAs: formData.get("matchAs") ?? "",
  });
}

export async function createInventoryItem(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = parse(formData);
  if (!parsed.success) {
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: flatten(parsed.error) };
  }

  const data = parsed.data;
  const slug = slugifyIngredient(data.matchAs || data.name);
  if (!slug) {
    return { ok: false, fieldErrors: { name: "That name has nothing to match on." } };
  }

  const existing = await db.inventoryItem.findUnique({
    where: { userId_slug: { userId: user.id, slug } },
  });

  if (existing) {
    // Re-adding something you already track just puts it back in stock.
    await db.inventoryItem.update({
      where: { id: existing.id },
      data: {
        inStock: true,
        name: data.name,
        category: data.category,
        // A scan that lands on a bottle added by hand teaches it its barcode,
        // so the next scan of it never has to leave the building. An existing
        // barcode wins: it was either scanned off the bottle or typed in
        // deliberately.
        upc: existing.upc ?? (data.upc || null),
      },
    });
    revalidatePath("/inventory");
    revalidatePath("/");
    revalidatePath("/discover");
    return { ok: true, error: `You already track "${existing.name}" — marked it back in stock.` };
  }

  await db.inventoryItem.create({
    data: {
      userId: user.id,
      name: data.name,
      slug,
      category: data.category,
      brand: data.brand || null,
      quantity: data.quantity || null,
      abv: data.abv,
      upc: data.upc || null,
      notes: data.notes || null,
      inStock: true,
    },
  });

  revalidatePath("/inventory");
  revalidatePath("/");
  revalidatePath("/discover");
  revalidatePath("/recipes");
  return { ok: true };
}

export async function updateInventoryItem(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = parse(formData);
  if (!parsed.success) {
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: flatten(parsed.error) };
  }

  const owned = await db.inventoryItem.findFirst({ where: { id, userId: user.id } });
  if (!owned) return { ok: false, error: "That item is no longer in your inventory." };

  const data = parsed.data;
  const slug = slugifyIngredient(data.matchAs || data.name);
  if (!slug) {
    return { ok: false, fieldErrors: { name: "That name has nothing to match on." } };
  }

  // Renaming into another item's match key would break the per-user unique index.
  if (slug !== owned.slug) {
    const clash = await db.inventoryItem.findUnique({
      where: { userId_slug: { userId: user.id, slug } },
    });
    if (clash) {
      return {
        ok: false,
        fieldErrors: { name: `That would collide with "${clash.name}".` },
      };
    }
  }

  await db.inventoryItem.update({
    where: { id },
    data: {
      name: data.name,
      slug,
      category: data.category,
      brand: data.brand || null,
      quantity: data.quantity || null,
      abv: data.abv,
      upc: data.upc || null,
      notes: data.notes || null,
    },
  });

  revalidatePath("/inventory");
  revalidatePath("/");
  revalidatePath("/discover");
  revalidatePath("/recipes");
  return { ok: true };
}

export async function setInStock(id: string, inStock: boolean): Promise<ActionResult> {
  const user = await requireUser();
  const result = await db.inventoryItem.updateMany({
    where: { id, userId: user.id },
    data: { inStock },
  });
  if (result.count === 0) return { ok: false, error: "That item is no longer in your inventory." };

  revalidatePath("/inventory");
  revalidatePath("/");
  revalidatePath("/discover");
  revalidatePath("/recipes");
  return { ok: true };
}

export async function deleteInventoryItem(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const result = await db.inventoryItem.deleteMany({ where: { id, userId: user.id } });
  if (result.count === 0) return { ok: false, error: "That item is already gone." };

  revalidatePath("/inventory");
  revalidatePath("/");
  revalidatePath("/discover");
  revalidatePath("/recipes");
  return { ok: true };
}

/**
 * Add several ingredients at once by name — used by "add the missing
 * ingredient" buttons on recipe pages.
 */
export async function quickAddIngredients(names: string[]): Promise<ActionResult> {
  const user = await requireUser();
  const cleaned = names.map((n) => n.trim()).filter(Boolean).slice(0, 25);
  if (cleaned.length === 0) return { ok: false, error: "Nothing to add." };

  for (const name of cleaned) {
    const slug = slugifyIngredient(name);
    if (!slug) continue;
    await db.inventoryItem.upsert({
      where: { userId_slug: { userId: user.id, slug } },
      create: { userId: user.id, name, slug, category: "other", inStock: true },
      update: { inStock: true },
    });
  }

  revalidatePath("/inventory");
  revalidatePath("/");
  revalidatePath("/discover");
  revalidatePath("/recipes");
  return { ok: true };
}
