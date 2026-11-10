import Link from "next/link";
import { AppShell, PageBody, PageHeader } from "@/components/app-shell";
import { RecipeCard } from "@/components/recipe-card";
import { SignOutButton } from "@/components/sign-out-button";
import {
  BookIcon,
  BottleIcon,
  ChevronRightIcon,
  PlusIcon,
  SettingsIcon,
  SparkIcon,
  UsersIcon,
} from "@/components/icons";
import { db } from "@/lib/db";
import { loadRecipesWithMakeability } from "@/lib/recipe-queries";
import { hasPasswordSession, requireUser } from "@/lib/session";
import { isOwner } from "@/lib/owner";
import { pendingUpdateTag } from "@/lib/releases";
import { preferredProvider } from "@/lib/providers/registry";


export default async function HomePage() {
  const user = await requireUser();

  const [recipes, itemCount, inStockCount, owner] = await Promise.all([
    loadRecipesWithMakeability(user.id),
    db.inventoryItem.count({ where: { userId: user.id } }),
    db.inventoryItem.count({ where: { userId: user.id, inStock: true } }),
    isOwner(user.id),
  ]);
  const canSignOut = await hasPasswordSession();
  // Reads a setting; it does not call the provider.
  const providerLabel = (await preferredProvider()).label;
  const updateTag = owner ? await pendingUpdateTag() : null;

  const makeable = recipes.filter((r) => r.evaluation.makeable);
  const almost = recipes.filter((r) => r.evaluation.missing.length === 1);
  const firstName = (user.name || user.email).split(/[\s@]/)[0];

  return (
    <AppShell user={user}>
      <PageHeader
        title={`Evening, ${firstName}`}
        subtitle={
          inStockCount > 0
            ? `${inStockCount} ingredient${inStockCount === 1 ? "" : "s"} in stock · ${recipes.length} recipe${recipes.length === 1 ? "" : "s"}`
            : "Let's get your bar set up."
        }
      />

      <PageBody>
        {itemCount === 0 ? (
          <section className="card space-y-4 p-5">
            <h2 className="font-display text-xl text-bar-200">Start with your shelf</h2>
            <p className="text-sm text-bar-400">
              Add the bottles, mixers and garnishes you keep around. Barback then
              works out what you can make — from your own recipes and from{" "}
              {providerLabel}.
            </p>
            <Link href="/inventory" className="btn-primary w-full">
              <PlusIcon className="size-5" />
              Add your first bottle
            </Link>
          </section>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              href="/recipes"
              value={makeable.length}
              label={`recipe${makeable.length === 1 ? "" : "s"} you can make`}
              icon={<BookIcon className="size-5" />}
              highlight
            />
            <StatCard
              href="/inventory"
              value={inStockCount}
              label="ingredients in stock"
              icon={<BottleIcon className="size-5" />}
            />
          </div>
        )}

        {makeable.length > 0 ? (
          <section className="space-y-3">
            <SectionHeading href="/recipes" title="Ready to pour" />
            <ul className="space-y-3">
              {makeable.slice(0, 4).map((recipe) => (
                <li key={recipe.id}>
                  <RecipeCard
                    recipe={{
                      id: recipe.id,
                      name: recipe.name,
                      description: recipe.description,
                      imageUrl: recipe.imageUrl,
                      rating: recipe.rating,
                      isFavorite: recipe.isFavorite,
                      ingredientCount: recipe.ingredientCount,
                      sourceName: recipe.sourceName,
                    }}
                    evaluation={recipe.evaluation}
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {almost.length > 0 ? (
          <section className="space-y-3">
            <SectionHeading href="/recipes" title="One ingredient away" />
            <ul className="space-y-3">
              {almost.slice(0, 3).map((recipe) => (
                <li key={recipe.id}>
                  <RecipeCard
                    recipe={{
                      id: recipe.id,
                      name: recipe.name,
                      description: recipe.description,
                      imageUrl: recipe.imageUrl,
                      rating: recipe.rating,
                      isFavorite: recipe.isFavorite,
                      ingredientCount: recipe.ingredientCount,
                      sourceName: recipe.sourceName,
                    }}
                    evaluation={recipe.evaluation}
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {itemCount > 0 ? (
          <Link
            href="/discover"
            className="card flex items-center gap-4 p-5 transition-colors hover:border-bar-700 hover:bg-bar-850"
          >
            <span className="text-brass-400">
              <SparkIcon className="size-8" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-display text-lg text-bar-200">
                What else can I make?
              </span>
              <span className="block text-sm text-bar-400">
                Hundreds of cocktails from {providerLabel}, matched to your shelf.
              </span>
            </span>
            <ChevronRightIcon className="size-5 shrink-0 text-bar-400" />
          </Link>
        ) : null}

        {recipes.length === 0 && itemCount > 0 ? (
          <section className="card space-y-4 p-5">
            <h2 className="font-display text-xl text-bar-200">Your book is empty</h2>
            <p className="text-sm text-bar-400">
              Write up a drink you already make, or import one from Discover.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href="/recipes/new" className="btn-primary flex-1">
                <PlusIcon className="size-5" />
                New recipe
              </Link>
              <Link href="/discover" className="btn-secondary flex-1">
                Discover
              </Link>
            </div>
          </section>
        ) : null}

        {/* Mobile-only account controls; desktop has them in the sidebar. */}
        <section className="space-y-1 border-t border-bar-800 pt-4 md:hidden">
          <p className="mb-1 px-1 text-xs text-bar-400">{user.email}</p>
          {owner ? (
            <Link
              href="/admin"
              className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm
                font-medium text-bar-300 hover:bg-bar-850 hover:text-bar-200"
            >
              <UsersIcon className="size-5" />
              People
            </Link>
          ) : null}
          <Link
            href="/settings"
            className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm
              font-medium text-bar-300 hover:bg-bar-850 hover:text-bar-200"
          >
            <span className="relative">
              <SettingsIcon className="size-5" />
              {updateTag ? (
                <span
                  aria-hidden
                  className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-brass-400
                    ring-2 ring-bar-950"
                />
              ) : null}
            </span>
            Settings
            {updateTag ? (
              <span className="ml-auto text-xs font-normal text-brass-300">
                {updateTag} available
              </span>
            ) : null}
          </Link>
          {canSignOut ? <SignOutButton /> : null}
        </section>
      </PageBody>
    </AppShell>
  );
}

function StatCard({
  href,
  value,
  label,
  icon,
  highlight,
}: {
  href: string;
  value: number;
  label: string;
  icon: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`card flex flex-col gap-1 p-4 transition-colors hover:bg-bar-850 ${
        highlight ? "border-brass-400/30" : ""
      }`}
    >
      <span className={highlight ? "text-brass-400" : "text-bar-400"}>{icon}</span>
      <span className="font-display text-3xl text-bar-200">{value}</span>
      <span className="text-xs text-bar-400">{label}</span>
    </Link>
  );
}

function SectionHeading({ title, href }: { title: string; href: string }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="font-display text-xl text-bar-200">{title}</h2>
      <Link
        href={href}
        className="inline-flex items-center gap-1 text-sm text-bar-400 hover:text-bar-200"
      >
        See all
        <ChevronRightIcon className="size-4" />
      </Link>
    </div>
  );
}
