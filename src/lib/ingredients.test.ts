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

  test("a lime does not stand in for a lemon", () => {
    assert.equal(findMatch("lemon peel", ["lime juice"]), null);
  });
});

describe("citrus garnishes", () => {
  // Inventory stores a lime as "lime juice", so these are what a recipe
  // requirement actually meets.
  const shelf = [slugifyIngredient("Lime")];

  test("a lime covers the forms that were given aliases", () => {
    assert.ok(findMatch(slugifyIngredient("lime wedge"), shelf));
    assert.ok(findMatch(slugifyIngredient("lime twist"), shelf));
  });

  test(
    "a lime should also cover a peel and a wheel",
    { todo: "barback-wsr: lime peel and lime wheel were never aliased" },
    () => {
      assert.ok(findMatch(slugifyIngredient("lime peel"), shelf));
      assert.ok(findMatch(slugifyIngredient("lime wheel"), shelf));
    },
  );

  test(
    "bottled juice should not satisfy a garnish needing the fruit",
    { todo: "barback-wsr: lime twist slugifies to lime juice, so it does" },
    () => {
      assert.equal(findMatch(slugifyIngredient("lime twist"), ["lime juice"]), null);
    },
  );
});
