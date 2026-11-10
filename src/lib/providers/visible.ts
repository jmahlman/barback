/**
 * Which cached drinks to show, once more than one provider's catalog is in
 * the database.
 *
 * The cache keeps every provider's drinks, so switching back costs nothing.
 * But showing all of them at once would list a Margarita from each service,
 * and the classics are exactly where the catalogs overlap. So Discover shows
 * the providers you are using, in the order you are using them, and one copy
 * of each cocktail: the one from the provider you prefer.
 *
 * Pure, so it can be tested without a database.
 */

import type { ProviderDrink, ProviderId } from "@/lib/providers/types";

/**
 * What makes two drinks "the same cocktail" across providers: the name, with
 * case, accents and punctuation ignored.
 *
 * Not the drink's `slug`. That comes from the ingredient normalizer, which is
 * built to reduce names, so "Irish Coffee" and "Mexican Coffee" share one.
 */
export function cocktailIdentity(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Keep only drinks from `providers`, and of those, one per cocktail, taking
 * the copy from whichever provider comes first in the list.
 *
 * The result keeps the providers' relative order and, within one provider,
 * the order the drinks arrived in.
 */
export function onePerCocktail(
  drinks: ProviderDrink[],
  providers: readonly ProviderId[],
): ProviderDrink[] {
  const rank = new Map(providers.map((id, index) => [id, index]));

  const ranked = drinks
    .map((drink, position) => ({ drink, position, rank: rank.get(drink.provider) }))
    .filter((entry): entry is { drink: ProviderDrink; position: number; rank: number } =>
      entry.rank !== undefined,
    )
    .sort((a, b) => a.rank - b.rank || a.position - b.position);

  const seen = new Set<string>();
  const kept: ProviderDrink[] = [];
  for (const { drink } of ranked) {
    const key = cocktailIdentity(drink.name);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(drink);
  }
  return kept;
}
