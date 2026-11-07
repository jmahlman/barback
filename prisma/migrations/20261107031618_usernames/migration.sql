-- Usernames become a first-class identity.
--
-- Reverse proxies identify people by username: Authelia sends
-- "Remote-User: john", not an email address. Without this column the same
-- person arrives as a different account depending on how they signed in.

-- AlterTable
ALTER TABLE "user" ADD COLUMN "username" TEXT;

-- Backfill from the local part of the email, but only where that produces a
-- value nothing else already claims. Anything ambiguous is left NULL for the
-- owner to set by hand, which is safe because the column is nullable.
UPDATE "user"
SET "username" = lower(substr("email", 1, instr("email", '@') - 1))
WHERE "username" IS NULL
  AND instr("email", '@') > 1
  AND NOT EXISTS (
    SELECT 1 FROM "user" AS other
    WHERE other."id" <> "user"."id"
      AND lower(substr(other."email", 1, instr(other."email", '@') - 1))
          = lower(substr("user"."email", 1, instr("user"."email", '@') - 1))
  );

-- CreateIndex
CREATE UNIQUE INDEX "user_username_key" ON "user"("username");
