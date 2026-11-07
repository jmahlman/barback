-- AlterTable
ALTER TABLE "session" ADD COLUMN "impersonatedBy" TEXT;

-- AlterTable
ALTER TABLE "user" ADD COLUMN "banExpires" DATETIME;
ALTER TABLE "user" ADD COLUMN "banReason" TEXT;
ALTER TABLE "user" ADD COLUMN "banned" BOOLEAN DEFAULT false;
ALTER TABLE "user" ADD COLUMN "role" TEXT DEFAULT 'user';

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- Existing installs: the instance owner was previously "whichever account was
-- created first". Promote that account so the rule now lives in a real role.
UPDATE "user"
SET "role" = 'admin'
WHERE "id" = (SELECT "id" FROM "user" ORDER BY "createdAt" ASC LIMIT 1);
