"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { lookupBarcode, type BarcodeOutcome, type ScannedValues } from "@/actions/barcode";
import { setInStock } from "@/actions/inventory";
import { categoryLabel } from "@/lib/categories";
import { formatBarcode } from "@/lib/products/upc";
import { Sheet } from "@/components/sheet";
import { BarcodeIcon, CheckIcon, PencilIcon } from "@/components/icons";

/**
 * The scan button and everything that happens after a barcode is read.
 *
 * Kept apart from the inventory list and the inventory form so that neither
 * has to know about cameras, and so the decoder is only ever loaded by
 * someone who pressed the button.
 */

// ~420 KB of WebAssembly decoder lives behind this. Loading it with the page
// would make every visit to the inventory pay for a feature most visits do
// not use.
const BarcodeScanner = dynamic(
  () => import("@/components/barcode-scanner").then((m) => m.BarcodeScanner),
  {
    ssr: false,
    loading: () => <p className="py-8 text-center text-sm text-bar-400">Starting the scanner…</p>,
  },
);

export function BarcodeScanButton({
  variant = "full",
  onPrefill,
  onEdit,
}: {
  variant?: "full" | "icon";
  /** Open the add form with whatever the scan established. */
  onPrefill: (values: Partial<ScannedValues> & { upc: string }, note: string | null) => void;
  /** Open the edit form for a bottle already on the shelf. */
  onEdit?: (id: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<BarcodeOutcome | null>(null);
  const [pending, startTransition] = useTransition();

  const close = () => {
    setOpen(false);
    setOutcome(null);
    setBusy(false);
  };

  const onDetect = (code: string) => {
    setBusy(true);
    startTransition(async () => {
      const result = await lookupBarcode(code);
      setBusy(false);

      // A bottle already on the shelf, or anything that needs explaining,
      // stays in this sheet. Everything else goes straight to the form.
      if (result.status === "tracked" || result.status === "invalid") {
        setOutcome(result);
        return;
      }

      if (result.status === "found") {
        close();
        onPrefill(result.values, null);
        return;
      }

      // Unknown, disabled, out of allowance, or a failed request: the barcode
      // is still worth keeping, so open the form with it and say why it is
      // all there is.
      close();
      onPrefill({ upc: result.code }, result.message);
    });
  };

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Scan a barcode"
          className="btn-ghost size-11 p-0"
        >
          <BarcodeIcon className="size-5" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn-secondary flex w-full items-center justify-center gap-2"
        >
          <BarcodeIcon className="size-5" />
          Scan a barcode
        </button>
      )}

      {/* The sheet keeps its children mounted while hidden, so the scanner is
          only rendered once it is actually open. Otherwise the camera would
          be requested the moment the inventory page loaded, which is both
          alarming and a good way to get permission denied for good. */}
      <Sheet open={open} onClose={close} title="Scan a barcode">
        {!open ? null : busy || pending ? (
          <p className="py-8 text-center text-sm text-bar-300">Looking it up…</p>
        ) : outcome?.status === "tracked" ? (
          <AlreadyTracked
            item={outcome.item}
            code={outcome.code}
            busy={pending}
            onEdit={
              onEdit
                ? () => {
                    const id = outcome.item.id;
                    close();
                    onEdit(id);
                  }
                : undefined
            }
            onRestock={() =>
              startTransition(async () => {
                await setInStock(outcome.item.id, true);
                router.refresh();
                close();
              })
            }
            onDone={close}
          />
        ) : outcome?.status === "invalid" ? (
          <div className="space-y-3">
            <p className="text-sm text-cherry-400">{outcome.message}</p>
            <button type="button" onClick={() => setOutcome(null)} className="btn-secondary w-full">
              Scan again
            </button>
          </div>
        ) : (
          <BarcodeScanner onDetect={onDetect} onCancel={close} />
        )}
      </Sheet>
    </>
  );
}

function AlreadyTracked({
  item,
  code,
  busy,
  onEdit,
  onRestock,
  onDone,
}: {
  item: { id: string; name: string; quantity: string | null; category: string; inStock: boolean };
  code: string;
  busy: boolean;
  onEdit?: () => void;
  onRestock: () => void;
  onDone: () => void;
}) {
  const details = [item.quantity, categoryLabel(item.category)].filter(Boolean).join(" · ");

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <p className="text-xs uppercase tracking-wide text-bar-400">Already on your shelf</p>
        <p className="mt-1 font-medium text-bar-100">{item.name}</p>
        {details ? <p className="text-sm text-bar-400">{details}</p> : null}
        <p className="mt-2 font-mono text-xs text-bar-500">{formatBarcode(code)}</p>
      </div>

      {item.inStock ? (
        <p className="text-sm text-citrus-400">In stock — nothing to do.</p>
      ) : (
        <button
          type="button"
          onClick={onRestock}
          disabled={busy}
          className="btn-primary flex w-full items-center justify-center gap-2"
        >
          <CheckIcon className="size-5" />
          {busy ? "Marking…" : "Mark back in stock"}
        </button>
      )}

      <div className="flex gap-2">
        {onEdit ? (
          <button type="button" onClick={onEdit} className="btn-secondary flex-1">
            <PencilIcon className="size-4" />
            Edit it
          </button>
        ) : null}
        <button type="button" onClick={onDone} className="btn-ghost flex-1">
          Done
        </button>
      </div>
    </div>
  );
}
