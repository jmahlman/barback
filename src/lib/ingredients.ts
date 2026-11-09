/**
 * Ingredient name normalisation and matching.
 *
 * Recipes (especially ones imported from TheCocktailDB) name things loosely:
 * "Fresh lime juice", "Juice of a lime", "Lime juice" and "limes" all mean the
 * same bottle on your shelf. Everything is reduced to a `slug` so inventory and
 * recipes can be compared, then a small amount of bartender knowledge handles
 * families ("rum" covers "white rum") and common substitutions.
 */

/** Variant spelling -> canonical slug. */
const ALIASES: Record<string, string> = {
  // Citrus
  lime: "lime juice",
  limes: "lime juice",
  "fresh lime juice": "lime juice",
  "juice of a lime": "lime juice",
  "lime juice fresh": "lime juice",
  "fresh lime": "lime juice",
  lemon: "lemon juice",
  lemons: "lemon juice",
  "fresh lemon juice": "lemon juice",
  "juice of a lemon": "lemon juice",
  "fresh lemon": "lemon juice",
  orange: "orange juice",
  oranges: "orange juice",
  "fresh orange juice": "orange juice",
  grapefruit: "grapefruit juice",
  "fresh grapefruit juice": "grapefruit juice",

  // Sweeteners
  "sugar syrup": "simple syrup",
  "sugar sirup": "simple syrup",
  "simple sirup": "simple syrup",
  "rich simple syrup": "simple syrup",
  gomme: "simple syrup",
  "gomme syrup": "simple syrup",
  "granulated sugar": "sugar",
  "caster sugar": "sugar",
  "superfine sugar": "sugar",
  "powdered sugar": "sugar",
  "sugar cube": "sugar",
  "sugar cubes": "sugar",
  "honey syrup": "honey",
  "agave nectar": "agave syrup",
  // Deliberately no bare "agave" alias: it appears as a qualifier on spirits
  // ("tequila 100% agave"), where collapsing it to a sweetener is wrong.

  // Bitters
  "bitters assorted": "bitters",
  "aromatic bitters": "angostura bitters",
  "angostura": "angostura bitters",
  "peychaud bitters": "peychauds bitters",
  "peychauds": "peychauds bitters",

  // Spirits & common brand shorthands
  "london dry gin": "gin",
  "dry gin": "gin",
  "old tom gin": "gin",
  "plymouth gin": "gin",
  "light rum": "white rum",
  "white rum": "white rum",
  "silver rum": "white rum",
  "gold rum": "dark rum",
  "golden rum": "dark rum",
  "dark rum": "dark rum",
  "añejo rum": "dark rum",
  "anejo rum": "dark rum",
  "bourbon whiskey": "bourbon",
  "rye whiskey": "rye",
  "rye whisky": "rye",
  "scotch whisky": "scotch",
  "scotch whiskey": "scotch",
  "blended scotch": "scotch",
  "irish whiskey": "irish whiskey",
  "canadian whisky": "canadian whiskey",
  "tennessee whiskey": "bourbon",
  "blanco tequila": "tequila",
  "silver tequila": "tequila",
  "white tequila": "tequila",
  "reposado tequila": "tequila",
  "tequila reposado": "tequila",
  "tequila blanco": "tequila",
  "tequila silver": "tequila",

  // Liqueurs
  "triple sec": "orange liqueur",
  cointreau: "orange liqueur",
  "grand marnier": "orange liqueur",
  curacao: "orange liqueur",
  "blue curacao": "blue curacao",
  "orange curacao": "orange liqueur",
  "dry curacao": "orange liqueur",
  "maraschino liqueur": "maraschino",
  luxardo: "maraschino",
  "creme de cacao": "crème de cacao",
  "creme de menthe": "crème de menthe",
  "creme de cassis": "crème de cassis",
  "coffee liqueur": "coffee liqueur",
  kahlua: "coffee liqueur",
  "tia maria": "coffee liqueur",
  "elderflower liqueur": "elderflower liqueur",
  "st germain": "elderflower liqueur",
  "st-germain": "elderflower liqueur",
  amaretto: "amaretto",
  "disaronno": "amaretto",
  "irish cream": "irish cream",
  baileys: "irish cream",
  "bailey's irish cream": "irish cream",

  // Vermouth & aperitifs
  "sweet vermouth": "sweet vermouth",
  "red vermouth": "sweet vermouth",
  "rosso vermouth": "sweet vermouth",
  "vermouth rosso": "sweet vermouth",
  "italian vermouth": "sweet vermouth",
  "dry vermouth": "dry vermouth",
  "white vermouth": "dry vermouth",
  "french vermouth": "dry vermouth",
  "vermouth dry": "dry vermouth",
  "aperol": "aperol",
  "campari": "campari",

  // Mixers
  "soda water": "club soda",
  "sparkling water": "club soda",
  "seltzer": "club soda",
  "carbonated water": "club soda",
  "tonic": "tonic water",
  "ginger ale": "ginger ale",
  "ginger beer": "ginger beer",
  coke: "cola",
  "coca cola": "cola",
  "coca-cola": "cola",
  "lemon lime soda": "lemon lime soda",
  sprite: "lemon lime soda",
  "7 up": "lemon lime soda",
  "7-up": "lemon lime soda",

  // Dairy & eggs
  "egg white": "egg white",
  "egg whites": "egg white",
  "white of egg": "egg white",
  "egg yolk": "egg yolk",
  egg: "egg",
  eggs: "egg",
  "heavy cream": "cream",
  "double cream": "cream",
  "single cream": "cream",
  "light cream": "cream",
  "whipping cream": "cream",
  "half and half": "cream",
  "whole milk": "milk",

  // Garnishes
  "maraschino cherry": "cherry",
  "maraschino cherries": "cherry",
  cherries: "cherry",
  "cocktail cherry": "cherry",
  olive: "olives",
  olives: "olives",
  "mint sprig": "mint",
  "mint leaves": "mint",
  "fresh mint": "mint",
  "nutmeg grated": "nutmeg",

  // Misc
  water: "water",
  ice: "ice",
  "crushed ice": "ice",
  "ice cubes": "ice",
};

/**
 * Generic ingredient -> the specific bottles it can stand in for.
 * Having the generic in your inventory satisfies any of its members, and
 * having a member satisfies the generic.
 */
const FAMILIES: Record<string, string[]> = {
  rum: ["white rum", "dark rum", "spiced rum", "overproof rum", "rhum agricole"],
  whiskey: ["bourbon", "rye", "scotch", "irish whiskey", "canadian whiskey", "japanese whiskey"],
  whisky: ["bourbon", "rye", "scotch", "irish whiskey", "canadian whiskey", "japanese whiskey"],
  tequila: ["mezcal"],
  "orange liqueur": ["blue curacao"],
  bitters: ["angostura bitters", "peychauds bitters", "orange bitters"],
  vermouth: ["sweet vermouth", "dry vermouth", "blanc vermouth"],
  citrus: ["lemon juice", "lime juice"],
  juice: ["lemon juice", "lime juice", "orange juice", "grapefruit juice", "pineapple juice", "cranberry juice", "tomato juice"],
  soda: ["club soda", "tonic water", "ginger ale", "ginger beer", "cola", "lemon lime soda"],
  sweetener: ["simple syrup", "sugar", "honey", "agave syrup", "maple syrup"],
};

/** Reverse index: specific slug -> generics that cover it. */
const GENERICS_FOR = new Map<string, Set<string>>();
for (const [generic, members] of Object.entries(FAMILIES)) {
  for (const member of members) {
    const set = GENERICS_FOR.get(member) ?? new Set<string>();
    set.add(generic);
    GENERICS_FOR.set(member, set);
  }
}

/** Interchangeable in a pinch. Symmetric. */
const SUBSTITUTIONS: string[][] = [
  ["simple syrup", "sugar", "agave syrup", "honey"],
  ["lemon juice", "lime juice"],
  ["club soda", "sparkling water"],
  ["cream", "milk"],
  ["bourbon", "rye"],
  ["cherry", "olives"],
];

const SUBSTITUTES_FOR = new Map<string, Set<string>>();
for (const group of SUBSTITUTIONS) {
  for (const member of group) {
    const set = SUBSTITUTES_FOR.get(member) ?? new Set<string>();
    for (const other of group) if (other !== member) set.add(other);
    SUBSTITUTES_FOR.set(member, set);
  }
}

/**
 * Base ingredients a bottle can be reduced to. Home bars are full of
 * "Beefeater London Dry Gin" and "Buffalo Trace Bourbon"; what matters for
 * matching is the last part. Built from the alias targets plus the bases that
 * have no alias of their own.
 */
const EXTRA_BASES = [
  "gin", "vodka", "rum", "tequila", "mezcal", "brandy", "cognac", "armagnac",
  "whiskey", "whisky", "bourbon", "rye", "scotch", "absinthe", "pisco",
  "cachaca", "cachaça", "sake", "soju", "aquavit", "akvavit", "sloe gin",
  "amaro", "aperitif", "sherry", "port", "madeira", "prosecco", "champagne",
  "cava", "lager", "stout", "ale", "cider", "wine",
  "vermouth", "bitters", "liqueur", "syrup", "juice", "soda", "tonic water",
  "ginger beer", "ginger ale", "cola", "club soda", "cream", "milk", "egg",
  "sugar", "honey", "mint", "cherry", "olives", "salt", "pepper", "nutmeg",
  "cinnamon", "coffee", "tea", "chocolate", "coconut cream", "cream of coconut",
  "orange liqueur", "coffee liqueur", "elderflower liqueur", "irish cream",
  "amaretto", "campari", "aperol", "chartreuse", "maraschino", "sweet vermouth",
  "dry vermouth", "angostura bitters", "orange bitters", "peychauds bitters",
  "simple syrup", "grenadine", "agave syrup", "maple syrup", "orgeat",
  "falernum", "lime juice", "lemon juice", "orange juice", "grapefruit juice",
  "pineapple juice", "cranberry juice", "tomato juice", "white rum", "dark rum",
  "spiced rum", "irish whiskey", "canadian whiskey", "egg white", "egg yolk",
];

/** Every string we are willing to collapse a longer name down to. */
const KNOWN_BASES = new Set<string>([...Object.values(ALIASES), ...EXTRA_BASES]);

/**
 * Collapse "beefeater london dry gin" to "gin" by finding the longest trailing
 * phrase we recognise. Returns null when nothing is recognised.
 */
function baseFromSuffix(words: string[]): string | null {
  // Longest suffix first, but never the whole phrase (that was already tried).
  for (let start = 1; start < words.length; start += 1) {
    const suffix = words.slice(start).join(" ");
    if (ALIASES[suffix]) return ALIASES[suffix];
    if (KNOWN_BASES.has(suffix)) return suffix;
  }
  return null;
}

/** Noise words that never help identify an ingredient. */
const NOISE = new Set([
  "fresh", "freshly", "squeezed", "chilled", "cold", "hot", "warm", "good",
  "quality", "premium", "optional", "to", "taste", "for", "garnish", "splash",
  "dash", "dashes", "of", "a", "an", "the", "some", "or", "and", "plus",
  "about", "approx", "approximately", "well", "very", "extra", "fill", "with",
  "topped", "top", "up", "your", "favourite", "favorite", "any", "style",
]);

/**
 * Citrus whose garnishes are a piece of the fruit rather than a measure of
 * it. A twist, a wedge and a slice are all units of quantity elsewhere
 * ("1 twist of orange"), so without this they reduce to the bare fruit and
 * become indistinguishable from a bottle of its juice.
 */
const CITRUS = new Set(["lime", "lemon", "orange", "grapefruit"]);

const CITRUS_GARNISH_FORMS = new Set([
  "peel",
  "zest",
  "twist",
  "wedge",
  "wheel",
  "slice",
  "round",
  "spiral",
]);

/**
 * Read a citrus garnish out of a phrase, in either word order.
 *
 * Returns the fruit and the canonical singular form, so "2 lemon wedges" and
 * "wedge of lemon" land on the same key.
 */
export function citrusGarnish(phrase: string): { fruit: string; slug: string } | null {
  const words = phrase.split(" ").filter((w) => w !== "of");
  if (words.length !== 2) return null;

  const singular = (word: string) => (word.endsWith("s") ? word.slice(0, -1) : word);
  const [first, second] = words;

  for (const [fruit, form] of [
    [first, second],
    [second, first],
  ]) {
    if (!CITRUS.has(singular(fruit))) continue;
    const shape = singular(form);
    if (CITRUS_GARNISH_FORMS.has(shape)) {
      return { fruit: singular(fruit), slug: `${singular(fruit)} ${shape}` };
    }
  }
  return null;
}

/** The fruit a citrus-garnish slug is a piece of, or null. */
export function citrusGarnishFruit(slug: string): string | null {
  return citrusGarnish(slug)?.fruit ?? null;
}

const MEASURE_WORDS = new Set([
  "oz", "ounce", "ounces", "ml", "cl", "l", "liter", "litre", "litres",
  "tsp", "teaspoon", "teaspoons", "tbsp", "tablespoon", "tablespoons",
  "cup", "cups", "part", "parts", "shot", "shots", "jigger", "jiggers",
  "barspoon", "barspoons", "drop", "drops", "pinch", "cube", "cubes",
  "bottle", "bottles", "can", "cans", "glass", "sprig", "sprigs", "leaf",
  "leaves", "slice", "slices", "wedge", "wedges", "piece", "pieces", "twist",
]);

/**
 * Reduce a free-text ingredient name to a stable match key.
 * "2 oz Fresh Lime Juice (optional)" -> "lime juice"
 */
export function slugifyIngredient(raw: string): string {
  let text = raw
    .toLowerCase()
    .normalize("NFC")
    // drop parentheticals: "gin (london dry)" -> "gin"
    .replace(/\([^)]*\)/g, " ")
    // drop fractions, decimals, ranges and vulgar fractions
    .replace(/[0-9]+\s*\/\s*[0-9]+/g, " ")
    .replace(/[¼-¾⅐-⅞]/g, " ")
    .replace(/[0-9]+([.,][0-9]+)?/g, " ")
    // normalise punctuation but keep accented letters
    .replace(/['’]s\b/g, "")
    .replace(/[^\p{L}\s-]/gu, " ")
    .replace(/[-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Before anything is stripped: a piece of citrus is the ingredient, not a
  // quantity of one. "lemon twist" must survive the measure-word filter that
  // would otherwise read "twist" as a unit and leave a bare "lemon".
  const whole = text.split(" ").filter(Boolean).join(" ");
  const garnish = citrusGarnish(whole);
  if (garnish) return garnish.slug;

  let words = text.split(" ").filter(Boolean).filter((w) => !MEASURE_WORDS.has(w));

  // Try the alias table before stripping noise, so phrasings that depend on
  // small words ("juice of a lemon") still resolve.
  const phrase = words.join(" ").trim();
  if (phrase && ALIASES[phrase]) {
    words = ALIASES[phrase].split(" ");
  } else {
    // Strip noise words, but never strip everything away.
    const meaningful = words.filter((w) => !NOISE.has(w));
    if (meaningful.length > 0) words = meaningful;

    // "juice lemon" -> "lemon juice": put the modifier first.
    if (words.length === 2 && words[0] === "juice") {
      words = [words[1], words[0]];
    }
  }

  text = words.join(" ").trim();
  if (!text) return "";

  // Resolve aliases, following at most a couple of hops.
  for (let i = 0; i < 3; i += 1) {
    const mapped = ALIASES[text];
    if (!mapped || mapped === text) break;
    text = mapped;
  }

  // Still a long brand-y name? Fall back to the base ingredient it ends with.
  if (!KNOWN_BASES.has(text)) {
    const base = baseFromSuffix(text.split(" "));
    if (base) text = base;
  }

  return text;
}

/**
 * Is this slug something recipes are actually likely to ask for?
 *
 * `slugifyIngredient` always returns something, but for an unrecognised name
 * that something is the whole cleaned phrase, which will match no recipe. The
 * inventory form uses this to warn that a bottle needs a match key set by
 * hand -- most often after a barcode scan, since a machine-generated product
 * title is far likelier to slugify badly than a name someone typed.
 */
export function isKnownBase(slug: string): boolean {
  return KNOWN_BASES.has(slug);
}

/** Human-friendly display name for a slug. */
export function prettifyIngredient(slug: string): string {
  return slug.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

/** How an inventory slug satisfied a recipe slug. */
export type MatchKind = "exact" | "family" | "partial" | "substitute";

export interface IngredientMatch {
  kind: MatchKind;
  /** The inventory slug that covered the requirement. */
  inventorySlug: string;
}

function wordSet(slug: string): Set<string> {
  return new Set(slug.split(" ").filter(Boolean));
}

/**
 * Does `inventorySlug` cover `recipeSlug`?
 *
 * `freshSlugs` are the items shelved as fresh produce or garnishes — the
 * whole fruit rather than a bottle. Without it there is no way to tell a lime
 * from a carton of lime juice, since both are recorded as "lime juice".
 */
function covers(
  inventorySlug: string,
  recipeSlug: string,
  freshSlugs?: ReadonlySet<string>,
): MatchKind | null {
  if (!inventorySlug || !recipeSlug) return null;
  if (inventorySlug === recipeSlug) return "exact";

  // Family: "rum" in stock covers "white rum", and vice versa.
  if (FAMILIES[inventorySlug]?.includes(recipeSlug)) return "family";
  if (GENERICS_FOR.get(inventorySlug)?.has(recipeSlug)) return "family";

  // Partial: every word of the recipe requirement appears in the stocked item
  // ("bourbon" needed, "buffalo trace bourbon" stocked) or the other way round
  // ("london dry gin" needed, "gin" stocked).
  const inv = wordSet(inventorySlug);
  const rec = wordSet(recipeSlug);
  const recipeInInventory = [...rec].every((w) => inv.has(w));
  const inventoryInRecipe = [...inv].every((w) => rec.has(w));
  if (recipeInInventory || inventoryInRecipe) return "partial";

  if (SUBSTITUTES_FOR.get(inventorySlug)?.has(recipeSlug)) return "substitute";

  // A piece of citrus has to come off a piece of citrus. The fruit is
  // recorded as its juice, so the shelf it sits on is what separates a lime
  // in the fridge from a bottle of Rose's.
  const fruit = citrusGarnishFruit(recipeSlug);
  if (fruit && freshSlugs?.has(inventorySlug)) {
    const asJuice = `${fruit} juice`;
    if (inventorySlug === asJuice || inventorySlug === fruit) return "exact";
    // Lemons and limes already stand in for each other.
    if (SUBSTITUTES_FOR.get(inventorySlug)?.has(asJuice)) return "substitute";
  }

  return null;
}

const KIND_RANK: Record<MatchKind, number> = {
  exact: 0,
  family: 1,
  partial: 2,
  substitute: 3,
};

/**
 * Find the best inventory item covering a recipe requirement.
 * `inventorySlugs` should contain only in-stock items.
 */
export function findMatch(
  recipeSlug: string,
  inventorySlugs: Iterable<string>,
  freshSlugs?: ReadonlySet<string>,
): IngredientMatch | null {
  let best: IngredientMatch | null = null;
  for (const inventorySlug of inventorySlugs) {
    const kind = covers(inventorySlug, recipeSlug, freshSlugs);
    if (!kind) continue;
    if (!best || KIND_RANK[kind] < KIND_RANK[best.kind]) {
      best = { kind, inventorySlug };
      if (kind === "exact") break;
    }
  }
  return best;
}

/** Ingredients so common we assume you have them rather than nag about them. */
export const PANTRY_STAPLES: ReadonlySet<string> = new Set([
  "ice",
  "water",
  "salt",
  "pepper",
]);
