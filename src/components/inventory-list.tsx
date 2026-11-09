"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createInventoryItem,
  deleteInventoryItem,
  setInStock,
  updateInventoryItem,
} from "@/actions/inventory";
import { CATEGORIES, categoryLabel } from "@/lib/categories";
import { InventoryForm } from "@/components/inventory-form";
import { BarcodeScanButton } from "@/components/barcode-scan-button";
import type { ScannedValues } from "@/actions/barcode";
import { Sheet } from "@/components/sheet";
import { EmptyState } from "@/components/empty-state";
import { ConfirmButton } from "@/components/confirm-button";
import {
  BottleIcon,
  CheckIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
} from "@/components/icons";

export interface InventoryItemView {
  id: string;
  name: string;
  slug: string;
  category: string;
  brand: string | null;
  quantity: string | null;
  abv: number | null;
  upc: string | null;
  notes: string | null;
  inStock: boolean;
}

export function InventoryList({ items }: { items: InventoryItemView[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [showOutOfStock, setShowOutOfStock] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<InventoryItemView | null>(null);
  const [pending, startTransition] = useTransition();
  /** What a scan established, and why the form looks the way it does. */
  const [scanned, setScanned] = useState<{
    values: Partial<ScannedValues> & { upc: string };
    note: string | null;
  } | null>(null);
  // The form's inputs are uncontrolled, so handing it new values after it has
  // mounted would do nothing. Bumping this remounts it, which is the right
  // tool here and cheaper than making every field controlled.
  const [formKey, setFormKey] = useState(0);

  const openAddSheet = (
    values: (Partial<ScannedValues> & { upc: string }) | null,
    note: string | null,
  ) => {
    setScanned(values ? { values, note } : null);
    setFormKey((n) => n + 1);
    setAdding(true);
  };

  const openEditSheet = (id: string) => {
    const item = items.find((candidate) => candidate.id === id);
    if (item) setEditing(item);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (!showOutOfStock && !item.inStock) return false;
      if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.slug.includes(q) ||
        (item.brand ?? "").toLowerCase().includes(q)
      );
    });
  }, [items, query, categoryFilter, showOutOfStock]);

  const grouped = useMemo(() => {
    const map = new Map<string, InventoryItemView[]>();
    for (const item of filtered) {
      const list = map.get(item.category) ?? [];
      list.push(item);
      map.set(item.category, list);
    }
    // Keep shelves in the canonical order.
    return CATEGORIES.map((c) => ({ category: c.slug, label: c.label, items: map.get(c.slug) ?? [] }))
      .filter((group) => group.items.length > 0);
  }, [filtered]);

  const usedCategories = useMemo(
    () => new Set(items.map((i) => i.category)),
    [items],
  );

  const inStockCount = items.filter((i) => i.inStock).length;

  return (
    <div className="space-y-4">
      {/* Search + filters */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-bar-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your bar…"
              aria-label="Search inventory"
              className="field pl-10"
            />
          </div>
          {/* Scanning from here is the restocking path: a bottle you already
              track never has to open the add form at all. */}
          <BarcodeScanButton
            variant="icon"
            onPrefill={(values, note) => openAddSheet(values, note)}
            onEdit={openEditSheet}
          />
        </div>

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
          <FilterChip
            active={categoryFilter === "all"}
            onClick={() => setCategoryFilter("all")}
          >
            All {items.length}
          </FilterChip>
          {CATEGORIES.filter((c) => usedCategories.has(c.slug)).map((c) => (
            <FilterChip
              key={c.slug}
              active={categoryFilter === c.slug}
              onClick={() => setCategoryFilter(c.slug)}
            >
              {c.label}
            </FilterChip>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm text-bar-400">
          <input
            type="checkbox"
            checked={showOutOfStock}
            onChange={(e) => setShowOutOfStock(e.target.checked)}
            className="size-4 accent-brass-400"
          />
          Show things I&apos;ve run out of
        </label>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<BottleIcon className="size-12" />}
          title="Your bar is empty"
          body="Add the bottles, mixers and garnishes you keep around. Barback uses this to work out what you can make."
          action={
            <button type="button" onClick={() => openAddSheet(null, null)} className="btn-primary">
              <PlusIcon className="size-5" />
              Add your first bottle
            </button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState title="Nothing matches" body="Try a different search or shelf." />
      ) : (
        <>
          <p className="text-sm text-bar-400">
            {inStockCount} in stock · {items.length} tracked
          </p>
          <div className="space-y-6">
            {grouped.map((group) => (
              <section key={group.category}>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-bar-400">
                  {group.label}
                </h2>
                <ul className="card divide-y divide-bar-800 overflow-hidden">
                  {group.items.map((item) => (
                    <li key={item.id} className="flex items-center gap-3 p-3">
                      <button
                        type="button"
                        aria-label={item.inStock ? `Mark ${item.name} out of stock` : `Mark ${item.name} in stock`}
                        aria-pressed={item.inStock}
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            await setInStock(item.id, !item.inStock);
                            router.refresh();
                          })
                        }
                        className={`flex size-9 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                          item.inStock
                            ? "border-citrus-400/40 bg-citrus-400/15 text-citrus-400"
                            : "border-bar-700 bg-bar-850 text-bar-600"
                        }`}
                      >
                        <CheckIcon className="size-5" />
                      </button>

                      <div className="min-w-0 flex-1">
                        <p
                          className={`truncate text-sm font-medium ${
                            item.inStock ? "text-bar-200" : "text-bar-400 line-through"
                          }`}
                        >
                          {item.name}
                        </p>
                        <p className="truncate text-xs text-bar-400">
                          {[item.quantity, item.abv ? `${item.abv}% ABV` : null, item.slug]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>

                      <button
                        type="button"
                        aria-label={`Edit ${item.name}`}
                        onClick={() => setEditing(item)}
                        className="btn-ghost size-10 shrink-0 p-0"
                      >
                        <PencilIcon className="size-5" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}

      {/* Floating add button */}
      <button
        type="button"
        onClick={() => openAddSheet(null, null)}
        aria-label="Add to inventory"
        className="btn-primary fixed bottom-20 right-4 z-30 size-14 rounded-full shadow-lg
          shadow-black/40 md:bottom-6 md:right-6"
      >
        <PlusIcon className="size-7" />
      </button>

      <Sheet open={adding} onClose={() => setAdding(false)} title="Add to your bar">
        <InventoryForm
          key={formKey}
          initial={
            scanned
              ? {
                  name: scanned.values.name ?? "",
                  category: scanned.values.category ?? "spirit",
                  brand: scanned.values.brand ?? "",
                  quantity: scanned.values.quantity ?? "",
                  upc: scanned.values.upc,
                  // Deliberately no slug: leaving "Match recipes as" blank
                  // lets the server derive it from whatever name is finally
                  // submitted, rather than from the one the scan guessed.
                }
              : undefined
          }
          notice={scanned?.note ?? null}
          // After a scan, the two fields worth checking — the brand and what
          // this will match as — are both inside the disclosure.
          defaultAdvancedOpen={Boolean(scanned)}
          scanSlot={
            <BarcodeScanButton
              onPrefill={(values, note) => openAddSheet(values, note)}
              onEdit={openEditSheet}
            />
          }
          action={createInventoryItem}
          onDone={() => setAdding(false)}
          submitLabel="Add it"
        />
      </Sheet>

      <Sheet open={Boolean(editing)} onClose={() => setEditing(null)} title="Edit item">
        {editing ? (
          <div className="space-y-4">
            <InventoryForm
              initial={editing}
              action={updateInventoryItem.bind(null, editing.id)}
              onDone={() => setEditing(null)}
            />
            <div className="border-t border-bar-800 pt-4">
              <ConfirmButton
                label="Remove from inventory"
                confirmLabel="Remove it"
                question={`Remove "${editing.name}" from your inventory?`}
                detail="Recipes that use it will start showing it as missing."
                icon={<TrashIcon className="size-5" />}
                className="btn-danger w-full"
                busyLabel="Removing…"
                onConfirm={async () => {
                  const id = editing.id;
                  setEditing(null);
                  await deleteInventoryItem(id);
                  router.refresh();
                }}
              />
            </div>
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "border-brass-400 bg-brass-400/15 text-brass-300"
          : "border-bar-700 bg-bar-850 text-bar-300 hover:bg-bar-800"
      }`}
    >
      {children}
    </button>
  );
}
