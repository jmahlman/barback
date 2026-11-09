import "server-only";
import { getSetting, SETTING_KEYS } from "@/lib/settings";
import { cleanTitle } from "@/lib/products/classify";
import { recordExhausted, recordQuota } from "@/lib/products/quota";
import { ProductLookupError, type ProductLookup } from "@/lib/products/types";

/**
 * UPCitemdb — https://www.upcitemdb.com/
 *
 * The trial endpoint needs no key at all, which is why it is the default: a
 * fresh instance can scan a bottle without anyone signing up for anything.
 * It allows 100 lookups a day, counted per IP address, and answers 429 past
 * that. A key switches to the paid endpoint and a far higher ceiling.
 *
 * This is the only file in the feature that makes a network request.
 */

export const SOURCE = "upcitemdb";

const TRIAL_URL = "https://api.upcitemdb.com/prod/trial/lookup";
const PAID_URL = "https://api.upcitemdb.com/prod/v1/lookup";

interface RawItem {
  ean?: string;
  upc?: string;
  title?: string;
  description?: string;
  brand?: string;
  model?: string;
  size?: string;
  category?: string;
  images?: unknown;
  [key: string]: unknown;
}

interface RawResponse {
  code?: string;
  total?: number;
  items?: RawItem[];
  message?: string;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** The first usable image URL, if the service offered any. */
function firstImage(images: unknown): string | null {
  if (!Array.isArray(images)) return null;
  for (const entry of images) {
    const url = text(entry);
    if (url && /^https:\/\//iu.test(url)) return url;
  }
  return null;
}

function toProduct(code: string, item: RawItem): ProductLookup {
  const rawTitle = text(item.title);
  // The size field is more reliable than one parsed out of the title, so it
  // wins; the parse is the fallback.
  const parsed = rawTitle ? cleanTitle(rawTitle) : { name: null, size: null };

  return {
    code,
    title: parsed.name,
    brand: text(item.brand),
    size: text(item.size) ?? parsed.size,
    category: text(item.category),
    description: text(item.description),
    imageUrl: firstImage(item.images),
    source: SOURCE,
  };
}

export async function isConfigured(): Promise<boolean> {
  // The trial tier needs nothing, so this service is always usable. The
  // function exists to mirror the cocktail providers, and so the answer has
  // one place to change if that ever stops being true.
  return true;
}

/** Is a key set, i.e. are we on the paid endpoint? */
export async function hasApiKey(): Promise<boolean> {
  return Boolean(await getSetting(SETTING_KEYS.upcitemdbApiKey));
}

export interface LookupOutcome {
  /** Null when the service answered but had no such product. */
  product: ProductLookup | null;
  /** The matching item verbatim, for the cache's `raw` column. */
  raw: unknown;
}

/**
 * Look one barcode up.
 *
 * A null `product` means the service answered but had nothing — a real
 * answer, and one worth caching. Throws `ProductLookupError` when it could
 * not be asked at all.
 *
 * The caller is responsible for validating the barcode, checking the local
 * caches and checking the allowance first; this function always goes out to
 * the network.
 */
export async function lookupUpc(code: string): Promise<LookupOutcome> {
  const apiKey = await getSetting(SETTING_KEYS.upcitemdbApiKey);
  const base = apiKey ? PAID_URL : TRIAL_URL;

  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey) {
    headers.user_key = apiKey;
    headers.key_type = "3scale";
  }

  console.info(`[upcitemdb] GET ${apiKey ? "/prod/v1" : "/prod/trial"}/lookup?upc=${code}`);

  let response: Response;
  try {
    response = await fetch(`${base}?upc=${encodeURIComponent(code)}`, {
      headers,
      // Caching is handled in our own database, with a much longer life.
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new ProductLookupError("UPCitemdb did not respond.", SOURCE);
  }

  if (response.status === 429) {
    await recordExhausted(response.headers);
    throw new ProductLookupError(
      "UPCitemdb is rate limiting us. The free tier's 100 lookups a day are shared with everything behind your IP address.",
      SOURCE,
      429,
    );
  }

  if (response.status === 401 || response.status === 403) {
    await recordQuota(response.headers);
    throw new ProductLookupError(
      "UPCitemdb rejected the key. Check it on the Settings page.",
      SOURCE,
      response.status,
    );
  }

  // Record the spend before anything else can fail: the request was made
  // whether or not we manage to read the answer.
  await recordQuota(response.headers);

  if (!response.ok) {
    throw new ProductLookupError(`UPCitemdb returned ${response.status}.`, SOURCE, response.status);
  }

  let payload: RawResponse;
  try {
    payload = (await response.json()) as RawResponse;
  } catch {
    throw new ProductLookupError("UPCitemdb sent something unreadable.", SOURCE);
  }

  if (payload.code && payload.code !== "OK") {
    throw new ProductLookupError(
      payload.message?.trim() || `UPCitemdb answered "${payload.code}".`,
      SOURCE,
    );
  }

  const item = payload.items?.[0];
  if (!item) return { product: null, raw: null };

  return { product: toProduct(code, item), raw: item };
}
