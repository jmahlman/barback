"use client";

import { useEffect, useRef } from "react";
import { XIcon } from "@/components/icons";

/**
 * Bottom sheet on mobile, centred dialog on desktop.
 * Uses a native <dialog> so focus trapping and Esc come for free.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Stop the page behind the sheet from scrolling.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the dialog closes on Esc and has a close button; this click only dismisses on the backdrop
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // Click on the backdrop (the dialog element itself) closes it.
        if (event.target === ref.current) onClose();
      }}
      aria-label={title}
      className="m-0 max-h-dvh w-full max-w-none bg-transparent p-0
        backdrop:bg-black/60 backdrop:backdrop-blur-sm
        md:m-auto md:max-w-lg"
    >
      <div
        className="mt-auto flex max-h-[92dvh] flex-col rounded-t-2xl border border-bar-800
          bg-bar-900 md:rounded-2xl"
        style={{ marginTop: "auto" }}
      >
        <div className="flex items-center justify-between border-b border-bar-800 px-4 py-3">
          <h2 className="font-display text-lg text-bar-200">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="btn-ghost -mr-2 size-11 p-0"
          >
            <XIcon className="size-5" />
          </button>
        </div>
        <div
          className="overflow-y-auto px-4 py-4"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          {children}
        </div>
      </div>
    </dialog>
  );
}
