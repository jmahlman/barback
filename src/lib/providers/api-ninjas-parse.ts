import { slugifyIngredient } from "@/lib/ingredients";
import type { ProviderIngredient } from "@/lib/providers/types";

/**
 * Parsing for API Ninjas responses.
 *
 * Kept free of server-only imports so it can be exercised directly: this is
 * the part most likely to meet input it was not designed for.
 */

/**
 * A leading quantity, optionally followed by a unit and a "(3 parts)" note.
 * Requires a digit, so "Gin (London Dry)" is left alone.
 */
const MEASURE_PATTERN =
  /^\s*((?:\d+\s+)?\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?\s*[a-zA-Z.]{0,12}?)(\s*\([^)]*\))?\s+(?=\S)/;

/** Units we are willing to absorb into the measure. */
const UNITS = new Set([
  "", "ml", "cl", "l", "oz", "dash", "dashes", "ds", "pn", "pinch", "part",
  "parts", "tsp", "tbsp", "teaspoon", "teaspoons", "tablespoon", "tablespoons",
  "barspoon", "barspoons", "cup", "cups", "shot", "shots", "drop", "drops",
  "splash", "slice", "slices", "wedge", "wedges", "leaf", "leaves", "sprig",
  "sprigs", "cube", "cubes", "piece", "pieces", "bottle", "can",
]);

/**
 * Split "1 1/2 oz Tequila, Lunazul Reposado" into a measure and a name.
 *
 * Anything after a comma is almost always a brand ("Bitters, Angostura"), and
 * a trailing parenthetical is almost always a note, so both are dropped from
 * the name used for matching. The measure is preserved exactly as published.
 */
export function parseIngredientString(raw: string): ProviderIngredient {
  const text = raw.trim().replace(/\s+/g, " ");
  if (!text) return { name: "", slug: "", measure: null };

  let measure: string | null = null;
  let remainder = text;

  const match = MEASURE_PATTERN.exec(text);
  if (match) {
    const quantity = match[1].trim();
    // Only absorb a trailing word when we recognise it as a unit, so
    // "2 Lemons" keeps the word "Lemons".
    const unitMatch = /[a-zA-Z.]+$/.exec(quantity);
    const unit = unitMatch ? unitMatch[0].replace(/\.$/, "").toLowerCase() : "";
    if (UNITS.has(unit)) {
      measure = (match[1] + (match[2] ?? "")).trim();
      remainder = text.slice(match[0].length).trim();
    }
  }

  // "Tequila, Lunazul Reposado" -> "Tequila"
  let name = remainder.split(",")[0].trim();
  // "Agave syrup (equal parts agave nectar and water)" -> "Agave syrup"
  name = name.replace(/\s*\([^)]*\)\s*$/, "").trim();

  if (!name) name = remainder.trim() || text;

  return { name, slug: slugifyIngredient(name), measure };
}

/** "tommy's margarita" -> "Tommy's Margarita" */
export function titleCase(value: string): string {
  const small = new Set(["a", "an", "and", "de", "of", "the", "with", "in", "on"]);
  return value
    .split(" ")
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && small.has(lower)) return lower;
      return lower.replace(/^[\p{L}]/u, (c) => c.toUpperCase());
    })
    .join(" ");
}

/** Stable-enough identifier: the provider gives us none. */
export function externalIdFor(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "cocktail"
  );
}
