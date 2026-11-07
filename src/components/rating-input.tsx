"use client";

import { StarIcon } from "@/components/icons";

export function RatingInput({
  value,
  onChange,
  label = "Rating",
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  label?: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          aria-label={`${star} star${star === 1 ? "" : "s"}`}
          aria-pressed={value === star}
          onClick={() => onChange(value === star ? null : star)}
          className={`p-1 transition-colors ${
            value && star <= value ? "text-brass-400" : "text-bar-600 hover:text-bar-400"
          }`}
        >
          <StarIcon filled={Boolean(value && star <= value)} className="size-6" />
        </button>
      ))}
      {value ? (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="ml-1 text-xs text-bar-400 underline-offset-2 hover:underline"
        >
          clear
        </button>
      ) : null}
    </div>
  );
}

/** Read-only star display. */
export function RatingStars({
  value,
  className = "size-4",
}: {
  value: number | null | undefined;
  className?: string;
}) {
  if (!value) return null;
  return (
    <span className="inline-flex items-center gap-0.5 text-brass-400" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <StarIcon
          key={star}
          filled={star <= value}
          className={`${className} ${star <= value ? "" : "text-bar-700"}`}
        />
      ))}
    </span>
  );
}
