"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteRecipe, setRating, toggleFavorite } from "@/actions/recipes";
import { quickAddIngredients } from "@/actions/inventory";
import { RatingInput } from "@/components/rating-input";
import { CartIcon, StarIcon, TrashIcon } from "@/components/icons";
import { ConfirmButton } from "@/components/confirm-button";

export function FavoriteButton({
  id,
  isFavorite,
}: {
  id: string;
  isFavorite: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={isFavorite}
      aria-label={isFavorite ? "Remove from favourites" : "Add to favourites"}
      onClick={() =>
        startTransition(async () => {
          await toggleFavorite(id);
          router.refresh();
        })
      }
      className={`btn ${
        isFavorite
          ? "border border-brass-400/40 bg-brass-400/15 text-brass-300"
          : "border border-bar-700 bg-bar-850 text-bar-300"
      } size-11 p-0`}
    >
      <StarIcon filled={isFavorite} className="size-5" />
    </button>
  );
}

export function RatingControl({ id, rating }: { id: string; rating: number | null }) {
  const router = useRouter();
  const [value, setValue] = useState(rating);
  const [, startTransition] = useTransition();

  return (
    <RatingInput
      label="Your rating"
      value={value}
      onChange={(next) => {
        setValue(next);
        startTransition(async () => {
          await setRating(id, next);
          router.refresh();
        });
      }}
    />
  );
}

export function DeleteRecipeButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();

  return (
    <ConfirmButton
      label="Delete recipe"
      confirmLabel="Delete it"
      question={`Delete "${name}"?`}
      detail="This removes the recipe, its photo and its tasting notes. It cannot be undone."
      icon={<TrashIcon className="size-5" />}
      className="btn-danger w-full"
      busyLabel="Deleting…"
      onConfirm={async () => {
        const result = await deleteRecipe(id);
        if (result.ok) {
          router.push("/recipes");
          router.refresh();
        }
      }}
    />
  );
}


/** Adds everything you are missing straight into the inventory. */
export function AddMissingButton({ names }: { names: string[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  if (names.length === 0) return null;

  return (
    <button
      type="button"
      disabled={pending || done}
      onClick={() =>
        startTransition(async () => {
          const result = await quickAddIngredients(names);
          if (result.ok) {
            setDone(true);
            router.refresh();
          }
        })
      }
      className="btn-secondary w-full"
    >
      <CartIcon className="size-5" />
      {done
        ? "Added to inventory"
        : pending
          ? "Adding…"
          : `Add ${names.length} missing ${names.length === 1 ? "item" : "items"} to inventory`}
    </button>
  );
}
