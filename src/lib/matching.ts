/**
 * Decides what you can actually make from what is on your shelf.
 */
import {
  findMatch,
  PANTRY_STAPLES,
  SUBSTITUTION_GROUPS,
  type IngredientMatch,
  type MatchKind,
  type SubstitutionGroupId,
} from "@/lib/ingredients";

/**
 * The matching rules an administrator can switch in Settings. The rest
 * (brand names, families, partial names) are always on: without them Barback
 * could not tell that a bottle of Beefeater is gin.
 */
export interface MatchingRules {
  /** Stand-in groups that are switched on. */
  substitutions: ReadonlySet<SubstitutionGroupId>;
  /** A missing garnish never stops a drink. */
  garnishesOptional: boolean;
  /** Ice, water, salt and pepper count as on hand. */
  assumeStaples: boolean;
}

/** How Barback matched before any of this could be changed. */
export const DEFAULT_RULES: MatchingRules = {
  substitutions: new Set(SUBSTITUTION_GROUPS.map((group) => group.id)),
  garnishesOptional: true,
  assumeStaples: true,
};

/** Why something counts as missing, when a rule that is switched off is the reason. */
export type BlockedBy =
  /** A stand-in on the shelf would count if its group were on. */
  | { rule: "substitution"; group: SubstitutionGroupId; inventorySlug: string }
  /** A pantry staple, and staples are not being assumed. */
  | { rule: "staples" }
  /** A garnish, and garnishes are counting. */
  | { rule: "garnish" };

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
  /** Set when it is missing because of a rule that is switched off. */
  blockedBy: BlockedBy | null;
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
  /**
   * Slugs shelved as fresh produce or garnishes: the whole fruit rather than
   * a bottle of its juice. A lime and a carton of lime juice are recorded
   * under the same slug, so the shelf is the only thing that tells them
   * apart — and a lemon peel can only come off the former.
   */
  fresh: Set<string>;
  /** The rules to match by. Carried here so every page that loads a shelf
   * gets them, without each one having to remember to. */
  rules: MatchingRules;
}

/** Shelves that hold the thing itself rather than something poured from it. */
const WHOLE_INGREDIENT_SHELVES: ReadonlySet<string> = new Set(["fresh", "garnish"]);

export function buildInventoryIndex(
  items: { slug: string; name: string; inStock: boolean; category?: string | null }[],
  rules: MatchingRules = DEFAULT_RULES,
): InventoryIndex {
  const slugs = new Set<string>();
  const names = new Map<string, string>();
  const fresh = new Set<string>();
  for (const item of items) {
    if (!item.inStock || !item.slug) continue;
    slugs.add(item.slug);
    if (!names.has(item.slug)) names.set(item.slug, item.name);
    if (item.category && WHOLE_INGREDIENT_SHELVES.has(item.category)) {
      fresh.add(item.slug);
    }
  }
  return { slugs, names, fresh, rules };
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
  /** Overrides for the shelf's own rules, mostly for tests. */
  overrides: Partial<MatchingRules> = {},
): RecipeEvaluation {
  const rules: MatchingRules = { ...(inventory.rules ?? DEFAULT_RULES), ...overrides };
  const options = { substitutions: rules.substitutions };

  const ingredients: EvaluatedIngredient[] = required.map((ingredient) => {
    const slug = ingredient.slug;
    const isStaple = PANTRY_STAPLES.has(slug);
    // A staple is matched only by itself. Otherwise "water" finds "tonic
    // water" by name and the page says the tonic covers it.
    const match = !slug
      ? null
      : isStaple
        ? inventory.slugs.has(slug)
          ? { kind: "exact" as const, inventorySlug: slug }
          : null
        : findMatch(slug, inventory.slugs, inventory.fresh, options);
    const assumed = Boolean(isStaple && !match && rules.assumeStaples);

    let blockedBy: BlockedBy | null = null;
    if (!match && !assumed && slug) {
      // Would a stand-in that is switched off have counted?
      const withAll = isStaple ? null : findMatch(slug, inventory.slugs, inventory.fresh);
      if (withAll?.kind === "substitute" && withAll.group) {
        blockedBy = {
          rule: "substitution",
          group: withAll.group,
          inventorySlug: withAll.inventorySlug,
        };
      } else if (isStaple) {
        blockedBy = { rule: "staples" };
      } else if (ingredient.garnish && !rules.garnishesOptional) {
        blockedBy = { rule: "garnish" };
      }
    }

    return { ...ingredient, match, assumed, blockedBy };
  });

  const isRequired = (i: EvaluatedIngredient) =>
    !i.optional && !(i.garnish && rules.garnishesOptional);
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
