/// The shelves of a home bar. `slug` is what we persist.
export const CATEGORIES = [
  { slug: "spirit", label: "Spirits", hint: "Gin, whiskey, rum, tequila, vodka" },
  { slug: "liqueur", label: "Liqueurs", hint: "Cointreau, Campari, amaretto, crème de cacao" },
  { slug: "vermouth", label: "Vermouth & Fortified", hint: "Sweet & dry vermouth, sherry, port" },
  { slug: "bitters", label: "Bitters", hint: "Angostura, Peychaud's, orange bitters" },
  { slug: "syrup", label: "Syrups & Sweeteners", hint: "Simple syrup, grenadine, honey, agave" },
  { slug: "juice", label: "Juices", hint: "Bottled or carton: lime, lemon, orange, pineapple" },
  { slug: "mixer", label: "Mixers", hint: "Soda, tonic, ginger beer, cola" },
  { slug: "fresh", label: "Fresh & Perishable", hint: "Whole fruit, mint, cream, egg" },
  { slug: "garnish", label: "Garnishes", hint: "Cherries, olives, salt, whole citrus" },
  { slug: "wine", label: "Wine & Beer", hint: "Prosecco, champagne, lager, stout" },
  { slug: "other", label: "Other", hint: "Anything else behind the bar" },
] as const;

/**
 * Shelves where the choice changes what a recipe will match, not just where
 * the item appears on the page. A garnish has to come off the real thing.
 */
const SHELF_NOTES: Record<string, string> = {
  fresh:
    "Whole fruit belongs here. A lime on this shelf can become a wedge, a wheel, a peel or a twist.",
  garnish:
    "Whole fruit here works too. A lemon on this shelf can become a zest or a twist.",
  juice:
    "Bottled and carton juice belongs here. It covers a recipe calling for juice, but not for a wedge, a peel or a twist — those need the fruit, on Fresh & Perishable.",
};

export function shelfNote(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return SHELF_NOTES[slug] ?? null;
}

export type CategorySlug = (typeof CATEGORIES)[number]["slug"];

export const CATEGORY_SLUGS = CATEGORIES.map((c) => c.slug) as CategorySlug[];

const LABELS = new Map<string, string>(CATEGORIES.map((c) => [c.slug, c.label]));

export function categoryLabel(slug: string | null | undefined): string {
  if (!slug) return "Other";
  return LABELS.get(slug) ?? "Other";
}

export function isCategorySlug(value: string): value is CategorySlug {
  return LABELS.has(value);
}

export const METHODS = [
  { slug: "shaken", label: "Shaken" },
  { slug: "stirred", label: "Stirred" },
  { slug: "built", label: "Built in glass" },
  { slug: "blended", label: "Blended" },
  { slug: "thrown", label: "Thrown" },
  { slug: "other", label: "Other" },
] as const;

export function methodLabel(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return METHODS.find((m) => m.slug === slug)?.label ?? slug;
}
