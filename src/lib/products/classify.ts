/**
 * Turning a product listing into something a bar inventory can use. Pure
 * functions only — no I/O, no React, no database.
 *
 * Product databases are built for retail, so a bottle of gin arrives as
 * `BEEFEATER LONDON DRY GIN 750ML` in a category tree that calls it
 * "Liquor & Spirits". Neither the shouting nor the retail taxonomy is useful
 * on a shelf, so both get rewritten here.
 */

import type { CategorySlug } from "@/lib/categories";
import { titleCase } from "@/lib/providers/api-ninjas-parse";

/**
 * A trailing size, with whatever separator precedes it: "750ML",
 * ", 750 mL", " - 1.75L", " (4 oz)".
 */
const TRAILING_SIZE =
  /[\s,;|/–—-]*\(?\s*(\d+(?:[.,]\d+)?)\s*(ml|cl|dl|l|liters?|litres?|fl\.?\s*oz|oz|pt|qt|gal)\b\.?\s*\)?\s*$/iu;

/** Unit spellings we normalize on the way out. */
const UNIT_DISPLAY: Record<string, string> = {
  ml: "ml",
  cl: "cl",
  dl: "dl",
  l: "L",
  liter: "L",
  liters: "L",
  litre: "L",
  litres: "L",
  oz: "oz",
  floz: "fl oz",
  pt: "pt",
  qt: "qt",
  gal: "gal",
};

function displayUnit(raw: string): string {
  const key = raw.toLowerCase().replace(/[.\s]+/gu, "");
  return UNIT_DISPLAY[key] ?? raw.toLowerCase();
}

/** Retail noise that is never part of a bottle's name. */
const TRAILING_NOISE =
  /[\s,;|–—-]*\(?\s*(single|each|ea|bottle|btl|case of \d+|\d+\s*pack|\d+\s*ct|pack of \d+|new|nv)\s*\)?\s*$/iu;

/** Is this mostly SHOUTING? Retail feeds very often are. */
function isShouting(value: string): boolean {
  const letters = value.replace(/[^\p{L}]/gu, "");
  if (letters.length < 4) return false;
  const upper = letters.replace(/[^\p{Lu}]/gu, "").length;
  return upper / letters.length >= 0.8;
}

export interface CleanedTitle {
  /** The name to put in the form. */
  name: string;
  /** The size pulled off the end, if there was one, e.g. "750 ml". */
  size: string | null;
}

/**
 * Pull a usable bottle name, and its size, out of a retail product title.
 *
 * The size is worth extracting rather than discarding: it belongs in the
 * inventory's own quantity field, and leaving it in the name would defeat the
 * ingredient matcher, which reads the end of a name to decide what a bottle
 * stands in for.
 */
export function cleanTitle(raw: string): CleanedTitle {
  let text = raw.replace(/\s+/gu, " ").trim();
  let size: string | null = null;

  // Retail noise first: it sits outside the size in "750ml, 3 pack".
  for (let i = 0; i < 2; i += 1) {
    const stripped = text.replace(TRAILING_NOISE, "");
    if (stripped === text || !stripped) break;
    text = stripped.trim();
  }

  const match = text.match(TRAILING_SIZE);
  if (match) {
    const withoutSize = text.slice(0, match.index).trim();
    // Only accept it if something is left: "750ML" alone is not a size, it is
    // the entire name we were given.
    if (withoutSize) {
      size = `${match[1].replace(",", ".")} ${displayUnit(match[2])}`;
      text = withoutSize;
    }
  }

  text = text.replace(/[\s,;|/–—-]+$/u, "").trim();
  if (isShouting(text)) text = titleCase(text);

  return { name: text || raw.trim(), size };
}

/**
 * Which shelf a bottle belongs on, decided from the ingredient slug Barback
 * derived rather than from the retail category.
 *
 * Retail taxonomies file gin, Campari and vermouth together under spirits,
 * which is wrong for two of Barback's eleven shelves, so the upstream
 * category is consulted only when the slug says nothing useful.
 */
const SHELF_BY_BASE: Record<string, CategorySlug> = {
  // Spirits
  gin: "spirit", "sloe gin": "spirit", vodka: "spirit", rum: "spirit",
  "white rum": "spirit", "dark rum": "spirit", "spiced rum": "spirit",
  tequila: "spirit", mezcal: "spirit", brandy: "spirit", cognac: "spirit",
  armagnac: "spirit", whiskey: "spirit", whisky: "spirit", bourbon: "spirit",
  rye: "spirit", scotch: "spirit", "irish whiskey": "spirit",
  "canadian whiskey": "spirit", absinthe: "spirit", pisco: "spirit",
  cachaca: "spirit", "cachaça": "spirit", sake: "spirit", soju: "spirit",
  aquavit: "spirit", akvavit: "spirit",

  // Liqueurs
  liqueur: "liqueur", "orange liqueur": "liqueur", "coffee liqueur": "liqueur",
  "elderflower liqueur": "liqueur", "irish cream": "liqueur",
  amaretto: "liqueur", campari: "liqueur", aperol: "liqueur",
  chartreuse: "liqueur", maraschino: "liqueur", amaro: "liqueur",
  aperitif: "liqueur", "blue curacao": "liqueur", "crème de cacao": "liqueur",
  "crème de cassis": "liqueur", "crème de menthe": "liqueur",

  // Vermouth & fortified
  vermouth: "vermouth", "sweet vermouth": "vermouth",
  "dry vermouth": "vermouth", sherry: "vermouth", port: "vermouth",
  madeira: "vermouth",

  // Bitters
  bitters: "bitters", "angostura bitters": "bitters",
  "orange bitters": "bitters", "peychauds bitters": "bitters",

  // Syrups & sweeteners
  syrup: "syrup", "simple syrup": "syrup", grenadine: "syrup",
  "agave syrup": "syrup", "maple syrup": "syrup", orgeat: "syrup",
  falernum: "syrup", honey: "syrup", sugar: "syrup",

  // Juices
  juice: "juice", "lime juice": "juice", "lemon juice": "juice",
  "orange juice": "juice", "grapefruit juice": "juice",
  "pineapple juice": "juice", "cranberry juice": "juice",
  "tomato juice": "juice",

  // Mixers
  soda: "mixer", "club soda": "mixer", "tonic water": "mixer",
  "ginger beer": "mixer", "ginger ale": "mixer", cola: "mixer",
  "lemon lime soda": "mixer", water: "mixer",

  // Fresh & perishable
  cream: "fresh", milk: "fresh", egg: "fresh", "egg white": "fresh",
  "egg yolk": "fresh", mint: "fresh", lime: "fresh", lemon: "fresh",
  orange: "fresh", "coconut cream": "fresh", "cream of coconut": "fresh",

  // Garnishes
  cherry: "garnish", olives: "garnish", salt: "garnish", pepper: "garnish",
  nutmeg: "garnish", cinnamon: "garnish", "lemon twist": "garnish",
  "orange twist": "garnish", ice: "garnish",

  // Wine & beer
  wine: "wine", prosecco: "wine", champagne: "wine", cava: "wine",
  lager: "wine", stout: "wine", ale: "wine", cider: "wine",

  // Other
  coffee: "other", tea: "other", chocolate: "other",
};

/** Words in a retail category that hint at a shelf, checked in order. */
const SHELF_BY_CATEGORY: [RegExp, CategorySlug][] = [
  [/\bbitters\b/iu, "bitters"],
  [/\bvermouth|fortified\b/iu, "vermouth"],
  [/\bliqueur|cordial|apériti|aperiti\b/iu, "liqueur"],
  [/\bwine|beer|champagne|prosecco|cider\b/iu, "wine"],
  [/\bsyrup|sweetener|honey\b/iu, "syrup"],
  [/\bjuice\b/iu, "juice"],
  [/\bsoda|tonic|mixer|soft drink\b/iu, "mixer"],
  [/\bliquor|spirit|whisk|vodka|gin|rum|tequila|brandy\b/iu, "spirit"],
];

/**
 * Guess a shelf. Falls back to "other", which is always safe because the
 * person sees the select before anything is saved.
 */
export function shelfFor(slug: string, upstreamCategory?: string | null): CategorySlug {
  const direct = SHELF_BY_BASE[slug.toLowerCase()];
  if (direct) return direct;

  if (upstreamCategory) {
    for (const [pattern, shelf] of SHELF_BY_CATEGORY) {
      if (pattern.test(upstreamCategory)) return shelf;
    }
  }

  return "other";
}
