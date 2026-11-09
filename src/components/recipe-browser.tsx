"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { RecipeCard } from "@/components/recipe-card";
import { EmptyState } from "@/components/empty-state";
import { BookIcon, PlusIcon, SearchIcon } from "@/components/icons";
import type { RecipeListEntry } from "@/lib/recipe-queries";

type Filter = "all" | "makeable" | "favorites" | "close";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "makeable", label: "Can make" },
  { key: "close", label: "One away" },
  { key: "favorites", label: "Favorites" },
];

export function RecipeBrowser({ recipes }: { recipes: RecipeListEntry[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(
    () => ({
      all: recipes.length,
      makeable: recipes.filter((r) => r.evaluation.makeable).length,
      close: recipes.filter((r) => r.evaluation.missing.length === 1).length,
      favorites: recipes.filter((r) => r.isFavorite).length,
    }),
    [recipes],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return recipes.filter((recipe) => {
      if (filter === "makeable" && !recipe.evaluation.makeable) return false;
      if (filter === "close" && recipe.evaluation.missing.length !== 1) return false;
      if (filter === "favorites" && !recipe.isFavorite) return false;
      if (!q) return true;
      return (
        recipe.name.toLowerCase().includes(q) ||
        (recipe.description ?? "").toLowerCase().includes(q) ||
        recipe.evaluation.ingredients.some((i) => i.name.toLowerCase().includes(q))
      );
    });
  }, [recipes, query, filter]);

  if (recipes.length === 0) {
    return (
      <EmptyState
        icon={<BookIcon className="size-12" />}
        title="No recipes yet"
        body="Write up a drink you already make, or import one from TheCocktailDB on the Discover tab."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Link href="/recipes/new" className="btn-primary">
              <PlusIcon className="size-5" />
              New recipe
            </Link>
            <Link href="/discover" className="btn-secondary">
              Browse Discover
            </Link>
          </div>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-bar-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search recipes and ingredients…"
          aria-label="Search recipes"
          className="field pl-10"
        />
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            aria-pressed={filter === key}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === key
                ? "border-brass-400 bg-brass-400/15 text-brass-300"
                : "border-bar-700 bg-bar-850 text-bar-300 hover:bg-bar-800"
            }`}
          >
            {label} {counts[key]}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title="Nothing here"
          body={
            filter === "makeable"
              ? "Nothing in your book is fully stocked right now. Check the Discover tab or add to your inventory."
              : "Try a different search or filter."
          }
        />
      ) : (
        <ul className="space-y-3">
          {visible.map((recipe) => (
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
      )}
    </div>
  );
}
