import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildInventoryIndex, evaluateRecipe } from "@/lib/matching";
import { slugifyIngredient } from "@/lib/ingredients";
import {
  cocktailGlassImageUrl,
  cocktailGlassPageUrl,
  formatMeasure,
  matchesName,
  parseCatalog,
  toProviderDrink,
  type RawCocktailGlassDrink,
} from "@/lib/providers/cocktail-glass-parse";
import { drinkImage, drinkImageFullPx } from "@/lib/providers/images";

/**
 * cocktail.glass's catalog, read into Barback's shape.
 *
 * The fixtures are real entries from cocktails.json, trimmed, so the tests
 * describe the data as it actually arrives rather than as it might.
 */

const margarita: RawCocktailGlassDrink = {
  name: "Margarita",
  slug: "margarita",
  glass: "Coupe",
  family: "Sour",
  method: "Shaken",
  tags: ["classic"],
  ingredients: [
    { ref: "tequila-blanco", name: "Tequila blanco", type: "spirit", amount: 60, unit: "ml" },
    { ref: "lime-juice", name: "Lime juice", type: "juice", amount: 30, unit: "ml" },
    { ref: "triple-sec", name: "Triple sec", type: "liqueur", amount: 30, unit: "ml" },
  ],
  garnish: ["Lime wheel", "salt rim"],
  preparation: [
    "Rim the coupe glass with salt.",
    "Shake all ingredients with ice.",
    "Strain into a chilled coupe glass.",
  ],
  url: "https://cocktail.glass/margarita/",
};

describe("formatMeasure", () => {
  test("reads a volume as published", () => {
    assert.equal(formatMeasure(60, "ml"), "60 ml");
    assert.equal(formatMeasure(22.5, "ml"), "22.5 ml");
  });

  test("pluralizes a countable unit once there is more than one", () => {
    assert.equal(formatMeasure(2, "dash"), "2 dashes");
    assert.equal(formatMeasure(3, "drop"), "3 drops");
    assert.equal(formatMeasure(2, "barspoon"), "2 barspoons");
  });

  test("keeps the singular for one", () => {
    assert.equal(formatMeasure(1, "dash"), "1 dash");
    assert.equal(formatMeasure(1, "piece"), "1 piece");
  });

  test("leaves a unit that is already plural alone", () => {
    assert.equal(formatMeasure(8, "leaves"), "8 leaves");
  });

  test("writes a half as a fraction", () => {
    assert.equal(formatMeasure(0.5, "barspoon"), "½ barspoon");
  });

  test("never invents a quantity", () => {
    assert.equal(formatMeasure(null, "pinch"), "pinch");
    assert.equal(formatMeasure(undefined, undefined), null);
    assert.equal(formatMeasure(0, "ml"), "ml");
  });
});

describe("toProviderDrink", () => {
  const drink = toProviderDrink(margarita);

  test("reads the basics", () => {
    assert.ok(drink);
    assert.equal(drink.provider, "cocktailglass");
    assert.equal(drink.externalId, "margarita");
    assert.equal(drink.key, "cocktailglass~margarita");
    assert.equal(drink.name, "Margarita");
    assert.equal(drink.glass, "Coupe");
    assert.equal(drink.sourceUrl, "https://cocktail.glass/margarita/");
  });

  test("uses the family as the category", () => {
    assert.equal(drink?.category, "Sour");
  });

  test("joins the preparation steps one to a line", () => {
    assert.equal(
      drink?.instructions,
      "Rim the coupe glass with salt.\nShake all ingredients with ice.\nStrain into a chilled coupe glass.",
    );
  });

  test("derives the picture from the slug, since the catalog has no image field", () => {
    assert.equal(drink?.thumbUrl, cocktailGlassImageUrl("margarita"));
  });

  test("matches its ingredients the way the rest of Barback does", () => {
    const required = drink?.ingredients.filter((i) => !i.garnish).map((i) => i.slug);
    assert.deepEqual(required, [
      slugifyIngredient("Tequila blanco"),
      slugifyIngredient("Lime juice"),
      slugifyIngredient("Triple sec"),
    ]);
    assert.equal(required?.[0], "tequila");
    assert.equal(required?.[2], "orange liqueur");
  });

  test("keeps the measures as numbers and units turned into text", () => {
    assert.deepEqual(
      drink?.ingredients.filter((i) => !i.garnish).map((i) => i.measure),
      ["60 ml", "30 ml", "30 ml"],
    );
  });

  test("lists garnishes separately and flags them", () => {
    const garnishes = drink?.ingredients.filter((i) => i.garnish) ?? [];
    assert.deepEqual(
      garnishes.map((i) => i.name),
      ["Lime wheel", "Salt rim"],
    );
    assert.ok(garnishes.every((i) => i.measure === null));
  });

  test("calls a drink alcoholic unless its own tags say otherwise", () => {
    // An Angostura Sour has no spirit in it by type -- 45 ml of 45% bitters
    // -- and carries no tag, so it must not be guessed non-alcoholic.
    assert.equal(drink?.alcoholic, "Alcoholic");
    const virgin = toProviderDrink({ ...margarita, tags: ["non-alcoholic"] });
    assert.equal(virgin?.alcoholic, "Non alcoholic");
  });

  test("falls back to building the page address when the url is missing", () => {
    const noUrl = toProviderDrink({ ...margarita, url: null });
    assert.equal(noUrl?.sourceUrl, cocktailGlassPageUrl("margarita"));
  });

  test("refuses an entry too incomplete to use", () => {
    assert.equal(toProviderDrink({ ...margarita, name: "" }), null);
    assert.equal(toProviderDrink({ ...margarita, slug: undefined }), null);
    assert.equal(toProviderDrink({ ...margarita, ingredients: [] }), null);
  });
});

describe("parseCatalog", () => {
  test("reads a list of drinks", () => {
    assert.equal(parseCatalog([margarita]).length, 1);
  });

  test("skips junk instead of failing on it", () => {
    const drinks = parseCatalog([margarita, null, 42, { name: "No slug" }, "nope"]);
    assert.deepEqual(
      drinks.map((d) => d.externalId),
      ["margarita"],
    );
  });

  test("drops a repeated slug", () => {
    assert.equal(parseCatalog([margarita, { ...margarita }]).length, 1);
  });

  test("returns nothing for anything that is not a list", () => {
    assert.deepEqual(parseCatalog({ cocktails: [margarita] }), []);
    assert.deepEqual(parseCatalog(null), []);
  });
});

describe("matchesName", () => {
  const vieux = toProviderDrink({ ...margarita, name: "Vieux Carré", slug: "vieux-carre" });

  test("ignores case and accents", () => {
    assert.ok(vieux);
    assert.equal(matchesName(vieux, "vieux carre"), true);
    assert.equal(matchesName(vieux, "CARRÉ"), true);
  });

  test("matches part of a name", () => {
    assert.ok(vieux);
    assert.equal(matchesName(vieux, "carr"), true);
  });

  test("an empty search matches nothing", () => {
    assert.ok(vieux);
    assert.equal(matchesName(vieux, "   "), false);
  });
});

describe("cocktail.glass pictures", () => {
  const url = cocktailGlassImageUrl("margarita");

  test("a thumbnail asks for the smaller size", () => {
    assert.equal(
      drinkImage(url, 300),
      "https://cocktail.glass/images/responsive/320/margarita.webp",
    );
  });

  test("a large view asks for the larger one", () => {
    assert.equal(
      drinkImage(url, 640),
      "https://cocktail.glass/images/responsive/640/margarita.webp",
    );
  });

  test("the enlarged view stops at the size that exists", () => {
    assert.equal(drinkImageFullPx(url), 640);
    assert.equal(drinkImageFullPx("https://www.thecocktaildb.com/images/media/drink/x.jpg"), 700);
  });
});

describe("a cocktail.glass drink against a real shelf", () => {
  const drink = toProviderDrink(margarita);
  assert.ok(drink);
  const required = drink.ingredients.map((i) => ({
    name: i.name,
    slug: i.slug,
    measure: i.measure,
    garnish: i.garnish ?? false,
  }));

  const shelf = (...items: [string, string][]) =>
    buildInventoryIndex(
      items.map(([name, category]) => ({
        name,
        category,
        slug: slugifyIngredient(name),
        inStock: true,
      })),
    );

  test("is makeable with the spirit, the juice and an orange liqueur", () => {
    const result = evaluateRecipe(
      required,
      shelf(["Tequila", "spirit"], ["Lime juice", "juice"], ["Cointreau", "liqueur"]),
    );
    assert.equal(result.makeable, true);
  });

  test("its garnishes never block it", () => {
    // No limes in the fridge, so the lime wheel is missing -- and the drink
    // can still be made.
    const result = evaluateRecipe(
      required,
      shelf(["Tequila", "spirit"], ["Rose's Lime Juice", "juice"], ["Cointreau", "liqueur"]),
    );
    assert.equal(result.makeable, true);
    assert.ok(result.missingOptional.some((i) => i.name === "Lime wheel"));
  });

  test("a lime in the fridge covers the wheel, and the salt rim is assumed", () => {
    const result = evaluateRecipe(
      required,
      shelf(["Tequila", "spirit"], ["Lime", "fresh"], ["Cointreau", "liqueur"]),
    );
    assert.equal(result.missingOptional.length, 0);
  });
});
