-- Remember whether a recipe's photo came from the provider it was imported
-- from, so the page can credit it -- and so that credit disappears the moment
-- the owner puts their own picture there instead.
ALTER TABLE "recipe" ADD COLUMN "imageFromSource" BOOLEAN NOT NULL DEFAULT false;
