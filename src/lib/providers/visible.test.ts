import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ProviderDrink, ProviderId } from "@/lib/providers/types";
import { onePerCocktail } from "@/lib/providers/visible";

/**
 * With more than one provider's catalog cached, Discover must show each
 * cocktail once, from the provider you prefer, and nothing from a provider
 * you are not using.
 */

function drink(provider: ProviderId, name: string, slug = name.toLowerCase()): ProviderDrink {
  return {
    provider,
    externalId: `${provider}-${slug}`,
    key: `${provider}~${slug}`,
    name,
    slug,
    thumbUrl: null,
    category: null,
    alcoholic: null,
    glass: null,
    instructions: null,
    ingredients: [],
    sourceUrl: null,
  };
}

const keys = (drinks: ProviderDrink[]) => drinks.map((d) => d.key);

describe("onePerCocktail", () => {
  test("keeps the preferred provider's copy of a shared cocktail", () => {
    const result = onePerCocktail(
      [drink("cocktaildb", "Margarita"), drink("cocktailglass", "Margarita")],
      ["cocktailglass", "cocktaildb"],
    );
    assert.deepEqual(keys(result), ["cocktailglass~margarita"]);
  });

  test("follows the order you chose, not the order of the catalog", () => {
    const result = onePerCocktail(
      [drink("cocktailglass", "Margarita"), drink("cocktaildb", "Margarita")],
      ["cocktaildb", "cocktailglass"],
    );
    assert.deepEqual(keys(result), ["cocktaildb~margarita"]);
  });

  test("still shows what only a fallback provider has", () => {
    const result = onePerCocktail(
      [
        drink("cocktailglass", "Margarita"),
        drink("cocktaildb", "Margarita"),
        drink("cocktaildb", "Zombie"),
      ],
      ["cocktailglass", "cocktaildb"],
    );
    assert.deepEqual(keys(result), ["cocktailglass~margarita", "cocktaildb~zombie"]);
  });

  test("hides a provider you are no longer using", () => {
    const result = onePerCocktail(
      [drink("cocktaildb", "Zombie"), drink("cocktailglass", "Margarita")],
      ["cocktailglass"],
    );
    assert.deepEqual(keys(result), ["cocktailglass~margarita"]);
  });

  test("treats names that differ only in accents, case or punctuation as one cocktail", () => {
    const result = onePerCocktail(
      [
        drink("cocktaildb", "Pina Colada"),
        drink("cocktailglass", "Piña Colada"),
        drink("cocktaildb", "Gin & Tonic"),
        drink("cocktailglass", "Gin and tonic"),
        drink("cocktaildb", "Corpse Reviver #2"),
        drink("cocktailglass", "Corpse Reviver 2"),
      ],
      ["cocktailglass", "cocktaildb"],
    );
    assert.deepEqual(
      result.map((d) => d.provider),
      ["cocktailglass", "cocktailglass", "cocktailglass"],
    );
  });

  test("keeps different drinks whose ingredient slugs happen to agree", () => {
    // Real cocktail.glass entries: the ingredient normalizer gives all three
    // the slug "coffee", and a variation shares its parent's.
    const result = onePerCocktail(
      [
        drink("cocktailglass", "Irish Coffee", "coffee"),
        drink("cocktailglass", "Mexican Coffee", "coffee"),
        drink("cocktailglass", "Amaretto Coffee", "coffee"),
        drink("cocktailglass", "Bamboo", "bamboo"),
        drink("cocktailglass", "Bamboo (Dry)", "bamboo"),
      ],
      ["cocktailglass"],
    );
    assert.equal(result.length, 5);
  });

  test("keeps one provider's own order", () => {
    const result = onePerCocktail(
      [drink("cocktailglass", "Zombie"), drink("cocktailglass", "Aviation")],
      ["cocktailglass"],
    );
    assert.deepEqual(keys(result), ["cocktailglass~zombie", "cocktailglass~aviation"]);
  });

  test("shows nothing when no provider is in use", () => {
    assert.deepEqual(onePerCocktail([drink("cocktaildb", "Zombie")], []), []);
  });
});
