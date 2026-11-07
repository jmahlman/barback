"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addReviewNote, deleteReviewNote } from "@/actions/recipes";
import { RatingInput, RatingStars } from "@/components/rating-input";
import { PlusIcon, TrashIcon } from "@/components/icons";

export interface ReviewNoteView {
  id: string;
  body: string;
  rating: number | null;
  madeOn: string;
}

export function ReviewNotes({
  recipeId,
  notes,
}: {
  recipeId: string;
  notes: ReviewNoteView[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const today = new Date().toISOString().slice(0, 10);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl text-bar-200">Tasting notes</h2>
        {!open ? (
          <button type="button" onClick={() => setOpen(true)} className="btn-ghost">
            <PlusIcon className="size-5" />
            Add note
          </button>
        ) : null}
      </div>

      {open ? (
        <form
          action={(formData) => {
            formData.set("rating", rating === null ? "" : String(rating));
            startTransition(async () => {
              const result = await addReviewNote(recipeId, formData);
              if (result.ok) {
                setOpen(false);
                setRating(null);
                setError(null);
                router.refresh();
              } else {
                setError(result.fieldErrors?.body ?? result.error ?? "Could not save that note.");
              }
            });
          }}
          className="card space-y-3 p-3"
        >
          <div>
            <label className="label" htmlFor="body">
              How was it?
            </label>
            <textarea
              id="body"
              name="body"
              rows={3}
              required
              className="field resize-y"
              placeholder="Chartreuse dominated. Try 1/2 oz next time, and a bigger lime."
            />
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <span className="label mb-0">Rating for this one</span>
              <RatingInput value={rating} onChange={setRating} label="Rating for this note" />
            </div>
            <div>
              <label className="label" htmlFor="madeOn">
                Made on
              </label>
              <input
                id="madeOn"
                name="madeOn"
                type="date"
                defaultValue={today}
                max={today}
                className="field"
              />
            </div>
          </div>

          {error ? (
            <p role="alert" className="text-sm text-cherry-400">
              {error}
            </p>
          ) : null}

          <div className="flex gap-2">
            <button type="submit" disabled={pending} className="btn-primary flex-1">
              {pending ? "Saving…" : "Save note"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
              className="btn-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {notes.length === 0 && !open ? (
        <p className="text-sm text-bar-400">
          No notes yet. Make it once and write down what you&apos;d change.
        </p>
      ) : null}

      <ul className="space-y-2">
        {notes.map((note) => (
          <li key={note.id} className="card p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <time className="text-xs text-bar-400" dateTime={note.madeOn}>
                  {new Date(note.madeOn).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </time>
                <RatingStars value={note.rating} className="size-3.5" />
              </div>
              <button
                type="button"
                aria-label="Delete note"
                onClick={() => {
                  if (!confirm("Delete this note?")) return;
                  startTransition(async () => {
                    await deleteReviewNote(note.id);
                    router.refresh();
                  });
                }}
                className="btn-ghost -mr-2 -mt-1 size-9 shrink-0 p-0 text-bar-400"
              >
                <TrashIcon className="size-4" />
              </button>
            </div>
            <p className="mt-1.5 whitespace-pre-wrap text-sm text-bar-200">{note.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
