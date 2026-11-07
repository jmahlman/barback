-- Cocktail lookups are now namespaced per provider, so cached rows carry a
-- `provider` and the provider's own `externalId`, and the primary key becomes
-- "<provider>~<externalId>".
--
-- Both tables are pure caches of upstream data, regenerated on demand, so the
-- existing rows are discarded rather than migrated.
DELETE FROM "cached_drink";
DELETE FROM "cached_filter";

-- AlterTable
ALTER TABLE "recipe" ADD COLUMN "sourceProvider" TEXT;

-- CreateTable
CREATE TABLE "app_setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_cached_drink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "thumbUrl" TEXT,
    "category" TEXT,
    "alcoholic" TEXT,
    "glass" TEXT,
    "instructions" TEXT,
    "ingredients" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
DROP TABLE "cached_drink";
ALTER TABLE "new_cached_drink" RENAME TO "cached_drink";
CREATE INDEX "cached_drink_slug_idx" ON "cached_drink"("slug");
CREATE INDEX "cached_drink_provider_idx" ON "cached_drink"("provider");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
