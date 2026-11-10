# Changelog

Release notes are generated from commit messages by the release workflow and
published to [GitHub Releases][releases], which is also where the app reads
them for Settings → Releases.

This file is for anything that does not fit in a commit subject: migration
notes, breaking changes, and decisions worth explaining.

[releases]: https://github.com/jmahlman/barback/releases

## Unreleased

Nothing yet.

## 0.3.0

**cocktail.glass is the new default recipe source.** Five hundred cocktails
in a single download, with no key to sign up for, and with the site's
permission for Barback to keep a local copy. Its data is structured rather
than written out as text — every ingredient has an amount, a unit and a type —
and garnishes come in their own list, so a missing lime wheel never stops a
drink showing as makeable. TheCocktailDB and API Ninjas are still there,
under Settings, if you prefer either.

**If you have ever saved the Settings page, you are still on TheCocktailDB.**
A choice saved there is kept, deliberately, so switching is one click in
Settings → Cocktail data. New instances start on cocktail.glass.

The published `docker-compose.yml` used to force TheCocktailDB into the
container environment for anyone who had not set `COCKTAIL_PROVIDER`, which
would have kept everyone on it regardless of the default. It now defaults to
cocktail.glass too.

Measures are shown exactly as each service publishes them, so cocktail.glass
recipes are in milliliters.

Discover now shows each cocktail once. Switching providers keeps the old
provider's saved cocktails (so switching back costs nothing), and about a
hundred classics are in both catalogs, so a Margarita could have appeared
twice. Discover now shows only the providers you are using, and where two
of them have the same drink, the copy from the one you prefer.

Discover says when each provider was last fetched. Saved cocktails never
expire or refresh on their own; for cocktail.glass, **Check again** now
always downloads the latest catalog, where before it was skipped for a week
after the last download.

If the provider you chose needs an API key and has none, Discover now says
so up front, and links to the setting, instead of offering a button that
could only fail. With fallback on, it says which provider lookups go to
instead. Settings says the same under the provider you picked.

**Matching rules are now settings.** Under Settings → Matching, the owner
can switch off each stand-in (simple syrup and sugar, lemon and lime, club
soda and sparkling water, cream and milk, bourbon and rye), make garnishes
count, or stop assuming ice, water, salt and pepper. Everything is on by
default, which is how matching worked before. Everyone else can see the
rules but not change them, and Inventory links to them. When a rule that is
off is why something shows as missing, the recipe page says so — "You have
Rittenhouse Rye, but Bourbon and rye is switched off" — with a link to it.

An olive no longer stands in for a cherry, or a cherry for an olive. Both
are garnishes, but they are not the same drink.

Water is no longer "covered by" tonic water, nor salt by celery salt. A
staple is only ever matched by itself; otherwise it is assumed on hand.

The setup page's notes about the sign-in mode and a missing
`BETTER_AUTH_SECRET` sat over the background photo and were hard to read; they
are now inside the administrator card. Spellings throughout are American
("Favorites", not "Favourites").

The Dockerfile and its entrypoint moved into `docker/`, and the development
Prisma config into `.config/`. `docker-compose.yml` stays where it was, so
`docker compose up -d` works as before. If you build the image yourself, it is
now `docker build -f docker/Dockerfile .`. The image also carries its OCI
source and license labels, and the LICENSE and NOTICE files.

## 0.2.1

**A lemon and a bottle of lemon juice are no longer the same thing.** Which
shelf you put something on now decides whether it can produce a garnish: a
lime in Fresh & Perishable covers a recipe asking for a lime wedge, peel,
wheel, zest or twist, and a carton of lime juice in Juices does not. You do
not have to mark anything — the shelf you already chose carries it, and the
add-a-bottle form now says so when you pick one of those shelves. The Juices
hint used to read "Lime, lemon, orange", which invited exactly the wrong
choice.

Asking for a twist, a wedge or a slice used to be recorded as asking for the
fruit's juice, because those words are also units of quantity ("1 twist of
orange") and were stripped before the ingredient was identified. They are
kept whole now, in either word order and singular or plural, so "2 wedges of
lemon" and "lemon wedge" are the same thing.

Existing recipes are migrated. Garnishes still never block a drink, so a
Negroni whose orange twist you cannot produce is still a Negroni you can
make — it just says so honestly.

**Citrus garnishes match the fruit again.** Asking for a lime peel, a lemon
zest, an orange wheel or a grapefruit twist showed as missing even with the
fruit in the fridge: those forms pointed at slugs that no inventory item
could ever hold, so they matched nothing at all. Lime had been left out of
the table entirely, and peel and zest pointed at a dead end for every fruit.
All of it — peel, zest, twist, wedge, wheel, slice — now routes through the
fruit itself.

Lemon and lime still stand in for one another, which they already did, and
the ingredient list says "Using Lime" rather than pretending you had the
lemon.

**There are tests now.** Eighty-four of them, covering the rules that decide
what your bar can make: barcode checksums, retail titles, brand-name
collapsing, substitutions, families, staples and the makeability score. They
need no new dependencies — Node runs them itself, through the TypeScript
loader this project already had — and they run in CI beside the lint and the
typecheck.

Two are marked as known gaps rather than passing: owning limes does not
satisfy a recipe calling for a lime peel or a lime wheel, and a bottle of lime
juice wrongly satisfies a lime twist. Both are recorded in the test output
instead of being quietly accepted.

**`npm run lint` works again.** It still called `next lint`, which Next 16
removed, so it could only ever error — and there was no linter configured at
all. Barback now uses [Biome](https://biomejs.dev): two packages rather than
the three hundred an ESLint setup pulls in, and it runs in CI alongside the
typecheck.

Its first pass found real things: a variable in discovery assigned three
times and never read, three unused imports, an unused prop, and an
`aria-label` on a `<span>` that screen readers would have ignored. The star
rating and the confirmation panels are now real `<fieldset>` elements instead
of a `div` wearing `role="group"`.

## 0.2.0

**Scan a bottle's barcode to add it to your inventory.** Point your phone at
the label and Barback fills in the name, brand, size and shelf. Scanning a
bottle you already track goes straight to "mark back in stock", which is the
whole point when you have just been to the shop.

Worth knowing:

- **Barcode scanning needs HTTPS.** Browsers only open a camera on a secure
  page, so reaching Barback at `http://nas.local:3000` will not do. Barback
  offers to decode a photo instead, which has no such restriction and works
  the same way.
- **Reading a barcode makes no network request.** The camera frames and the
  decoder stay in your browser, and the decoder is served by Barback rather
  than a CDN, so an instance with no internet access can still scan. Only the
  lookup goes out, and it sends the barcode and nothing else.
- **Lookups use UPCitemdb's free tier**, which allows 100 a day counted per IP
  address. Results are cached locally — including the bottles it has never
  heard of, so rescanning one does not spend the allowance again. Spirits
  coverage is patchy; when a bottle is unknown you type the name once and the
  barcode is saved with it, so it is a one-tap restock from then on. Add a key
  or switch lookups off entirely in Settings → Barcode lookup.

**Saving a cocktail from Discover now keeps its photograph.** The picture is
downloaded into your own uploads folder rather than linked, so a recipe in
your book stays intact if the provider reorganizes its files or you are
offline. The recipe page says where the photo came from, and putting your own
picture there replaces it and drops the credit.

**Recipe cards no longer download the whole photograph.** A card draws an
80px square but was fetching the full picture to do it. Barback now makes
smaller copies on demand and serves those — a 208 KB photo costs a card 5 KB
— and the recipe page takes a display-sized copy rather than the original.

**Tap a photo to see it full size**, on a recipe or on Discover. The larger
picture is only fetched when you actually ask for it, and a small one is shown
at its own size rather than blown up to fill the screen. Discover's artwork
still reaches you through Barback rather than from the provider directly.

**Photographs are resized before they are stored.** Uploading a picture
straight off a phone could fail outright: past the request size limit the
upload died in the framework before Barback could say anything, so the form
simply lost everything you had typed. Pictures are now shrunk in the browser
first — a 9 MB photo goes over the wire at well under 1 MB — and resized
again on the server, to 1600px on the long edge, whatever the browser did.
Anything still too large now gets a sentence explaining it rather than an
error page.

**Cocktail artwork is capped at 300×300.** Provider images were up to 700px
and were being stretched across the full width of a phone screen; they are
now re-encoded to WebP on the way in — about a fifth of the bytes — and shown
at the size they actually are. This matters more than it sounds: uploaded
pictures are served straight from disk without being resized on the way out.

**Show what you are typing.** Every masked field — the sign-in password,
first-run setup, the ones on the People page and the API keys in Settings —
now has a reveal toggle, which matters most on a phone in a dark room.

**Settings → Outside services.** A page listing everything Barback can
contact, what each one is told and when, and a link to its terms. It is not
the open-source license page: none of these is open source, and a commercial
data service does not belong under "licenses in use".

**Removed the last traces of social login.** Barback signs people in locally
or through a reverse proxy, but the People page still offered to leave a
password blank "for social login only" and told you they would sign in with
GitHub, Google or Apple. That copy is gone, and creating someone without a
password now says what will actually happen, which differs depending on how
your instance authenticates.

**Release notes now carry the changelog.** They were built from commit
subjects alone, which is not what you want to read when deciding whether to
update — and Barback shows its own release notes under Settings → Releases.

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
  discovery downloads the catalog once (about 440 drinks) and matches your
  shelf locally from then on. No premium key needed.
