import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  buildInventoryIndex,
  evaluateRecipe,
  rankByMakeability,
  shoppingSuggestions,
  type Rankable,
  type RequiredIngredient,
} from "@/lib/matching";

/**
 * "Can I make this?" — the question the whole app exists to answer.
 *
 * Everything here is pure: inventory in, verdict out. When these rules drift,
 * drinks quietly stop appearing on Discover and nothing says why.
 */

const shelf = (...names: string[]) =>
  buildInventoryIndex(names.map((slug) => ({ slug, name: slug, inStock: true })));

const needs = (...slugs: string[]): RequiredIngredient[] =>
  slugs.map((slug) => ({ name: slug, slug }));

describe("buildInventoryIndex", () => {
  test("ignores anything out of stock", () => {
    const index = buildInventoryIndex([
      { slug: "gin", name: "Beefeater", inStock: true },
      { slug: "rum", name: "Bacardi", inStock: false },
    ]);
    assert.ok(index.slugs.has("gin"));
    assert.ok(!index.slugs.has("rum"));
  });

  test("remembers the first display name, for explaining a match", () => {
    const index = buildInventoryIndex([
      { slug: "gin", name: "Beefeater", inStock: true },
      { slug: "gin", name: "Tanqueray", inStock: true },
    ]);
    assert.equal(index.names.get("gin"), "Beefeater");
  });

  test("skips items with no match key at all", () => {
    const index = buildInventoryIndex([{ slug: "", name: "Mystery", inStock: true }]);
    assert.equal(index.slugs.size, 0);
  });
});

describe("evaluateRecipe", () => {
  test("a drink you have everything for is makeable", () => {
    const result = evaluateRecipe(
      needs("gin", "sweet vermouth", "campari"),
      shelf("gin", "sweet vermouth", "campari"),
    );
    assert.equal(result.makeable, true);
    assert.equal(result.missing.length, 0);
    assert.equal(result.score, 1);
  });

  test("one missing bottle makes it unmakeable, and names it", () => {
    const result = evaluateRecipe(
      needs("gin", "sweet vermouth", "campari"),
      shelf("gin", "sweet vermouth"),
    );
    assert.equal(result.makeable, false);
    assert.deepEqual(
      result.missing.map((i) => i.slug),
      ["campari"],
    );
  });

  test("a missing garnish never blocks a drink", () => {
    const result = evaluateRecipe(
      [...needs("gin", "sweet vermouth"), { name: "olives", slug: "olives", garnish: true }],
      shelf("gin", "sweet vermouth"),
    );
    assert.equal(result.makeable, true);
    assert.deepEqual(
      result.missingOptional.map((i) => i.slug),
      ["olives"],
    );
  });

  test("an optional ingredient never blocks a drink either", () => {
    const result = evaluateRecipe(
      [...needs("gin"), { name: "absinthe", slug: "absinthe", optional: true }],
      shelf("gin"),
    );
    assert.equal(result.makeable, true);
  });

  test("staples are assumed rather than nagged about", () => {
    const result = evaluateRecipe(needs("gin", "ice"), shelf("gin"));
    assert.equal(result.makeable, true);
    assert.equal(result.ingredients.find((i) => i.slug === "ice")?.assumed, true);
  });

  test("staples can be switched off", () => {
    const result = evaluateRecipe(needs("gin", "ice"), shelf("gin"), {
      assumeStaples: false,
    });
    assert.equal(result.makeable, false);
  });

  test("a stand-in counts, and is reported as a stand-in", () => {
    const result = evaluateRecipe(needs("gin", "sugar"), shelf("gin", "simple syrup"));
    assert.equal(result.makeable, true);
    assert.deepEqual(
      result.substitutions.map((i) => i.slug),
      ["sugar"],
    );
  });

  test("scores a stand-in below the real thing", () => {
    const exact = evaluateRecipe(needs("sugar"), shelf("sugar"));
    const stood_in = evaluateRecipe(needs("sugar"), shelf("simple syrup"));
    assert.equal(exact.score, 1);
    assert.ok(stood_in.score < exact.score, "a substitute should score lower");
    assert.ok(stood_in.score > 0, "but still count for something");
  });

  test("a recipe with no required ingredients is not makeable", () => {
    // Nothing required means nothing was written down, not "ready to pour".
    const result = evaluateRecipe(
      [{ name: "olives", slug: "olives", garnish: true }],
      shelf("olives"),
    );
    assert.equal(result.makeable, false);
  });

  test("an empty shelf makes nothing", () => {
    const result = evaluateRecipe(needs("gin"), shelf());
    assert.equal(result.makeable, false);
    assert.equal(result.score, 0);
  });
});

describe("rankByMakeability", () => {
  const entry = (name: string, required: string[], stocked: string[]): Rankable<string> => ({
    item: name,
    evaluation: evaluateRecipe(needs(...required), shelf(...stocked)),
  });

  test("drinks you can make come first", () => {
    const ranked = rankByMakeability(
      [
        entry("Missing one", ["gin", "campari"], ["gin"]),
        entry("Ready", ["gin"], ["gin"]),
      ],
      (name) => name,
    );
    assert.deepEqual(
      ranked.map((r) => r.item),
      ["Ready", "Missing one"],
    );
  });

  test("then the ones you are closest to", () => {
    const ranked = rankByMakeability(
      [
        entry("Two short", ["gin", "campari", "absinthe"], ["gin"]),
        entry("One short", ["gin", "campari"], ["gin"]),
      ],
      (name) => name,
    );
    assert.equal(ranked[0].item, "One short");
  });

  test("ties break alphabetically, so the order never jitters", () => {
    const ranked = rankByMakeability(
      [entry("Negroni", ["gin"], ["gin"]), entry("Martini", ["gin"], ["gin"])],
      (name) => name,
    );
    assert.deepEqual(
      ranked.map((r) => r.item),
      ["Martini", "Negroni"],
    );
  });

  test("does not disturb the list it was given", () => {
    const entries = [entry("B", ["gin"], []), entry("A", ["gin"], ["gin"])];
    const before = entries.map((e) => e.item);
    rankByMakeability(entries, (name) => name);
    assert.deepEqual(
      entries.map((e) => e.item),
      before,
    );
  });
});

describe("shoppingSuggestions", () => {
  const entry = (name: string, required: string[], stocked: string[]): Rankable<string> => ({
    item: name,
    evaluation: evaluateRecipe(needs(...required), shelf(...stocked)),
  });

  test("counts how many drinks one bottle would unlock", () => {
    const suggestions = shoppingSuggestions([
      entry("Negroni", ["gin", "campari", "sweet vermouth"], ["gin", "sweet vermouth"]),
      entry("Americano", ["campari", "sweet vermouth"], ["sweet vermouth"]),
    ]);
    assert.equal(suggestions[0].slug, "campari");
    assert.equal(suggestions[0].unlocks, 2);
  });

  test("ignores drinks that are more than one bottle away", () => {
    // Suggesting something that still leaves you short helps nobody.
    const suggestions = shoppingSuggestions([
      entry("Far off", ["gin", "campari", "absinthe"], []),
    ]);
    assert.deepEqual(suggestions, []);
  });

  test("ignores drinks you can already make", () => {
    const suggestions = shoppingSuggestions([entry("Ready", ["gin"], ["gin"])]);
    assert.deepEqual(suggestions, []);
  });

  test("honours the limit", () => {
    const entries = ["a", "b", "c", "d"].map((slug) =>
      entry(slug, ["gin", slug], ["gin"]),
    );
    assert.equal(shoppingSuggestions(entries, 2).length, 2);
  });
});
