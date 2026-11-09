import "server-only";
import { db } from "@/lib/db";
import type { ProductLookup } from "@/lib/products/types";

/**
 * Barcode lookups are cached in SQLite, **including the ones that found
 * nothing**.
 *
 * Caching misses is the single most valuable thing here. Product databases
 * are built for retail and their spirits coverage is patchy, so a good share
 * of scans find nothing — and the free allowance is a hundred lookups a day
 * for the whole instance. Without a negative cache, rescanning the same
 * unknown bottle spends the allowance to learn nothing, three times over.
 */

/** A barcode is permanently bound to one product, so a hit barely ages. The
 *  year is there only so a bad parse eventually heals itself. */
const HIT_TTL_MS = 365 * 24 * 60 * 60 * 1000;

/** Catalogs do grow, so a miss is worth retrying eventually. */
const MISS_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type CacheResult =
  | { status: "hit"; product: ProductLookup }
  | { status: "miss" }
  | { status: "unknown" };

function isFresh(fetchedAt: Date, ttl: number): boolean {
  return Date.now() - fetchedAt.getTime() < ttl;
}

/**
 * What do we already know about this barcode?
 *
 * "miss" means we asked and the service had nothing. "unknown" means we have
 * never asked, or what we knew has expired.
 */
export async function getCachedProduct(code: string): Promise<CacheResult> {
  const row = await db.cachedProduct.findUnique({ where: { code } });
  if (!row) return { status: "unknown" };

  const ttl = row.found ? HIT_TTL_MS : MISS_TTL_MS;
  if (!isFresh(row.fetchedAt, ttl)) return { status: "unknown" };

  if (!row.found) return { status: "miss" };

  return {
    status: "hit",
    product: {
      code: row.code,
      title: row.title,
      brand: row.brand,
      size: row.size,
      category: row.category,
      description: row.description,
      imageUrl: row.imageUrl,
      source: row.source,
    },
  };
}

export async function cacheProduct(product: ProductLookup, raw?: unknown): Promise<void> {
  const data = {
    found: true,
    title: product.title,
    brand: product.brand,
    size: product.size,
    category: product.category,
    description: product.description,
    imageUrl: product.imageUrl,
    source: product.source,
    // Kept so the title-cleanup rules can be improved later by reprocessing
    // locally, instead of spending the allowance again.
    raw: raw === undefined ? null : JSON.stringify(raw),
    fetchedAt: new Date(),
  };

  await db.cachedProduct.upsert({
    where: { code: product.code },
    create: { code: product.code, ...data },
    update: data,
  });
}

export async function cacheMiss(code: string, source: string): Promise<void> {
  const data = {
    found: false,
    title: null,
    brand: null,
    size: null,
    category: null,
    description: null,
    imageUrl: null,
    source,
    raw: null,
    fetchedAt: new Date(),
  };

  await db.cachedProduct.upsert({
    where: { code },
    create: { code, ...data },
    update: data,
  });
}

export interface ProductCacheCounts {
  total: number;
  misses: number;
}

export async function cachedProductCounts(): Promise<ProductCacheCounts> {
  const [total, misses] = await Promise.all([
    db.cachedProduct.count(),
    db.cachedProduct.count({ where: { found: false } }),
  ]);
  return { total, misses };
}

export async function clearProductCache(): Promise<number> {
  const { count } = await db.cachedProduct.deleteMany({});
  return count;
}
