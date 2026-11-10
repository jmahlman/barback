import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { SUBSTITUTION_GROUPS, type SubstitutionGroupId } from "@/lib/ingredients";
import {
  buildInventoryIndex,
  DEFAULT_RULES,
  evaluateRecipe,
  type MatchingRules,
  type RequiredIngredient,
} from "@/lib/matching";

/**
 * The rules an administrator can switch in Settings, and the explanation a
 * recipe page gives when one of them is why something is missing.
 */

const rules = (overrides: Partial<MatchingRules> = {}): MatchingRules => ({
  ...DEFAULT_RULES,
  ...overrides,
});

const allBut = (...off: SubstitutionGroupId[]) =>
  new Set(SUBSTITUTION_GROUPS.map((g) => g.id).filter((id) => !off.includes(id)));

const shelf = (items: [string, string?][], with_: MatchingRules = DEFAULT_RULES) =>
  buildInventoryIndex(
    items.map(([slug, category]) => ({ slug, name: slug, inStock: true, category })),
    with_,
  );

const needs = (...slugs: string[]): RequiredIngredient[] =>
  slugs.map((slug) => ({ name: slug, slug }));

describe("the default rules", () => {
  test("match the way Barback always has", () => {
    assert.equal(DEFAULT_RULES.garnishesOptional, true);
    assert.equal(DEFAULT_RULES.assumeStaples, true);
    assert.equal(DEFAULT_RULES.substitutions.size, SUBSTITUTION_GROUPS.length);
  });

  test("are what a shelf gets when nobody says otherwise", () => {
    const result = evaluateRecipe(needs("bourbon"), shelf([["rye"]]));
    assert.equal(result.makeable, true);
    assert.equal(result.ingredients[0]?.match?.kind, "substitute");
    assert.equal(result.ingredients[0]?.match?.group, "whiskey");
  });
});

describe("stand-ins", () => {
  test("a group switched off no longer stands in", () => {
    const index = shelf([["rye"]], rules({ substitutions: allBut("whiskey") }));
    const result = evaluateRecipe(needs("bourbon"), index);
    assert.equal(result.makeable, false);
  });

  test("and the missing ingredient says which bottle would have counted", () => {
    const index = shelf([["rye"]], rules({ substitutions: allBut("whiskey") }));
    const [bourbon] = evaluateRecipe(needs("bourbon"), index).ingredients;
    assert.deepEqual(bourbon?.blockedBy, {
      rule: "substitution",
      group: "whiskey",
      inventorySlug: "rye",
    });
  });

  test("switching off one group leaves the others working", () => {
    const index = shelf([["rye"], ["simple syrup"]], rules({ substitutions: allBut("whiskey") }));
    const result = evaluateRecipe(needs("bourbon", "sugar"), index);
    assert.deepEqual(
      result.missing.map((i) => i.slug),
      ["bourbon"],
    );
  });

  test("a lime in the fridge stops covering a lemon peel when citrus is off", () => {
    const peel: RequiredIngredient[] = [{ name: "Lemon peel", slug: "lemon peel" }];
    const on = evaluateRecipe(peel, shelf([["lime juice", "fresh"]]));
    assert.equal(on.missing.length, 0);
    const off = evaluateRecipe(
      peel,
      shelf([["lime juice", "fresh"]], rules({ substitutions: allBut("citrus") })),
    );
    assert.equal(off.missing.length, 1);
  });

  test("nothing to explain when nothing on the shelf was close", () => {
    const [gin] = evaluateRecipe(needs("gin"), shelf([["rum"]])).ingredients;
    assert.equal(gin?.blockedBy, null);
  });
});

describe("garnishes", () => {
  const sour: RequiredIngredient[] = [
    ...needs("bourbon", "lemon juice"),
    { name: "Cherry", slug: "cherry", garnish: true },
  ];

  test("by default a missing garnish never stops a drink", () => {
    const result = evaluateRecipe(sour, shelf([["bourbon"], ["lemon juice"]]));
    assert.equal(result.makeable, true);
    assert.equal(result.missingOptional.length, 1);
  });

  test("when garnishes count, it does, and says why", () => {
    const index = shelf([["bourbon"], ["lemon juice"]], rules({ garnishesOptional: false }));
    const result = evaluateRecipe(sour, index);
    assert.equal(result.makeable, false);
    assert.deepEqual(result.missing[0]?.blockedBy, { rule: "garnish" });
  });
});

describe("pantry staples", () => {
  test("are assumed by default", () => {
    const [, ice] = evaluateRecipe(needs("gin", "ice"), shelf([["gin"]])).ingredients;
    assert.equal(ice?.assumed, true);
  });

  test("when not assumed, are missing, and say why", () => {
    const index = shelf([["gin"]], rules({ assumeStaples: false }));
    const result = evaluateRecipe(needs("gin", "ice"), index);
    assert.equal(result.makeable, false);
    assert.deepEqual(result.missing[0]?.blockedBy, { rule: "staples" });
  });

  test("water is never covered by tonic water", () => {
    // Found on a real Old Fashioned: "1 barspoon Water -- Covered by Fever-Tree
    // Tonic Water". The name contains "water"; the drink does not.
    const [water] = evaluateRecipe(needs("water"), shelf([["tonic water"]])).ingredients;
    assert.equal(water?.match, null);
    assert.equal(water?.assumed, true);
  });

  test("nor salt by celery salt", () => {
    const [salt] = evaluateRecipe(needs("salt"), shelf([["celery salt"]])).ingredients;
    assert.equal(salt?.match, null);
  });

  test("water you actually stock still counts as yours", () => {
    const [water] = evaluateRecipe(needs("water"), shelf([["water"]])).ingredients;
    assert.equal(water?.match?.kind, "exact");
    assert.equal(water?.assumed, false);
  });
});
