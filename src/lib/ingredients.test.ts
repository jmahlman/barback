import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  findMatch,
  isKnownBase,
  prettifyIngredient,
  slugifyIngredient,
} from "@/lib/ingredients";

/**
 * The rules that decide whether a bottle on your shelf counts as the thing a
 * recipe asked for.
 *
 * These fail quietly when they break: nothing errors, a drink simply stops
 * appearing, or an ingredient shows as missing when it is standing right
 * there. Writing them down is the only way to notice.
 */

describe("slugifyIngredient", () => {
  test("collapses a brand down to what it actually is", () => {
    assert.equal(slugifyIngredient("Beefeater London Dry Gin"), "gin");
    assert.equal(slugifyIngredient("Buffalo Trace Kentucky Straight Bourbon"), "bourbon");
    assert.equal(slugifyIngredient("Hendrick's Gin"), "gin");
  });

  test("drops measures and noise words", () => {
    assert.equal(slugifyIngredient("2 oz gin"), "gin");
    assert.equal(slugifyIngredient("1 1/2 oz fresh lime juice"), "lime juice");
    assert.equal(slugifyIngredient("a dash of Angostura bitters"), "angostura bitters");
  });

  test("does not mistake tequila for a sweetener", () => {
    // Regression: an over-greedy "agave" alias once filed this under agave
    // syrup, so a bottle of tequila counted as a sweetener.
    const slug = slugifyIngredient("50 ml tequila 100% agave");
    assert.notEqual(slug, "agave syrup");
    assert.ok(slug.includes("tequila"), `expected tequila, got ${slug}`);
  });

  test("files every form of a citrus fruit under its juice", () => {
    // A deliberate simplification: Barback does not distinguish a whole lime
    // from a bottle of its juice. See the garnish case further down.
    for (const input of ["Lime", "Limes", "Fresh limes", "Lime juice"]) {
      assert.equal(slugifyIngredient(input), "lime juice", input);
    }
    assert.equal(slugifyIngredient("Lemon"), "lemon juice");
  });

  test("is stable: slugifying a slug changes nothing", () => {
    for (const input of ["gin", "lime juice", "angostura bitters", "simple syrup"]) {
      assert.equal(slugifyIngredient(input), input);
    }
  });

  test("survives nonsense without throwing", () => {
    assert.equal(typeof slugifyIngredient(""), "string");
    assert.equal(typeof slugifyIngredient("   "), "string");
    assert.equal(typeof slugifyIngredient("!!!"), "string");
  });
});

describe("isKnownBase", () => {
  test("recognises things recipes actually ask for", () => {
    assert.equal(isKnownBase("gin"), true);
    assert.equal(isKnownBase("sweet vermouth"), true);
    assert.equal(isKnownBase("angostura bitters"), true);
  });

  test("rejects a name nothing will ever match", () => {
    // This is what makes the inventory form warn you to set a match key.
    assert.equal(isKnownBase("uncle petes mystery amaro reserve no 4"), false);
    assert.equal(isKnownBase(""), false);
  });
});

describe("prettifyIngredient", () => {
  test("turns a slug back into something readable", () => {
    assert.equal(prettifyIngredient("lime juice"), "Lime Juice");
    assert.equal(prettifyIngredient("gin"), "Gin");
  });
});

describe("findMatch", () => {
  test("an exact match beats everything", () => {
    const match = findMatch("gin", ["gin", "london dry gin"]);
    assert.deepEqual(match, { kind: "exact", inventorySlug: "gin" });
  });

  test("a family generic covers its members", () => {
    // Having rum means you can make a drink calling for white rum.
    assert.equal(findMatch("white rum", ["rum"])?.kind, "family");
    assert.equal(findMatch("bourbon", ["whiskey"])?.kind, "family");
    assert.equal(findMatch("orange bitters", ["bitters"])?.kind, "family");
  });

  test("a brand on the shelf covers the generic a recipe asks for", () => {
    assert.equal(findMatch("gin", ["london dry gin"])?.kind, "partial");
    assert.equal(findMatch("bourbon", ["buffalo trace bourbon"])?.kind, "partial");
  });

  test("a stand-in is used, and reported as one", () => {
    // These are the arguable ones, so the UI says "Using X" rather than
    // pretending you had the real thing.
    assert.equal(findMatch("sugar", ["simple syrup"])?.kind, "substitute");
    assert.equal(findMatch("rye", ["bourbon"])?.kind, "substitute");
  });

  test("prefers the closest match when several would do", () => {
    // Exact over family, family over substitute.
    assert.equal(findMatch("bourbon", ["rye", "bourbon"])?.kind, "exact");
    assert.equal(findMatch("bourbon", ["rye", "whiskey"])?.kind, "family");
  });

  test("returns nothing when the shelf cannot cover it", () => {
    assert.equal(findMatch("absinthe", ["gin", "vodka"]), null);
    assert.equal(findMatch("gin", []), null);
  });

  test("an unrelated ingredient is not covered by a well-stocked shelf", () => {
    assert.equal(findMatch("absinthe", ["gin", "vodka", "lime juice"]), null);
  });
});

describe("citrus garnishes", () => {
  const fruits = ["lime", "lemon", "orange", "grapefruit"] as const;
  const forms = ["peel", "zest", "twist", "wedge", "wheel", "slice"] as const;

  test("a piece of fruit keeps its own key, separate from the juice", () => {
    // "twist", "wedge" and "slice" are also units of quantity, so without
    // care they reduce to the bare fruit and become indistinguishable from a
    // carton of juice.
    for (const fruit of fruits) {
      for (const form of forms) {
        assert.equal(slugifyIngredient(`${fruit} ${form}`), `${fruit} ${form}`);
      }
    }
  });

  test("plurals and either word order land on the same key", () => {
    assert.equal(slugifyIngredient("2 lemon wedges"), "lemon wedge");
    assert.equal(slugifyIngredient("wedge of lemon"), "lemon wedge");
    assert.equal(slugifyIngredient("2 wedges of lemon"), "lemon wedge");
    assert.equal(slugifyIngredient("twist of orange"), "orange twist");
  });

  // The fruit itself, shelved as fresh produce, versus a bottle of its juice.
  // Both are recorded under the same slug, so the shelf is what separates
  // them.
  const inFridge = new Set([slugifyIngredient("Lime")]);
  const bottled = new Set<string>();

  test("the fruit in the fridge covers every garnish made from it", () => {
    for (const form of forms) {
      const slug = slugifyIngredient(`lime ${form}`);
      assert.equal(
        findMatch(slug, [...inFridge], inFridge)?.kind,
        "exact",
        `a lime should cover a lime ${form}`,
      );
    }
  });

  test("a bottle of juice does not", () => {
    for (const form of forms) {
      const slug = slugifyIngredient(`lime ${form}`);
      assert.equal(
        findMatch(slug, ["lime juice"], bottled),
        null,
        `bottled juice should not produce a lime ${form}`,
      );
    }
  });

  test("but a bottle of juice is still juice", () => {
    assert.equal(findMatch(slugifyIngredient("lime juice"), ["lime juice"], bottled)?.kind, "exact");
  });

  test("lemons stand in for limes, and are reported as standing in", () => {
    const lemons = new Set([slugifyIngredient("Lemon")]);
    const match = findMatch(slugifyIngredient("lime twist"), [...lemons], lemons);
    assert.equal(match?.kind, "substitute");
  });

  test("the fruits that are not interchangeable stay that way", () => {
    const oranges = new Set([slugifyIngredient("Orange")]);
    assert.equal(findMatch(slugifyIngredient("grapefruit twist"), [...oranges], oranges), null);
    assert.equal(findMatch(slugifyIngredient("lime peel"), [...oranges], oranges), null);
  });
});
