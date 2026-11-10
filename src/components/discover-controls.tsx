"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { clearCocktailCache, scanShelf, searchUpstream } from "@/actions/discover";
import { SearchIcon, SparkIcon } from "@/components/icons";
import { ConfirmButton } from "@/components/confirm-button";

/**
 * The only two controls that reach a cocktail provider. Both require a click,
 * so simply opening or refreshing Discover never calls one.
 */

export function ScanButton({
  label = "Check now",
  providerLabel = "the cocktail provider",
  variant = "primary",
}: {
  label?: string;
  /** Who is being asked, for the line shown while it waits. */
  providerLabel?: string;
  variant?: "primary" | "secondary";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [makeable, setMakeable] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            setMessage(null);
            const result = await scanShelf();
            if (result.ok) {
              setMessage(`Checked ${result.found ?? 0} cocktails.`);
              setMakeable(result.makeable ?? 0);
              router.refresh();
            } else {
              setError(result.error ?? "Could not complete the lookup.");
            }
          })
        }
        className={variant === "primary" ? "btn-primary w-full" : "btn-secondary w-full"}
      >
        <SparkIcon className="size-5" />
        {pending ? `Asking ${providerLabel}…` : label}
      </button>

      {message ? (
        <p className="text-xs text-citrus-400">
          {message}{" "}
          {makeable && makeable > 0 ? (
            <a
              href="#makeable"
              className="font-medium underline underline-offset-4 hover:text-citrus-400/80"
            >
              See the {makeable} you can make →
            </a>
          ) : (
            "Nothing on your shelf is fully stocked yet."
          )}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-cherry-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Searches the local cache as you type; only the button calls out. */
export function DiscoverSearchForm({
  defaultQuery = "",
  providerLabel = "the cocktail provider",
}: {
  defaultQuery?: string;
  providerLabel?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(defaultQuery);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-2">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const query = value.trim();
          // Local-only navigation: reads the cache, no API call.
          startTransition(() => {
            router.push(query ? `/discover?q=${encodeURIComponent(query)}` : "/discover");
          });
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-bar-400" />
          <input
            name="q"
            type="search"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Search saved cocktails…"
            aria-label="Search cached cocktails by name"
            className="field pl-10"
          />
        </div>
        <button type="submit" disabled={pending} className="btn-secondary">
          {pending ? "…" : "Search"}
        </button>
      </form>

      {/* Separate form, because this one does hit the API. */}
      <form action={searchUpstream} className="flex">
        <input type="hidden" name="q" value={value} />
        <button
          type="submit"
          disabled={!value.trim()}
          className="text-xs text-brass-300 underline-offset-4 hover:underline disabled:opacity-40 disabled:no-underline"
        >
          Not here? Look it up on {providerLabel} →
        </button>
      </form>
    </div>
  );
}

export function ClearCacheButton({ count }: { count: number }) {
  const router = useRouter();

  if (count === 0) return null;

  return (
    <ConfirmButton
      label={`Clear ${count} cached cocktails`}
      confirmLabel="Clear them"
      question={`Forget all ${count} cached cocktails?`}
      detail="Your own recipes and inventory are untouched. You can look them up again whenever you like."
      className="text-xs text-bar-400 underline-offset-4 hover:text-bar-200 hover:underline"
      busyLabel="Clearing…"
      onConfirm={async () => {
        await clearCocktailCache();
        router.refresh();
      }}
    />
  );
}
