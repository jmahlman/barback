-- Citrus garnishes used to be stored as the fruit's juice.
--
-- "twist", "wedge" and "slice" are also units of quantity ("1 twist of
-- orange"), so they were stripped before the ingredient was identified and
-- what remained was the bare fruit, which resolves to its juice. A recipe
-- asking for an orange twist was therefore recorded as wanting orange juice,
-- and a carton of it satisfied the garnish.
--
-- Only requirements are rewritten here. An inventory item's slug is the match
-- key its owner can edit by hand, so it is left alone -- and nothing stored
-- there was affected anyway, since a bare fruit still resolves to its juice.
--
-- "peel", "zest" and "wheel" never collapsed and need no migration.

UPDATE "recipe_ingredient"
SET "slug" = 'lime twist'
WHERE "slug" = 'lime juice'
  AND lower("name") LIKE '%lime%'
  AND lower("name") LIKE '%twist%';

UPDATE "recipe_ingredient"
SET "slug" = 'lime wedge'
WHERE "slug" = 'lime juice'
  AND lower("name") LIKE '%lime%'
  AND lower("name") LIKE '%wedge%';

UPDATE "recipe_ingredient"
SET "slug" = 'lime slice'
WHERE "slug" = 'lime juice'
  AND lower("name") LIKE '%lime%'
  AND lower("name") LIKE '%slice%';

UPDATE "recipe_ingredient"
SET "slug" = 'lemon twist'
WHERE "slug" = 'lemon juice'
  AND lower("name") LIKE '%lemon%'
  AND lower("name") LIKE '%twist%';

UPDATE "recipe_ingredient"
SET "slug" = 'lemon wedge'
WHERE "slug" = 'lemon juice'
  AND lower("name") LIKE '%lemon%'
  AND lower("name") LIKE '%wedge%';

UPDATE "recipe_ingredient"
SET "slug" = 'lemon slice'
WHERE "slug" = 'lemon juice'
  AND lower("name") LIKE '%lemon%'
  AND lower("name") LIKE '%slice%';

UPDATE "recipe_ingredient"
SET "slug" = 'orange twist'
WHERE "slug" = 'orange juice'
  AND lower("name") LIKE '%orange%'
  AND lower("name") LIKE '%twist%';

UPDATE "recipe_ingredient"
SET "slug" = 'orange wedge'
WHERE "slug" = 'orange juice'
  AND lower("name") LIKE '%orange%'
  AND lower("name") LIKE '%wedge%';

UPDATE "recipe_ingredient"
SET "slug" = 'orange slice'
WHERE "slug" = 'orange juice'
  AND lower("name") LIKE '%orange%'
  AND lower("name") LIKE '%slice%';

UPDATE "recipe_ingredient"
SET "slug" = 'grapefruit twist'
WHERE "slug" = 'grapefruit juice'
  AND lower("name") LIKE '%grapefruit%'
  AND lower("name") LIKE '%twist%';

UPDATE "recipe_ingredient"
SET "slug" = 'grapefruit wedge'
WHERE "slug" = 'grapefruit juice'
  AND lower("name") LIKE '%grapefruit%'
  AND lower("name") LIKE '%wedge%';

UPDATE "recipe_ingredient"
SET "slug" = 'grapefruit slice'
WHERE "slug" = 'grapefruit juice'
  AND lower("name") LIKE '%grapefruit%'
  AND lower("name") LIKE '%slice%';

