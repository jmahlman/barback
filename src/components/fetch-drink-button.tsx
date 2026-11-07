"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { fetchDrinkNow } from "@/actions/discover";
import { SparkIcon } from "@/components/icons";

export function FetchDrinkButton({ drinkKey }: { drinkKey: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await fetchDrinkNow(drinkKey);
            if (result.ok) {
              router.refresh();
            } else {
              setError(result.error ?? "Could not load that drink.");
            }
          })
        }
        className="btn-primary"
      >
        <SparkIcon className="size-5" />
        {pending ? "Fetching…" : "Look it up on TheCocktailDB"}
      </button>
      {error ? (
        <p role="alert" className="text-xs text-cherry-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
