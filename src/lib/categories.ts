/// The shelves of a home bar. `slug` is what we persist.
export const CATEGORIES = [
  { slug: "spirit", label: "Spirits", hint: "Gin, whiskey, rum, tequila, vodka" },
  { slug: "liqueur", label: "Liqueurs", hint: "Cointreau, Campari, amaretto, crème de cacao" },
  { slug: "vermouth", label: "Vermouth & Fortified", hint: "Sweet & dry vermouth, sherry, port" },
  { slug: "bitters", label: "Bitters", hint: "Angostura, Peychaud's, orange bitters" },
  { slug: "syrup", label: "Syrups & Sweeteners", hint: "Simple syrup, grenadine, honey, agave" },
  { slug: "juice", label: "Juices", hint: "Lime, lemon, orange, pineapple" },
  { slug: "mixer", label: "Mixers", hint: "Soda, tonic, ginger beer, cola" },
  { slug: "fresh", label: "Fresh & Perishable", hint: "Citrus, mint, cream, egg" },
  { slug: "garnish", label: "Garnishes", hint: "Cherries, olives, peels, salt" },
  { slug: "wine", label: "Wine & Beer", hint: "Prosecco, champagne, lager, stout" },
  { slug: "other", label: "Other", hint: "Anything else behind the bar" },
] as const;

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

/// Categories whose absence should NOT stop us suggesting a drink —
/// you can usually improvise or skip these.
export const FORGIVING_CATEGORIES: ReadonlySet<string> = new Set([
  "garnish",
  "fresh",
]);

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
