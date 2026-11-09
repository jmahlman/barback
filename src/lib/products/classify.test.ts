import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { cleanTitle, shelfFor } from "@/lib/products/classify";

/**
 * Turning a retail listing into a bottle.
 *
 * The titles here are real ones returned by UPCitemdb, not invented examples —
 * which matters, because the awkward shapes are the whole problem: the size
 * can be anywhere, the noise words sit on either side of it, and half of them
 * shout.
 */

describe("cleanTitle", () => {
  test("pulls the size off the end", () => {
    assert.deepEqual(cleanTitle("BEEFEATER LONDON DRY GIN 750ML"), {
      name: "Beefeater London Dry Gin",
      size: "750 ml",
    });
  });

  test("handles a size introduced by a comma", () => {
    assert.deepEqual(
      cleanTitle("Buffalo Trace Kentucky Straight Bourbon Whiskey, 750 mL"),
      { name: "Buffalo Trace Kentucky Straight Bourbon Whiskey", size: "750 ml" },
    );
  });

  test("handles a noise word sitting after the size", () => {
    // Real title. "Bottle" comes last, so the size is only reachable once the
    // retail noise has been stripped first.
    assert.deepEqual(cleanTitle("Tito's Handmade Vodka - 750ml Bottle"), {
      name: "Tito's Handmade Vodka",
      size: "750 ml",
    });
  });

  test("strips more than one piece of trailing noise", () => {
    assert.deepEqual(cleanTitle("Bombay Sapphire Gin, 750 mL Bottle, Case of 12"), {
      name: "Bombay Sapphire Gin",
      size: "750 ml",
    });
  });

  test("normalises litres", () => {
    assert.deepEqual(cleanTitle("Hendrick's Gin 1.75L"), {
      name: "Hendrick's Gin",
      size: "1.75 L",
    });
    assert.deepEqual(cleanTitle("COINTREAU ORANGE LIQUEUR 1 LITER"), {
      name: "Cointreau Orange Liqueur",
      size: "1 L",
    });
  });

  test("normalises fluid ounces", () => {
    assert.deepEqual(cleanTitle("Fever-Tree Premium Indian Tonic Water 6.8 fl oz"), {
      name: "Fever-Tree Premium Indian Tonic Water",
      size: "6.8 fl oz",
    });
  });

  test("re-cases a shouted title but leaves a mixed-case one alone", () => {
    assert.equal(cleanTitle("JIM BEAM BOURBON").name, "Jim Beam Bourbon");
    // Only partly capitalised, so the brand's own styling is kept.
    assert.equal(
      cleanTitle("ANGOSTURA Aromatic Bitters, 16 Oz").name,
      "ANGOSTURA Aromatic Bitters",
    );
  });

  test("leaves a title with no size alone", () => {
    assert.deepEqual(cleanTitle("Monin Simple Syrup"), {
      name: "Monin Simple Syrup",
      size: null,
    });
  });

  test("refuses to strip a size when nothing would be left", () => {
    // "750ML" on its own is the entire name we were given, bad as it is.
    assert.deepEqual(cleanTitle("750ML"), { name: "750ML", size: null });
  });

  test("survives an empty title", () => {
    assert.deepEqual(cleanTitle(""), { name: "", size: null });
  });
});

describe("shelfFor", () => {
  const retailSpirits =
    "Food, Beverages & Tobacco > Beverages > Alcoholic Beverages > Liquor & Spirits";

  test("files spirits from the ingredient slug", () => {
    assert.equal(shelfFor("gin"), "spirit");
    assert.equal(shelfFor("bourbon"), "spirit");
    assert.equal(shelfFor("mezcal"), "spirit");
  });

  test("keeps liqueurs off the spirits shelf even when retail disagrees", () => {
    // The retail tree calls all of these "Liquor & Spirits". The slug knows
    // better, and the slug wins.
    assert.equal(shelfFor("campari", retailSpirits), "liqueur");
    assert.equal(shelfFor("aperol", retailSpirits), "liqueur");
    assert.equal(shelfFor("sweet vermouth", retailSpirits), "vermouth");
  });

  test("files the rest of the bar", () => {
    assert.equal(shelfFor("angostura bitters"), "bitters");
    assert.equal(shelfFor("simple syrup"), "syrup");
    assert.equal(shelfFor("lime juice"), "juice");
    assert.equal(shelfFor("tonic water"), "mixer");
    assert.equal(shelfFor("prosecco"), "wine");
  });

  test("falls back to the retail category when the slug says nothing", () => {
    assert.equal(shelfFor("uncle petes mystery no 4", retailSpirits), "spirit");
    assert.equal(shelfFor("something unknown", "Wine & Champagne"), "wine");
  });

  test("lands on other when nothing is known, which is always safe", () => {
    assert.equal(shelfFor("uncle petes mystery no 4"), "other");
    assert.equal(shelfFor(""), "other");
  });
});
