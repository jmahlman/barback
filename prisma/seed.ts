/**
 * Optional starter data.
 *
 * Adds a well-stocked home bar and a few classic recipes to an existing
 * account, so a fresh install has something to look at.
 *
 *   SEED_EMAIL=you@example.com npm run seed
 *
 * Safe to re-run: existing items are left alone.
 */
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";
import { slugifyIngredient } from "../src/lib/ingredients";

const databaseUrl = process.env.DATABASE_URL ?? "file:./data/barback.db";
const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: databaseUrl }),
});

const INVENTORY: { name: string; category: string; quantity?: string; abv?: number }[] = [
  { name: "Beefeater London Dry Gin", category: "spirit", quantity: "750ml", abv: 40 },
  { name: "Buffalo Trace Bourbon", category: "spirit", quantity: "750ml", abv: 45 },
  { name: "Plantation 3 Stars White Rum", category: "spirit", quantity: "750ml", abv: 41 },
  { name: "Olmeca Altos Blanco Tequila", category: "spirit", quantity: "750ml", abv: 40 },
  { name: "Ketel One Vodka", category: "spirit", quantity: "750ml", abv: 40 },
  { name: "Campari", category: "liqueur", quantity: "750ml", abv: 24 },
  { name: "Cointreau", category: "liqueur", quantity: "700ml", abv: 40 },
  { name: "Luxardo Maraschino Liqueur", category: "liqueur", quantity: "750ml", abv: 32 },
  { name: "Martini Rosso Sweet Vermouth", category: "vermouth", quantity: "1L", abv: 15 },
  { name: "Dolin Dry Vermouth", category: "vermouth", quantity: "750ml", abv: 17.5 },
  { name: "Angostura Aromatic Bitters", category: "bitters", quantity: "200ml" },
  { name: "Simple Syrup", category: "syrup", quantity: "500ml" },
  { name: "Grenadine", category: "syrup", quantity: "250ml" },
  { name: "Lime Juice", category: "juice", quantity: "fresh" },
  { name: "Lemon Juice", category: "juice", quantity: "fresh" },
  { name: "Orange Juice", category: "juice" },
  { name: "Club Soda", category: "mixer" },
  { name: "Fever-Tree Tonic Water", category: "mixer" },
  { name: "Ginger Beer", category: "mixer" },
  { name: "Egg White", category: "fresh" },
  { name: "Mint", category: "fresh" },
  { name: "Maraschino Cherry", category: "garnish" },
  { name: "Olives", category: "garnish" },
];

const RECIPES = [
  {
    name: "Negroni",
    description: "Equal parts, bitter and bracing.",
    method: "stirred",
    glass: "Rocks",
    garnish: "Orange twist",
    instructions:
      "Stir all ingredients with ice until well chilled.\nStrain over a large cube in a rocks glass.\nExpress an orange twist over the top and drop it in.",
    ingredients: [
      { name: "Gin", amount: "1 oz" },
      { name: "Campari", amount: "1 oz" },
      { name: "Sweet vermouth", amount: "1 oz" },
      { name: "Orange twist", amount: "1", garnish: true },
    ],
  },
  {
    name: "Daiquiri",
    description: "Three ingredients, nowhere to hide.",
    method: "shaken",
    glass: "Coupe",
    instructions:
      "Shake hard with ice for 12 seconds.\nDouble-strain into a chilled coupe.\nNo garnish needed.",
    ingredients: [
      { name: "White rum", amount: "2 oz" },
      { name: "Lime juice", amount: "3/4 oz" },
      { name: "Simple syrup", amount: "3/4 oz" },
    ],
  },
  {
    name: "Whiskey Sour",
    description: "Silky, tart, and better with the egg.",
    method: "shaken",
    glass: "Coupe",
    garnish: "Angostura dashes",
    instructions:
      "Dry shake everything without ice to build the foam.\nAdd ice and shake again until cold.\nStrain into a coupe and dot bitters across the foam.",
    ingredients: [
      { name: "Bourbon", amount: "2 oz" },
      { name: "Lemon juice", amount: "3/4 oz" },
      { name: "Simple syrup", amount: "3/4 oz" },
      { name: "Egg white", amount: "1", optional: true },
      { name: "Angostura bitters", amount: "3 dashes", garnish: true },
    ],
  },
  {
    name: "Last Word",
    description: "Equal parts and unmistakably herbal. Needs Chartreuse.",
    method: "shaken",
    glass: "Coupe",
    instructions:
      "Shake all ingredients with ice until very cold.\nDouble-strain into a chilled coupe.",
    ingredients: [
      { name: "Gin", amount: "3/4 oz" },
      { name: "Green Chartreuse", amount: "3/4 oz" },
      { name: "Maraschino liqueur", amount: "3/4 oz" },
      { name: "Lime juice", amount: "3/4 oz" },
    ],
  },
];

function recipeSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

async function main() {
  const email = process.env.SEED_EMAIL;
  if (!email) {
    console.error(
      "Set SEED_EMAIL to the address of an account that already exists.\n" +
        "  SEED_EMAIL=you@example.com npm run seed",
    );
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No account found for ${email}. Create one in the app first.`);
    process.exit(1);
  }

  let addedItems = 0;
  for (const item of INVENTORY) {
    const slug = slugifyIngredient(item.name);
    const existing = await prisma.inventoryItem.findUnique({
      where: { userId_slug: { userId: user.id, slug } },
    });
    if (existing) continue;
    await prisma.inventoryItem.create({
      data: {
        userId: user.id,
        name: item.name,
        slug,
        category: item.category,
        quantity: item.quantity ?? null,
        abv: item.abv ?? null,
        inStock: true,
      },
    });
    addedItems += 1;
  }

  let addedRecipes = 0;
  for (const recipe of RECIPES) {
    const slug = recipeSlug(recipe.name);
    const existing = await prisma.recipe.findUnique({
      where: { userId_slug: { userId: user.id, slug } },
    });
    if (existing) continue;
    await prisma.recipe.create({
      data: {
        userId: user.id,
        name: recipe.name,
        slug,
        description: recipe.description,
        instructions: recipe.instructions,
        glass: recipe.glass ?? null,
        method: recipe.method ?? null,
        garnish: recipe.garnish ?? null,
        ingredients: {
          create: recipe.ingredients.map((ingredient, index) => ({
            name: ingredient.name,
            slug: slugifyIngredient(ingredient.name),
            amount: ingredient.amount ?? null,
            optional: "optional" in ingredient ? Boolean(ingredient.optional) : false,
            garnish: "garnish" in ingredient ? Boolean(ingredient.garnish) : false,
            position: index,
          })),
        },
      },
    });
    addedRecipes += 1;
  }

  console.log(
    `Seeded ${email}: ${addedItems} inventory item(s), ${addedRecipes} recipe(s).`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
