-- The cached catalogue key was spelled the British way.
--
-- Renaming it in code would orphan the row, and Discover would quietly
-- re-download the whole catalogue -- 36 requests to TheCocktailDB -- the next
-- time anyone pressed the button. Rewriting the key keeps the copy that is
-- already there.
UPDATE "cached_filter"
SET "key" = replace("key", 'catalogue', 'catalog')
WHERE "key" LIKE '%catalogue%';
