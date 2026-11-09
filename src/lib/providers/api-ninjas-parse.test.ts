import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  externalIdFor,
  parseIngredientString,
  titleCase,
} from "@/lib/providers/api-ninjas-parse";

/**
 * API Ninjas publishes an ingredient as one string with the measure baked in,
 * so Barback has to take it apart. Getting the split wrong means either a
 * measure swallowed into the name — which then matches nothing — or a
 * quantity invented out of thin air, which is worse.
 */

describe("parseIngredientString", () => {
  test("separates a plain measure from the name", () => {
    assert.deepEqual(parseIngredientString("2 oz gin"), {
      name: "gin",
      slug: "gin",
      measure: "2 oz",
    });
  });

  test("keeps a mixed fraction together", () => {
    assert.deepEqual(parseIngredientString("1 1/2 oz fresh lime juice"), {
      name: "fresh lime juice",
      slug: "lime juice",
      measure: "1 1/2 oz",
    });
  });

  test("keeps a bare fraction together", () => {
    assert.equal(parseIngredientString("3/4 oz simple syrup").measure, "3/4 oz");
  });

  test("handles units that are not volumes", () => {
    assert.deepEqual(parseIngredientString("1 dash orange bitters (optional)"), {
      name: "orange bitters",
      slug: "orange bitters",
      measure: "1 dash",
    });
    assert.equal(parseIngredientString("2 parts vodka").measure, "2 parts");
  });

  test("drops a trailing parenthetical, which is always a note", () => {
    assert.equal(parseIngredientString("1 dash orange bitters (optional)").name, "orange bitters");
  });

  test("drops everything after a comma, which is always a brand", () => {
    assert.deepEqual(parseIngredientString("Bitters, Angostura"), {
      name: "Bitters",
      slug: "bitters",
      measure: null,
    });
  });

  test("leaves a measureless ingredient alone rather than inventing one", () => {
    assert.deepEqual(parseIngredientString("gin"), {
      name: "gin",
      slug: "gin",
      measure: null,
    });
  });

  test("survives an empty string", () => {
    assert.deepEqual(parseIngredientString(""), { name: "", slug: "", measure: null });
    assert.deepEqual(parseIngredientString("   "), { name: "", slug: "", measure: null });
  });
});

describe("titleCase", () => {
  test("capitalises a drink name", () => {
    assert.equal(titleCase("tommy's margarita"), "Tommy's Margarita");
  });

  test("leaves small words lowercase, except at the start", () => {
    assert.equal(titleCase("death in the afternoon"), "Death in the Afternoon");
    assert.equal(titleCase("the last word"), "The Last Word");
  });
});

describe("externalIdFor", () => {
  test("makes a stable id from a name, since the provider gives none", () => {
    assert.equal(externalIdFor("Tommy's Margarita"), "tommy-s-margarita");
    assert.equal(externalIdFor("Corpse Reviver #2"), "corpse-reviver-2");
  });

  test("is stable: the same name always gives the same id", () => {
    assert.equal(externalIdFor("Negroni"), externalIdFor("Negroni"));
  });

  test("never returns an empty id", () => {
    // An empty id would collide with every other unnameable drink.
    assert.equal(externalIdFor("!!!"), "cocktail");
    assert.equal(externalIdFor(""), "cocktail");
  });
});
