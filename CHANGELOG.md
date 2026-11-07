# Changelog

Release notes are generated from commit messages by the release workflow and
published to [GitHub Releases][releases], which is also where the app reads
them for Settings → Releases.

This file is for anything that does not fit in a commit subject: migration
notes, breaking changes, and decisions worth explaining.

[releases]: https://github.com/jmahlman/barback/releases

## Unreleased

Nothing yet.

## 0.1.0

First release.

Inventory, a recipe book, and discovery that tells you what your shelf can
actually make — from your own recipes and from TheCocktailDB.

Worth knowing on a fresh install:

- **The first account you create owns the instance.** It keeps a password
  even if you later move to reverse-proxy authentication, which is how you
  get back in at the server's own address if the proxy is unavailable.
- **Nothing is requested from the internet unless you ask.** Cocktail
  lookups happen on a button press; the daily update check is off until you
  turn it on.
- **TheCocktailDB's free key returns one drink per ingredient search**, so
  discovery downloads the catalogue once (about 440 drinks) and matches your
  shelf locally from then on. No premium key needed.
