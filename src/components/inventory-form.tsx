"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CATEGORIES } from "@/lib/categories";
import { BarcodeIcon } from "@/components/icons";
import type { ActionResult } from "@/actions/inventory";

export interface InventoryFormValues {
  id?: string;
  name?: string;
  category?: string;
  brand?: string | null;
  quantity?: string | null;
  abv?: number | null;
  upc?: string | null;
  notes?: string | null;
  slug?: string;
}

export function InventoryForm({
  initial,
  action,
  onDone,
  submitLabel = "Save",
}: {
  initial?: InventoryFormValues;
  action: (formData: FormData) => Promise<ActionResult>;
  onDone?: () => void;
  submitLabel?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const fieldError = (name: string) => result?.fieldErrors?.[name];

  return (
    <form
      action={(formData) => {
        startTransition(async () => {
          const res = await action(formData);
          setResult(res);
          if (res.ok) {
            router.refresh();
            onDone?.();
          }
        });
      }}
      className="space-y-4"
    >
      <div>
        <label className="label" htmlFor="name">
          What is it?
        </label>
        <input
          id="name"
          name="name"
          required
          defaultValue={initial?.name ?? ""}
          className="field"
          placeholder="Beefeater London Dry Gin"
          autoComplete="off"
        />
        {fieldError("name") ? (
          <p className="mt-1 text-sm text-cherry-400">{fieldError("name")}</p>
        ) : null}
      </div>

      <div>
        <label className="label" htmlFor="category">
          Shelf
        </label>
        <select
          id="category"
          name="category"
          defaultValue={initial?.category ?? "spirit"}
          className="field"
        >
          {CATEGORIES.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="quantity">
            How much is left
          </label>
          <input
            id="quantity"
            name="quantity"
            defaultValue={initial?.quantity ?? ""}
            className="field"
            placeholder="750ml"
            autoComplete="off"
          />
        </div>
        <div>
          <label className="label" htmlFor="abv">
            ABV %
          </label>
          <input
            id="abv"
            name="abv"
            type="number"
            min={0}
            max={100}
            step="0.1"
            inputMode="decimal"
            defaultValue={initial?.abv ?? ""}
            className="field"
            placeholder="40"
          />
          {fieldError("abv") ? (
            <p className="mt-1 text-sm text-cherry-400">{fieldError("abv")}</p>
          ) : null}
        </div>
      </div>

      <div>
        <label className="label" htmlFor="notes">
          Notes
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={2}
          defaultValue={initial?.notes ?? ""}
          className="field resize-y"
          placeholder="Bought at the corner shop. Good in a Negroni."
        />
      </div>

      <button
        type="button"
        onClick={() => setShowAdvanced((v) => !v)}
        className="text-sm text-bar-400 underline-offset-4 hover:text-bar-200 hover:underline"
      >
        {showAdvanced ? "Hide" : "Show"} brand, barcode &amp; matching
      </button>

      {showAdvanced ? (
        <div className="space-y-4 rounded-xl border border-bar-800 bg-bar-850/50 p-3">
          <div>
            <label className="label" htmlFor="brand">
              Brand
            </label>
            <input
              id="brand"
              name="brand"
              defaultValue={initial?.brand ?? ""}
              className="field"
              placeholder="Beefeater"
              autoComplete="off"
            />
          </div>

          <div>
            <label className="label" htmlFor="matchAs">
              Match recipes as
            </label>
            <input
              id="matchAs"
              name="matchAs"
              defaultValue={initial?.slug ?? ""}
              className="field"
              placeholder="gin"
              autoComplete="off"
            />
            <p className="mt-1 text-xs text-bar-400">
              Leave blank to derive it from the name. Set it when a bottle should
              stand in for a generic ingredient.
            </p>
          </div>

          <div>
            <label className="label" htmlFor="upc">
              <span className="inline-flex items-center gap-1.5">
                <BarcodeIcon className="size-4" />
                Barcode (UPC)
              </span>
            </label>
            <input
              id="upc"
              name="upc"
              defaultValue={initial?.upc ?? ""}
              className="field"
              placeholder="083664872312"
              inputMode="numeric"
              autoComplete="off"
            />
            <p className="mt-1 text-xs text-bar-400">
              Stored for later — barcode scanning is not wired up yet.
            </p>
          </div>
        </div>
      ) : null}

      {result?.error ? (
        <p role="alert" className={`text-sm ${result.ok ? "text-brass-300" : "text-cherry-400"}`}>
          {result.error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="btn-primary flex-1">
          {pending ? "Saving…" : submitLabel}
        </button>
        {onDone ? (
          <button type="button" onClick={onDone} className="btn-secondary">
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
