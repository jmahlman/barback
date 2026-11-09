"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { XIcon } from "@/components/icons";

/**
 * A recipe photograph that opens full size when you tap it.
 *
 * The page itself only ever loads a display-sized copy; the full picture is
 * fetched the first time someone actually asks to see it, which on a phone is
 * usually never. Uses a native `<dialog>`, so Esc and focus handling come for
 * free — the same reason `Sheet` does.
 */
export function PhotoViewer({
  src,
  fullSrc,
  alt,
  className,
  sizes,
  priority,
  unoptimized = true,
  fullSizes = "100vw",
  fullMaxPx,
}: {
  /** The copy shown on the page. */
  src: string;
  /** The full-size original, loaded only once it is opened. */
  fullSrc: string;
  alt: string;
  /** Classes for the box the photo sits in. */
  className?: string;
  sizes?: string;
  priority?: boolean;
  /**
   * True for Barback's own uploads, which are already the right size and are
   * served from disk. False for a provider's artwork: letting Next fetch and
   * re-serve it keeps the browser from talking to a third party just to draw
   * a cocktail.
   */
  unoptimized?: boolean;
  /**
   * `sizes` for the enlarged copy. Only meaningful when the image is being
   * optimised: the picture is laid out at its intrinsic size, so this is what
   * decides which variant gets fetched — leave it too small and "larger"
   * turns out barely larger at all.
   */
  fullSizes?: string;
  /**
   * How large the source actually is, when that is known.
   *
   * An optimised image is served through a `srcset`, and a browser reports
   * its natural size divided by the density it picked — so laying the
   * enlarged copy out intrinsically makes it *smaller* the better the
   * variant it chose. Giving a cap switches to definite sizing: it fills the
   * space up to this many pixels and is not blown up past it.
   *
   * Left unset for Barback's own uploads, which are served unscaled and size
   * themselves correctly.
   */
  fullMaxPx?: number;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`View ${alt} larger`}
        className={`group relative block cursor-zoom-in ${className ?? ""}`}
      >
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          className="object-cover transition-transform duration-200 group-hover:scale-[1.02]"
          unoptimized={unoptimized}
          priority={priority}
        />
      </button>

      {/* biome-ignore lint/a11y/useKeyWithClickEvents: the dialog closes on Esc and has a close button; this click only dismisses on the backdrop */}
      <dialog
        ref={ref}
        onCancel={(event) => {
          event.preventDefault();
          setOpen(false);
        }}
        onClick={(event) => {
          // Anywhere outside the picture closes it, which on a phone is the
          // obvious thing to try.
          if (event.target === ref.current) setOpen(false);
        }}
        aria-label={alt}
        className="m-0 h-dvh max-h-none w-full max-w-none bg-transparent p-0
          backdrop:bg-black/90 backdrop:backdrop-blur-sm"
      >
        {open ? (
          // biome-ignore lint/a11y/noStaticElementInteractions: the overlay is a pointer affordance; Esc and the close button are the keyboard paths
          // biome-ignore lint/a11y/useKeyWithClickEvents: the dialog closes on Esc and has a close button; this click only dismisses on the backdrop
          <div
            className="flex h-full w-full items-center justify-center p-4"
            onClick={() => setOpen(false)}
          >
            {/* Intrinsic sizing: a 300px picture stays 300px rather than
                being blown up to fill the screen. */}
            <Image
              src={fullSrc}
              alt={alt}
              width={fullMaxPx ?? 1600}
              height={fullMaxPx ?? 1600}
              sizes={fullSizes}
              className={
                fullMaxPx
                  ? "max-h-full w-full rounded-lg object-contain"
                  : "h-auto max-h-full w-auto max-w-full rounded-lg object-contain"
              }
              style={
                fullMaxPx ? { maxWidth: fullMaxPx, maxHeight: fullMaxPx } : undefined
              }
              unoptimized={unoptimized}
            />
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="btn-ghost absolute right-3 top-3 size-11 bg-black/50 p-0 text-bar-200"
          style={{ top: "max(0.75rem, env(safe-area-inset-top))" }}
        >
          <XIcon className="size-6" />
        </button>
      </dialog>
    </>
  );
}
