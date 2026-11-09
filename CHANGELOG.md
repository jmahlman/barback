# Changelog

Release notes are generated from commit messages by the release workflow and
published to [GitHub Releases][releases], which is also where the app reads
them for Settings → Releases.

This file is for anything that does not fit in a commit subject: migration
notes, breaking changes, and decisions worth explaining.

[releases]: https://github.com/jmahlman/barback/releases

## Unreleased

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
your book stays intact if the provider reorganises its files or you are
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
the open-source licence page: none of these is open source, and a commercial
data service does not belong under "licences in use".

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
  discovery downloads the catalogue once (about 440 drinks) and matches your
  shelf locally from then on. No premium key needed.
