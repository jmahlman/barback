"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { clearUpcitemdbKey, saveBarcodeSettings } from "@/actions/settings";
import { clearBarcodeCache, testBarcodeLookup } from "@/actions/barcode";
import { BarcodeIcon, SparkIcon, TrashIcon } from "@/components/icons";
import { ConfirmButton } from "@/components/confirm-button";
import type { ActionResult } from "@/actions/inventory";
import { PasswordField } from "@/components/password-field";

/**
 * Owner-only configuration for barcode lookups.
 *
 * Note what is *not* configurable here: the camera and the decoder. Reading a
 * barcode happens entirely on the device, with no network and no third party,
 * so a switch for it would be security theatre. This section governs the
 * lookup, which is the only part that leaves the building.
 */

export interface BarcodeSettingsView {
  lookupEnabled: boolean;
  /** Masked form of the stored key, empty when none. */
  maskedKey: string;
  configured: boolean;
  source: "database" | "environment" | "default";
  quota: { remaining: number; limit: number; resetAt: string | null };
  cache: { total: number; misses: number };
}

const SOURCE_LABEL: Record<BarcodeSettingsView["source"], string> = {
  database: "set here",
  environment: "from the environment",
  default: "using the built-in default",
};

function describeReset(resetAt: string | null): string {
  if (!resetAt) return "";
  const when = new Date(resetAt);
  if (Number.isNaN(when.getTime())) return "";
  return ` Resets at ${when.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })}.`;
}

export function BarcodeSettings({ initial }: { initial: BarcodeSettingsView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(initial.lookupEnabled);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [test, setTest] = useState<{ ok: boolean; error?: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const { quota, cache } = initial;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 font-display text-xl text-bar-200">
          <BarcodeIcon className="size-5" />
          Barcode lookup
        </h2>
        <p className="mt-1 text-sm text-bar-400">
          Scanning a barcode happens on your device. Looking up what the
          barcode <em>is</em> asks{" "}
          <a
            href="https://www.upcitemdb.com/"
            target="_blank"
            rel="noreferrer noopener"
            className="text-brass-300 underline-offset-4 hover:underline"
          >
            UPCitemdb
          </a>
          , and that is what this controls.
        </p>
      </div>

      <form
        action={(formData) => {
          if (enabled) formData.set("barcodeLookupEnabled", "on");
          else formData.delete("barcodeLookupEnabled");

          startTransition(async () => {
            const res = await saveBarcodeSettings(formData);
            setResult(res);
            if (res.ok) router.refresh();
          });
        }}
        className="card space-y-4 p-5"
      >
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-brass-400"
          />
          <span>
            <span className="block text-sm text-bar-200">
              Look barcodes up on UPCitemdb
            </span>
            <span className="block text-xs text-bar-400">
              Only when someone presses Scan. Barback sends the barcode and
              nothing else — no key, no account, nothing about your bar. With
              this off the scanner still works; it fills the barcode in and you
              type the name yourself.
            </span>
          </span>
        </label>

        <div className="border-t border-bar-800 pt-4">
          <label className="label" htmlFor="upcitemdbApiKey">
            UPCitemdb API key{" "}
            <span className="text-xs font-normal text-bar-500">
              — optional, {SOURCE_LABEL[initial.source]}
            </span>
          </label>
          <PasswordField
            id="upcitemdbApiKey"
            name="upcitemdbApiKey"
            autoComplete="off"
            reveals="key"
            className="field font-mono"
            placeholder={
              initial.maskedKey
                ? `Currently ${initial.maskedKey} — type to replace`
                : "Leave blank to use the free tier"
            }
          />
          <p className="mt-1 text-xs text-bar-400">
            The free tier needs no key at all. A{" "}
            <a
              href="https://devs.upcitemdb.com/"
              target="_blank"
              rel="noreferrer noopener"
              className="text-brass-300 underline-offset-4 hover:underline"
            >
              paid key
            </a>{" "}
            raises the daily limit well beyond what a home bar will ever need.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={pending} className="btn-primary">
            {pending ? "Saving…" : "Save"}
          </button>

          <button
            type="button"
            disabled={testing || !enabled}
            onClick={() => {
              setTesting(true);
              startTransition(async () => {
                setTest(await testBarcodeLookup());
                setTesting(false);
                router.refresh();
              });
            }}
            className="btn-secondary"
          >
            <SparkIcon className="size-4" />
            {testing ? "Testing…" : "Test lookup"}
          </button>

          {initial.configured && initial.source === "database" ? (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setResult(await clearUpcitemdbKey());
                  router.refresh();
                })
              }
              className="btn-ghost text-sm"
            >
              Remove key
            </button>
          ) : null}
        </div>

        <p className="text-xs text-bar-500">
          Test lookup spends one real request, so that a pass means something.
        </p>

        {result?.error ? (
          <p className={`text-sm ${result.ok ? "text-citrus-400" : "text-cherry-400"}`}>
            {result.error}
          </p>
        ) : null}
        {test?.error ? (
          <p className={`text-sm ${test.ok ? "text-citrus-400" : "text-cherry-400"}`}>
            {test.error}
          </p>
        ) : null}
      </form>

      <div className="card space-y-3 p-5">
        <div>
          <p className="text-sm text-bar-200">
            {quota.remaining} of {quota.limit} lookups left today.
            {describeReset(quota.resetAt)}
          </p>
          <p className="mt-1 text-xs text-bar-400">
            {initial.configured
              ? "Your key's daily allowance."
              : "The free allowance is counted per IP address, so it is shared with everything else on your connection."}
          </p>
        </div>

        <div className="border-t border-bar-800 pt-3">
          <p className="text-sm text-bar-300">
            {cache.total === 0
              ? "No barcodes cached yet."
              : `${cache.total} barcode${cache.total === 1 ? "" : "s"} cached locally${
                  cache.misses > 0 ? `, ${cache.misses} of them known to be unlisted` : ""
                }.`}
          </p>
          <p className="mt-1 text-xs text-bar-400">
            Scanning the same bottle twice costs nothing. Barcodes that nothing
            has heard of are remembered too, so a rescan does not spend the
            allowance to learn the same nothing again.
          </p>
          {cache.total > 0 ? (
            <div className="mt-3">
              <ConfirmButton
                label="Clear cached barcodes"
                confirmLabel="Clear them"
                question="Forget every cached barcode?"
                detail="Bottles already in your inventory are untouched. The next scan of each barcode will spend a lookup again."
                icon={<TrashIcon className="size-4" />}
                className="btn-secondary"
                busyLabel="Clearing…"
                onConfirm={async () => {
                  setResult(await clearBarcodeCache());
                  router.refresh();
                }}
              />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
