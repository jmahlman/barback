/**
 * Decides what you can actually make from what is on your shelf.
 */
import {
  findMatch,
  PANTRY_STAPLES,
  type IngredientMatch,
  type MatchKind,
} from "@/lib/ingredients";

export interface RequiredIngredient {
  name: string;
  slug: string;
  /** Display measure, e.g. "2 oz". */
  measure?: string | null;
  optional?: boolean;
  garnish?: boolean;
}

export interface EvaluatedIngredient extends RequiredIngredient {
  /** How it was satisfied, or null if you are missing it. */
  match: IngredientMatch | null;
  /** True when it is assumed on hand (ice, water) rather than matched. */
  assumed: boolean;
}

export interface RecipeEvaluation {
  ingredients: EvaluatedIngredient[];
  /** Everything required is covered. */
  makeable: boolean;
  /** Required ingredients you do not have. */
  missing: EvaluatedIngredient[];
  /** Optional/garnish ingredients you do not have. */
  missingOptional: EvaluatedIngredient[];
  /** Covered by a stand-in rather than the real thing. */
  substitutions: EvaluatedIngredient[];
  /** 0-1 share of required ingredients covered. Ties broken by exactness. */
  score: number;
}

export interface InventoryIndex {
  slugs: Set<string>;
  /** slug -> display name, for explaining a match. */
  names: Map<string, string>;
}

export function buildInventoryIndex(
  items: { slug: string; name: string; inStock: boolean }[],
): InventoryIndex {
  const slugs = new Set<string>();
  const names = new Map<string, string>();
  for (const item of items) {
    if (!item.inStock || !item.slug) continue;
    slugs.add(item.slug);
    if (!names.has(item.slug)) names.set(item.slug, item.name);
  }
  return { slugs, names };
}

const KIND_WEIGHT: Record<MatchKind, number> = {
  exact: 1,
  family: 1,
  partial: 0.95,
  substitute: 0.7,
};

export function evaluateRecipe(
  required: RequiredIngredient[],
  inventory: InventoryIndex,
  options: { assumeStaples?: boolean } = {},
): RecipeEvaluation {
  const assumeStaples = options.assumeStaples ?? true;

  const ingredients: EvaluatedIngredient[] = required.map((ingredient) => {
    const isStaple = assumeStaples && PANTRY_STAPLES.has(ingredient.slug);
    const match = ingredient.slug ? findMatch(ingredient.slug, inventory.slugs) : null;
    return {
      ...ingredient,
      match,
      assumed: Boolean(isStaple && !match),
    };
  });

  const isRequired = (i: EvaluatedIngredient) => !i.optional && !i.garnish;
  const satisfied = (i: EvaluatedIngredient) => Boolean(i.match) || i.assumed;

  const requiredItems = ingredients.filter(isRequired);
  const missing = requiredItems.filter((i) => !satisfied(i));
  const missingOptional = ingredients.filter((i) => !isRequired(i) && !satisfied(i));
  const substitutions = ingredients.filter((i) => i.match?.kind === "substitute");

  const totalWeight = requiredItems.length;
  const earned = requiredItems.reduce((sum, i) => {
    if (i.assumed) return sum + 1;
    if (!i.match) return sum;
    return sum + KIND_WEIGHT[i.match.kind];
  }, 0);

  return {
    ingredients,
    makeable: missing.length === 0 && requiredItems.length > 0,
    missing,
    missingOptional,
    substitutions,
    score: totalWeight === 0 ? 0 : earned / totalWeight,
  };
}

export interface Rankable<T> {
  item: T;
  evaluation: RecipeEvaluation;
}

/**
 * Sort by makeability: drinks you can make first, then by how close you are,
 * then alphabetically for a stable order.
 */
export function rankByMakeability<T>(
  entries: Rankable<T>[],
  nameOf: (item: T) => string,
): Rankable<T>[] {
  return [...entries].sort((a, b) => {
    if (a.evaluation.makeable !== b.evaluation.makeable) {
      return a.evaluation.makeable ? -1 : 1;
    }
    if (a.evaluation.missing.length !== b.evaluation.missing.length) {
      return a.evaluation.missing.length - b.evaluation.missing.length;
    }
    if (Math.abs(a.evaluation.score - b.evaluation.score) > 0.001) {
      return b.evaluation.score - a.evaluation.score;
    }
    return nameOf(a.item).localeCompare(nameOf(b.item));
  });
}

/**
 * Which single purchases would unlock the most drinks?
 * Looks at everything you are exactly one ingredient short of.
 */
export function shoppingSuggestions<T>(
  entries: Rankable<T>[],
  limit = 6,
): { slug: string; name: string; unlocks: number }[] {
  const counts = new Map<string, { name: string; unlocks: number }>();

  for (const entry of entries) {
    if (entry.evaluation.missing.length !== 1) continue;
    const gap = entry.evaluation.missing[0];
    if (!gap.slug) continue;
    const existing = counts.get(gap.slug);
    if (existing) {
      existing.unlocks += 1;
    } else {
      counts.set(gap.slug, { name: gap.name, unlocks: 1 });
    }
  }

  return [...counts.entries()]
    .map(([slug, value]) => ({ slug, ...value }))
    .sort((a, b) => b.unlocks - a.unlocks || a.name.localeCompare(b.name))
    .slice(0, limit);
}
