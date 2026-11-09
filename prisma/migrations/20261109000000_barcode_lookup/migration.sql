-- Barcode scanning: a cache for product lookups, and an index that matches
-- how the scanner actually queries the inventory.

-- Lookups are cached whether or not they found anything. The free UPCitemdb
-- tier allows 100 requests a day for a whole instance, and spirits coverage
-- is patchy, so remembering a miss is worth as much as remembering a hit:
-- without it, rescanning the same unknown bottle spends the quota to learn
-- nothing. Not scoped to a user -- a barcode means the same thing for
-- everyone, so this is a response cache like "cached_drink", not user data.
CREATE TABLE "cached_product" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "found" BOOLEAN NOT NULL DEFAULT true,
    "title" TEXT,
    "brand" TEXT,
    "size" TEXT,
    "category" TEXT,
    "description" TEXT,
    "imageUrl" TEXT,
    "source" TEXT NOT NULL,
    "raw" TEXT,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Hits and misses expire on different clocks, so the lookup needs to find
-- them apart cheaply.
CREATE INDEX "cached_product_found_idx" ON "cached_product"("found");

-- The scanner always asks "does THIS user already have this barcode?", never
-- "who has this barcode?". The bare index on "upc" could not serve that, so
-- replace it rather than keeping a second one nobody reads.
--
-- Note there is deliberately no unique constraint on "upc": two accounts on
-- the same instance can own the same bottle, and a unique index would fail
-- the second one with an error that explains nothing.
DROP INDEX "inventory_item_upc_idx";
CREATE INDEX "inventory_item_userId_upc_idx" ON "inventory_item"("userId", "upc");
