"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { METHODS } from "@/lib/categories";
import { CameraIcon, PlusIcon, XIcon } from "@/components/icons";
import { RatingInput } from "@/components/rating-input";
import type { ActionResult } from "@/actions/inventory";
import { downscaleImage } from "@/lib/image-resize";

interface IngredientRow {
  key: string;
  name: string;
  amount: string;
  optional: boolean;
  garnish: boolean;
}

export interface RecipeFormValues {
  name: string;
  description: string | null;
  instructions: string;
  notes: string | null;
  glass: string | null;
  method: string | null;
  garnish: string | null;
  rating: number | null;
  isFavorite: boolean;
  imageUrl: string | null;
  ingredients: {
    name: string;
    amount: string | null;
    optional: boolean;
    garnish: boolean;
  }[];
}

let rowCounter = 0;
const nextKey = () => `row-${(rowCounter += 1)}`;

export function RecipeForm({
  initial,
  action,
  submitLabel = "Save recipe",
  cancelHref,
}: {
  initial?: RecipeFormValues;
  action: (formData: FormData) => Promise<ActionResult & { id?: string }>;
  submitLabel?: string;
  cancelHref: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  const [rows, setRows] = useState<IngredientRow[]>(() =>
    initial?.ingredients.length
      ? initial.ingredients.map((i) => ({
          key: nextKey(),
          name: i.name,
          amount: i.amount ?? "",
          optional: i.optional,
          garnish: i.garnish,
        }))
      : [
          { key: nextKey(), name: "", amount: "", optional: false, garnish: false },
          { key: nextKey(), name: "", amount: "", optional: false, garnish: false },
        ],
  );

  const [rating, setRating] = useState<number | null>(initial?.rating ?? null);
  const [isFavorite, setIsFavorite] = useState(initial?.isFavorite ?? false);
  const [imagePreview, setImagePreview] = useState<string | null>(initial?.imageUrl ?? null);
  const [removeImage, setRemoveImage] = useState(false);
  const [shrinking, setShrinking] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const fieldError = (name: string) => result?.fieldErrors?.[name];

  const updateRow = (key: string, patch: Partial<IngredientRow>) =>
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const addRow = () =>
    setRows((current) => [
      ...current,
      { key: nextKey(), name: "", amount: "", optional: false, garnish: false },
    ]);

  const removeRow = (key: string) =>
    setRows((current) => (current.length > 1 ? current.filter((r) => r.key !== key) : current));

  return (
    <form
      action={(formData) => {
        // Ingredients travel as JSON so the server gets structured rows.
        const payload = rows
          .filter((r) => r.name.trim())
          .map((r) => ({
            name: r.name.trim(),
            amount: r.amount.trim() || undefined,
            optional: r.optional,
            garnish: r.garnish,
          }));
        formData.set("ingredients", JSON.stringify(payload));
        formData.set("rating", rating === null ? "" : String(rating));
        formData.set("isFavorite", String(isFavorite));
        formData.set("removeImage", String(removeImage));

        startTransition(async () => {
          const res = await action(formData);
          setResult(res);
          if (res.ok && res.id) {
            router.push(`/recipes/${res.id}`);
            router.refresh();
          }
        });
      }}
      className="space-y-6"
    >
      {/* Photo */}
      <div>
        <span className="label">Photo</span>
        <div className="flex items-center gap-3">
          <div className="relative size-24 shrink-0 overflow-hidden rounded-xl border border-bar-700 bg-bar-850">
            {imagePreview ? (
              <Image
                src={imagePreview}
                alt=""
                fill
                sizes="96px"
                className="object-cover"
                unoptimized
              />
            ) : (
              <span className="flex size-full items-center justify-center text-bar-600">
                <CameraIcon className="size-8" />
              </span>
            )}
          </div>
          <div className="space-y-2">
            <input
              ref={fileRef}
              id="image"
              name="image"
              type="file"
              accept="image/*"
              // On phones this offers the camera as well as the library.
              capture={undefined}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setImagePreview(URL.createObjectURL(file));
                setRemoveImage(false);

                // Shrink before the form is ever submitted. A photo straight
                // off a phone is routinely several megabytes, which is slow
                // to send and can exceed what a server action will accept —
                // and that failure happens too early for Barback to explain
                // itself. The resized file is put back on the input so the
                // ordinary form submission carries it.
                setShrinking(true);
                void downscaleImage(file)
                  .then((smaller) => {
                    if (smaller === file || !fileRef.current) return;
                    const transfer = new DataTransfer();
                    transfer.items.add(smaller);
                    fileRef.current.files = transfer.files;
                  })
                  .finally(() => setShrinking(false));
              }}
              className="block w-full text-sm text-bar-400
                file:mr-3 file:rounded-lg file:border-0 file:bg-bar-800
                file:px-3 file:py-2 file:text-sm file:text-bar-200"
            />
            {shrinking ? (
              <p className="text-xs text-bar-400">Resizing the photo…</p>
            ) : null}
            {imagePreview ? (
              <button
                type="button"
                onClick={() => {
                  setImagePreview(null);
                  setRemoveImage(true);
                  if (fileRef.current) fileRef.current.value = "";
                }}
                className="text-xs text-cherry-400 underline-offset-2 hover:underline"
              >
                Remove photo
              </button>
            ) : null}
          </div>
        </div>
        {fieldError("image") ? (
          <p className="mt-1 text-sm text-cherry-400">{fieldError("image")}</p>
        ) : null}
      </div>

      <div>
        <label className="label" htmlFor="name">
          Name
        </label>
        <input
          id="name"
          name="name"
          required
          defaultValue={initial?.name ?? ""}
          className="field"
          placeholder="Last Word"
        />
        {fieldError("name") ? (
          <p className="mt-1 text-sm text-cherry-400">{fieldError("name")}</p>
        ) : null}
      </div>

      <div>
        <label className="label" htmlFor="description">
          One-line description
        </label>
        <input
          id="description"
          name="description"
          defaultValue={initial?.description ?? ""}
          className="field"
          placeholder="Equal parts, herbal and sharp"
        />
      </div>

      {/* Ingredients */}
      <fieldset className="space-y-3">
        <legend className="label">Ingredients</legend>
        {fieldError("ingredients") ? (
          <p className="text-sm text-cherry-400">{fieldError("ingredients")}</p>
        ) : null}

        <ul className="space-y-2">
          {rows.map((row, index) => (
            <li key={row.key} className="rounded-xl border border-bar-800 bg-bar-850/50 p-2">
              <div className="flex gap-2">
                <input
                  value={row.amount}
                  onChange={(e) => updateRow(row.key, { amount: e.target.value })}
                  className="field w-24 shrink-0"
                  placeholder="3/4 oz"
                  aria-label={`Amount for ingredient ${index + 1}`}
                />
                <input
                  value={row.name}
                  onChange={(e) => updateRow(row.key, { name: e.target.value })}
                  className="field min-w-0 flex-1"
                  placeholder="Green Chartreuse"
                  aria-label={`Ingredient ${index + 1}`}
                />
                <button
                  type="button"
                  onClick={() => removeRow(row.key)}
                  disabled={rows.length === 1}
                  aria-label={`Remove ingredient ${index + 1}`}
                  className="btn-ghost size-11 shrink-0 p-0 text-bar-400"
                >
                  <XIcon className="size-5" />
                </button>
              </div>
              <div className="mt-2 flex gap-4 pl-1">
                <label className="flex items-center gap-1.5 text-xs text-bar-400">
                  <input
                    type="checkbox"
                    checked={row.optional}
                    onChange={(e) => updateRow(row.key, { optional: e.target.checked })}
                    className="size-4 accent-brass-400"
                  />
                  Optional
                </label>
                <label className="flex items-center gap-1.5 text-xs text-bar-400">
                  <input
                    type="checkbox"
                    checked={row.garnish}
                    onChange={(e) => updateRow(row.key, { garnish: e.target.checked })}
                    className="size-4 accent-brass-400"
                  />
                  Garnish
                </label>
              </div>
            </li>
          ))}
        </ul>

        <button type="button" onClick={addRow} className="btn-secondary w-full">
          <PlusIcon className="size-5" />
          Add ingredient
        </button>
        <p className="text-xs text-bar-400">
          Optional and garnish ingredients never stop a drink showing up as
          &ldquo;you can make this&rdquo;.
        </p>
      </fieldset>

      <div>
        <label className="label" htmlFor="instructions">
          Instructions
        </label>
        <textarea
          id="instructions"
          name="instructions"
          required
          rows={5}
          defaultValue={initial?.instructions ?? ""}
          className="field resize-y"
          placeholder={"Shake with ice until well chilled.\nStrain into a chilled coupe."}
        />
        {fieldError("instructions") ? (
          <p className="mt-1 text-sm text-cherry-400">{fieldError("instructions")}</p>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="method">
            Method
          </label>
          <select
            id="method"
            name="method"
            defaultValue={initial?.method ?? ""}
            className="field"
          >
            <option value="">—</option>
            {METHODS.map((m) => (
              <option key={m.slug} value={m.slug}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="glass">
            Glass
          </label>
          <input
            id="glass"
            name="glass"
            defaultValue={initial?.glass ?? ""}
            className="field"
            placeholder="Coupe"
          />
        </div>
        <div>
          <label className="label" htmlFor="garnish">
            Garnish
          </label>
          <input
            id="garnish"
            name="garnish"
            defaultValue={initial?.garnish ?? ""}
            className="field"
            placeholder="Lime wheel"
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="notes">
          Notes
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={initial?.notes ?? ""}
          className="field resize-y"
          placeholder="Works better with a lighter gin. Try 1/2 oz lime next time."
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-bar-800 bg-bar-850/50 p-3">
        <div>
          <span className="label mb-0">Your rating</span>
          <RatingInput value={rating} onChange={setRating} />
        </div>
        <label className="flex items-center gap-2 text-sm text-bar-300">
          <input
            type="checkbox"
            checked={isFavorite}
            onChange={(e) => setIsFavorite(e.target.checked)}
            className="size-4 accent-brass-400"
          />
          Favourite
        </label>
      </div>

      {result?.error ? (
        <p role="alert" className="text-sm text-cherry-400">
          {result.error}
        </p>
      ) : null}

      <div className="flex gap-2 pb-2">
        {/* Held while the photo is being resized: submitting first would
            send the original, which is the thing this avoids. */}
        <button
          type="submit"
          disabled={pending || shrinking}
          className="btn-primary flex-1"
        >
          {pending ? "Saving…" : shrinking ? "Resizing the photo…" : submitLabel}
        </button>
        <button
          type="button"
          onClick={() => router.push(cancelHref)}
          className="btn-secondary"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
