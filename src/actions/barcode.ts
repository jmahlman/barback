"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { isOwner } from "@/lib/owner";
import { getSetting, SETTING_KEYS } from "@/lib/settings";
import { slugifyIngredient } from "@/lib/ingredients";
import { cleanTitle, shelfFor } from "@/lib/products/classify";
import { isValidBarcode, normalizeBarcode } from "@/lib/products/upc";
import {
  cacheMiss,
  cacheProduct,
  clearProductCache,
  getCachedProduct,
} from "@/lib/products/cache";
import { canSpend, readQuota, remainingLookups } from "@/lib/products/quota";
import { lookupUpc, SOURCE } from "@/lib/products/upcitemdb";
import { ProductLookupError } from "@/lib/products/types";

/**
 * Barcode lookup, the only part of scanning that leaves the building.
 *
 * Decoding a barcode is entirely local — camera, WebAssembly, no network. The
 * lookup is the outbound half, so it lives here behind an explicit action,
 * like every other outbound call in Barback.
 */

/** What the form needs to prefill itself. */
export interface ScannedValues {
  name: string;
  category: string;
  brand: string;
  quantity: string;
  upc: string;
  /** What recipes will match this as, derived — not submitted. */
  slug: string;
}

export interface TrackedItem {
  id: string;
  name: string;
  quantity: string | null;
  category: string;
  inStock: boolean;
}

export type BarcodeOutcome =
  /** The barcode did not decode to anything real. */
  | { status: "invalid"; message: string }
  /** Already in this user's inventory; no lookup was needed or made. */
  | { status: "tracked"; code: string; item: TrackedItem }
  /** Looked up, and we know what it is. */
  | { status: "found"; code: string; values: ScannedValues; cached: boolean }
  /** Looked up, and nothing has heard of it. */
  | { status: "unknown"; code: string; message: string }
  /** Lookup is switched off, so the barcode is all we have. */
  | { status: "disabled"; code: string; message: string }
  /** Today's allowance is gone. */
  | { status: "quota"; code: string; message: string; resetAt: string | null }
  /** Something went wrong reaching the service. */
  | { status: "error"; code: string; message: string };

function describeReset(resetAt: string | null): string {
  if (!resetAt) return "later today";
  const when = new Date(resetAt);
  if (Number.isNaN(when.getTime())) return "later today";
  return `at ${when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

/**
 * Turn a barcode into something the inventory form can use.
 *
 * Resolution runs cheapest first, and most scans never reach the network:
 *
 *  1. the barcode's own check digit, so a misread never spends the allowance
 *  2. the user's own inventory, which is the restocking path
 *  3. the local cache, hit or miss
 *  4. the allowance, refused locally rather than by a 429
 *  5. the service
 */
export async function lookupBarcode(raw: string): Promise<BarcodeOutcome> {
  const user = await requireUser();

  const code = normalizeBarcode(raw);
  if (!code || !isValidBarcode(code)) {
    return {
      status: "invalid",
      message: "That does not look like a barcode. Try again, or type it in by hand.",
    };
  }

  // 2. Already on their shelf? Then there is nothing to look up.
  const existing = await db.inventoryItem.findFirst({
    where: { userId: user.id, upc: code },
    select: { id: true, name: true, quantity: true, category: true, inStock: true },
  });
  if (existing) {
    return { status: "tracked", code, item: existing };
  }

  // 3. Something we already asked about.
  const cached = await getCachedProduct(code);
  if (cached.status === "hit") {
    return { status: "found", code, values: toValues(code, cached.product), cached: true };
  }
  if (cached.status === "miss") {
    return { status: "unknown", code, message: unknownMessage() };
  }

  // Is looking things up allowed at all?
  const enabled = (await getSetting(SETTING_KEYS.barcodeLookupEnabled)) === "true";
  if (!enabled) {
    return {
      status: "disabled",
      code,
      message:
        "Barcode lookup is switched off, so the barcode is all Barback has. Type the name in and it will be saved with it.",
    };
  }

  // 4. The allowance.
  if (!(await canSpend())) {
    const quota = await readQuota();
    return {
      status: "quota",
      code,
      resetAt: quota.resetAt,
      message: `UPCitemdb's free limit for today is used up. The 100 lookups a day are shared across everything behind your IP address, and they reset ${describeReset(quota.resetAt)}. Scanning still works — type the name in and the barcode will be saved with it.`,
    };
  }

  // 5. Out to the service.
  try {
    const { product, raw: rawItem } = await lookupUpc(code);

    if (!product?.title) {
      await cacheMiss(code, SOURCE);
      return { status: "unknown", code, message: unknownMessage() };
    }

    await cacheProduct(product, rawItem);
    return { status: "found", code, values: toValues(code, product), cached: false };
  } catch (error) {
    const message =
      error instanceof ProductLookupError
        ? error.message
        : "Barback could not reach UPCitemdb.";
    return {
      status: "error",
      code,
      message: `${message} The barcode is filled in — you can type the name yourself.`,
    };
  }
}

function unknownMessage(): string {
  return "Not in UPCitemdb — it is a consumer-goods database and spirits are patchy. Type the name in and the barcode will be saved with it, so next time this bottle is a one-tap restock.";
}

function toValues(
  code: string,
  product: { title: string | null; brand: string | null; size: string | null; category: string | null },
): ScannedValues {
  // The title has usually already been cleaned by the client, but a value out
  // of the cache from an older version of the rules may not have been.
  const { name, size } = cleanTitle(product.title ?? "");
  const slug = slugifyIngredient(name);

  return {
    name,
    category: shelfFor(slug, product.category),
    brand: product.brand ?? "",
    quantity: product.size ?? size ?? "",
    upc: code,
    slug,
  };
}

/** For the Settings panel: how many lookups are left, without asking anyone. */
export async function barcodeQuota(): Promise<{ remaining: number; limit: number; resetAt: string | null }> {
  await requireUser();
  const [quota, remaining] = await Promise.all([readQuota(), remainingLookups()]);
  return { remaining, limit: quota.limit, resetAt: quota.resetAt };
}


// --- Owner-only maintenance ------------------------------------------------

/**
 * A barcode that UPCitemdb reliably knows, used only by the connection test.
 * Deliberately a mass-market consumer product rather than a bottle: spirits
 * coverage is exactly the thing that is patchy, so a miss on one would say
 * nothing about whether the connection works.
 */
const TEST_UPC = "0885909950805";

/**
 * Check that barcode lookups actually reach UPCitemdb.
 *
 * This spends one real request on purpose, bypassing the cache. A connection
 * test that does not connect would be worthless, and one request out of a
 * hundred is a fair price for knowing.
 */
export async function testBarcodeLookup(): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (!(await isOwner(user.id))) {
    return { ok: false, error: "Only the instance owner can run this." };
  }

  if ((await getSetting(SETTING_KEYS.barcodeLookupEnabled)) !== "true") {
    return { ok: false, error: "Barcode lookup is switched off." };
  }

  if (!(await canSpend())) {
    const quota = await readQuota();
    return {
      ok: false,
      error: `No lookups left today. They reset ${describeReset(quota.resetAt)}.`,
    };
  }

  try {
    const { product } = await lookupUpc(TEST_UPC);
    const remaining = await remainingLookups();
    if (!product?.title) {
      return {
        ok: false,
        error: `UPCitemdb answered, but had nothing for the test barcode. ${remaining} lookups left today.`,
      };
    }
    return {
      ok: true,
      error: `Working — UPCitemdb returned "${product.title}". ${remaining} lookups left today.`,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof ProductLookupError ? error.message : "Could not reach UPCitemdb.",
    };
  }
}

/** Forget every cached barcode lookup, hits and misses alike. */
export async function clearBarcodeCache(): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (!(await isOwner(user.id))) {
    return { ok: false, error: "Only the instance owner can run this." };
  }

  const count = await clearProductCache();
  revalidatePath("/settings");
  return {
    ok: true,
    error: count === 1 ? "Forgot 1 cached barcode." : `Forgot ${count} cached barcodes.`,
  };
}
