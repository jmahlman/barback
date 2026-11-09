import Image from "next/image";
import Link from "next/link";
import { RatingStars } from "@/components/rating-input";
import { GlassIcon, StarIcon } from "@/components/icons";
import type { RecipeEvaluation } from "@/lib/matching";

export interface RecipeCardData {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  rating: number | null;
  isFavorite: boolean;
  ingredientCount: number;
  sourceName?: string | null;
}

export function RecipeCard({
  recipe,
  evaluation,
  href,
}: {
  recipe: RecipeCardData;
  evaluation?: RecipeEvaluation;
  href?: string;
}) {
  return (
    <Link
      href={href ?? `/recipes/${recipe.id}`}
      className="card group flex gap-3 p-3 transition-colors hover:border-bar-700 hover:bg-bar-850"
    >
      <div className="relative size-20 shrink-0 overflow-hidden rounded-lg border border-bar-800 bg-bar-850">
        {recipe.imageUrl ? (
          <Image
            src={recipe.imageUrl}
            alt=""
            fill
            sizes="80px"
            className="object-cover"
            unoptimized
          />
        ) : (
          <span className="flex size-full items-center justify-center text-bar-700">
            <GlassIcon className="size-8" />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <h3 className="min-w-0 flex-1 truncate font-display text-lg text-bar-200">
            {recipe.name}
          </h3>
          {recipe.isFavorite ? (
            <StarIcon filled className="mt-1 size-4 shrink-0 text-brass-400" aria-label="Favorite" />
          ) : null}
        </div>

        {recipe.description ? (
          <p className="mt-0.5 line-clamp-2 text-sm text-bar-400">{recipe.description}</p>
        ) : null}

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-bar-400">
          <RatingStars value={recipe.rating} className="size-3.5" />
          <span>
            {recipe.ingredientCount} ingredient{recipe.ingredientCount === 1 ? "" : "s"}
          </span>
          {recipe.sourceName ? <span>via {recipe.sourceName}</span> : null}
        </div>

        {evaluation ? <MakeableBadge evaluation={evaluation} /> : null}
      </div>
    </Link>
  );
}

export function MakeableBadge({ evaluation }: { evaluation: RecipeEvaluation }) {
  if (evaluation.makeable) {
    const substituted = evaluation.substitutions.length;
    return (
      <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-citrus-400/15 px-2.5 py-1 text-xs font-medium text-citrus-400">
        You can make this
        {substituted > 0 ? (
          <span className="font-normal opacity-80">
            · {substituted} substitution{substituted === 1 ? "" : "s"}
          </span>
        ) : null}
      </p>
    );
  }

  const missing = evaluation.missing;
  if (missing.length === 0) {
    return null;
  }

  const summary =
    missing.length <= 2
      ? missing.map((m) => m.name).join(" & ")
      : `${missing.length} ingredients`;

  return (
    <p
      className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        missing.length === 1
          ? "bg-brass-400/15 text-brass-300"
          : "bg-bar-800 text-bar-400"
      }`}
    >
      Missing {summary}
    </p>
  );
}
