"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CameraIcon } from "@/components/icons";

/**
 * Reads a barcode with the camera, or from a photo.
 *
 * Decoding happens entirely on the device — the camera frame never leaves the
 * browser, and the decoder itself is served from Barback (see
 * `/api/scanner/wasm`). Only the resulting digits are sent anywhere, and only
 * then to look the product up.
 *
 * Written against the W3C `BarcodeDetector` interface, but always using the
 * WebAssembly implementation rather than the browser's own. Safari, including
 * on iOS, has no working native detector, and iPhones are the main thing this
 * feature exists for — so the fallback is the path that matters, and running
 * one decoder everywhere means one set of behaviour to reason about instead
 * of a different one per platform.
 */

/** Spirits bottles carry UPC-A or EAN-13; the short forms turn up on bitters
 *  and mixers. Anything else is a waste of CPU per frame — and marketing QR
 *  codes on modern labels would otherwise win the race against the barcode
 *  the camera is actually pointed at. */
const FORMATS = ["ean_13", "upc_a", "ean_8", "upc_e"] as const;

type Detector = { detect: (source: CanvasImageSource | Blob) => Promise<{ rawValue: string }[]> };

/**
 * The torch (the phone's flash held on) is not in the standard track types:
 * it is a Chrome/Android extension, absent in Safari. Narrowed here rather
 * than asserted at the call sites, so the guard is in one place.
 */
type TorchTrack = Omit<MediaStreamTrack, "getCapabilities" | "applyConstraints"> & {
  getCapabilities?: () => MediaTrackCapabilities & { torch?: boolean };
  applyConstraints: (constraints: { advanced: { torch: boolean }[] }) => Promise<void>;
};

function asTorchTrack(track: MediaStreamTrack | undefined): TorchTrack | null {
  return track ? (track as TorchTrack) : null;
}

let detectorPromise: Promise<Detector> | null = null;

/** Load the decoder once per page, on demand. ~420 KB, so never up front. */
function loadDetector(): Promise<Detector> {
  detectorPromise ??= (async () => {
    const [{ BarcodeDetector }, { prepareZXingModule }] = await Promise.all([
      import("barcode-detector/ponyfill"),
      import("zxing-wasm/reader"),
    ]);

    // Without this the module is fetched from a public CDN. See the route.
    prepareZXingModule({
      overrides: {
        locateFile: (path: string, prefix: string) =>
          path.endsWith(".wasm") ? "/api/scanner/wasm" : `${prefix}${path}`,
      },
    });

    return new BarcodeDetector({ formats: [...FORMATS] }) as Detector;
  })();
  return detectorPromise;
}

type Phase = "idle" | "starting" | "scanning" | "decoding";

interface Unsupported {
  reason: "insecure" | "nocamera" | "denied";
  message: string;
}

/** Can this page open a camera at all, and if not, why not? */
function cameraAvailability(): Unsupported | null {
  if (typeof window === "undefined") return null;

  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    return {
      reason: "insecure",
      message:
        "Browsers only open a camera on a secure page, and this one is being served over plain HTTP. Putting Barback behind HTTPS — a reverse proxy with a certificate is the usual way — turns the scanner on. Until then you can photograph the barcode instead, which works the same way.",
    };
  }
  return null;
}

export function BarcodeScanner({
  onDetect,
  onCancel,
}: {
  onDetect: (code: string) => void;
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastRef = useRef<string | null>(null);
  const doneRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [problem, setProblem] = useState<Unsupported | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [canTorch, setCanTorch] = useState(false);
  const [manual, setManual] = useState("");

  /** Release the camera. Called from everywhere that can end a scan: iOS
   *  leaves the recording indicator lit otherwise, which looks like spyware. */
  const stop = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });
    streamRef.current = null;
  }, []);

  const accept = useCallback(
    (code: string) => {
      if (doneRef.current) return;
      doneRef.current = true;
      stop();
      navigator.vibrate?.(50);
      onDetect(code);
    },
    [onDetect, stop],
  );

  const start = useCallback(async () => {
    const unavailable = cameraAvailability();
    if (unavailable) {
      setProblem(unavailable);
      return;
    }

    setPhase("starting");
    setError(null);

    let detector: Detector;
    try {
      detector = await loadDetector();
    } catch {
      setError("The barcode decoder could not be loaded.");
      setPhase("idle");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          // The 640x480 default is the main reason barcodes fail to read:
          // the bars on a 750 ml label are narrow. `ideal` rather than
          // `exact` so a laptop webcam that cannot manage it still opens.
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
    } catch (err) {
      const name = (err as DOMException)?.name;
      if (name === "NotAllowedError" || name === "SecurityError") {
        setProblem({
          reason: "denied",
          message:
            "Camera permission was declined. Allow it for this site in your browser settings and try again — on an iPhone that is Settings → Apps → Safari → Camera.",
        });
      } else {
        setProblem({
          reason: "nocamera",
          message:
            "No camera was available on this device. You can photograph the barcode instead, or type it in.",
        });
      }
      setPhase("idle");
      return;
    }

    streamRef.current = stream;

    const video = videoRef.current;
    if (!video) {
      stream.getTracks().forEach((t) => {
        t.stop();
      });
      return;
    }

    video.srcObject = stream;
    // Without playsInline, iOS Safari takes the video fullscreen and the
    // sheet around it disappears.
    video.playsInline = true;
    video.muted = true;
    try {
      await video.play();
    } catch {
      // Autoplay refusal is survivable; frames still arrive.
    }

    const track = stream.getVideoTracks()[0];
    setCanTorch(Boolean(asTorchTrack(track)?.getCapabilities?.().torch));

    setPhase("scanning");

    const tick = async () => {
      if (doneRef.current || !videoRef.current) return;
      const el = videoRef.current;

      if (el.readyState >= 2 && el.videoWidth > 0) {
        try {
          const results = await detector.detect(el);
          const value = results[0]?.rawValue?.trim();
          if (value) {
            // Two identical reads in a row before believing it. A single
            // misread would both spend one of the day's lookups and cache a
            // miss against a barcode that never existed.
            if (lastRef.current === value) {
              accept(value);
              return;
            }
            lastRef.current = value;
          }
        } catch {
          // A frame that will not decode is the normal case, not an error.
        }
      }

      frameRef.current = requestAnimationFrame(() => {
        // ~10 fps is plenty and leaves the phone some CPU.
        setTimeout(tick, 100);
      });
    };

    void tick();
  }, [accept]);

  // Start on mount, and always release the camera on the way out.
  useEffect(() => {
    void start();
    return stop;
  }, [start, stop]);

  // Backgrounding the tab should not leave the camera running.
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === "hidden") stop();
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, [stop]);

  const toggleTorch = async () => {
    const track = asTorchTrack(streamRef.current?.getVideoTracks()[0]);
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn }] });
      setTorchOn((v) => !v);
    } catch {
      setCanTorch(false);
    }
  };

  /** Decode a still photo. Not gated by secure context, so this is the path
   *  that keeps scanning working on a plain-HTTP instance. */
  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    setPhase("decoding");
    setError(null);
    try {
      const detector = await loadDetector();
      const bitmap = await createImageBitmap(file);
      const results = await detector.detect(bitmap);
      bitmap.close?.();
      const value = results[0]?.rawValue?.trim();
      if (value) {
        accept(value);
        return;
      }
      setError(
        "No barcode found in that photo. Get closer, fill the frame with the barcode, and keep it flat to the camera.",
      );
    } catch {
      setError("That image could not be read.");
    }
    setPhase("idle");
  };

  const submitManual = () => {
    const digits = manual.replace(/\D+/gu, "");
    if (digits.length >= 8) accept(digits);
  };

  return (
    <div className="space-y-4">
      {problem ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-brass-700/50 bg-brass-900/20 p-3">
            <p className="text-sm text-brass-200">{problem.message}</p>
          </div>
          {problem.reason === "denied" ? (
            <button
              type="button"
              onClick={() => {
                setProblem(null);
                void start();
              }}
              className="btn-secondary w-full"
            >
              Try the camera again
            </button>
          ) : null}
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-xl border border-bar-800 bg-black">
          <video
            ref={videoRef}
            playsInline
            muted
            className="aspect-[4/3] w-full object-cover"
          />
          {/* A frame to aim with. Bars read best filling the width. */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-24 w-[80%] rounded-lg border-2 border-brass-400/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          </div>
          {phase === "starting" ? (
            <p className="absolute inset-x-0 bottom-3 text-center text-sm text-bar-300">
              Opening the camera…
            </p>
          ) : null}
          {canTorch ? (
            <button
              type="button"
              onClick={() => void toggleTorch()}
              className="btn-ghost absolute right-2 top-2 bg-black/40 text-xs"
            >
              {torchOn ? "Light off" : "Light on"}
            </button>
          ) : null}
        </div>
      )}

      {!problem ? (
        <p className="text-center text-xs text-bar-400">
          Hold the barcode inside the frame. Nothing leaves your device until a
          barcode is read.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-cherry-400">
          {error}
        </p>
      ) : null}

      <div className="space-y-2">
        <label className="btn-secondary flex w-full cursor-pointer items-center justify-center gap-2">
          <CameraIcon className="size-4" />
          {phase === "decoding" ? "Reading the photo…" : "Take a photo instead"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(event) => void onPhoto(event.target.files?.[0])}
          />
        </label>

        <details className="rounded-xl border border-bar-800 bg-bar-850/50 p-3">
          <summary className="cursor-pointer text-sm text-bar-300">
            Type the barcode instead
          </summary>
          <div className="mt-3 flex gap-2">
            <input
              value={manual}
              onChange={(event) => setManual(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submitManual();
                }
              }}
              className="field flex-1"
              placeholder="083664872312"
              inputMode="numeric"
              autoComplete="off"
              aria-label="Barcode"
            />
            <button
              type="button"
              onClick={submitManual}
              disabled={manual.replace(/\D+/gu, "").length < 8}
              className="btn-secondary"
            >
              Use it
            </button>
          </div>
        </details>

        <button type="button" onClick={onCancel} className="btn-ghost w-full">
          Cancel
        </button>
      </div>
    </div>
  );
}
