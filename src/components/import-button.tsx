"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { importExternalRecipe } from "@/actions/recipes";
import { BookIcon, CheckIcon, PlusIcon } from "@/components/icons";

export function ImportButton({
  drinkKey,
  imported,
  variant = "primary",
}: {
  drinkKey: string;
  imported: boolean;
  variant?: "primary" | "compact";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const alreadyThere = imported || Boolean(savedId);

  if (alreadyThere) {
    return (
      <button
        type="button"
        onClick={() => router.push(savedId ? `/recipes/${savedId}` : "/recipes")}
        className={variant === "compact" ? "btn-ghost" : "btn-secondary w-full"}
      >
        <BookIcon className="size-5" />
        In your book
      </button>
    );
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await importExternalRecipe(drinkKey);
            if (result.ok) {
              setSavedId(result.id ?? null);
              router.refresh();
            } else {
              setError(result.error ?? "Could not save that recipe.");
            }
          })
        }
        className={variant === "compact" ? "btn-ghost" : "btn-primary w-full"}
      >
        {pending ? <CheckIcon className="size-5" /> : <PlusIcon className="size-5" />}
        {pending ? "Saving…" : "Save to my book"}
      </button>
      {error ? (
        <p role="alert" className="text-xs text-cherry-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
