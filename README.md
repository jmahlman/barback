<div align="center">

<img src="docs/banner.png" alt="Barback — Your personal bar assistant." width="640">

**Your personal bar assistant.**

Track what is actually on your shelf, keep your own recipes, and find out what
you can make tonight. Self-hosted, one container, no account anywhere else.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)
[![CI](https://github.com/jmahlman/barback/actions/workflows/ci.yml/badge.svg)](https://github.com/jmahlman/barback/actions/workflows/ci.yml)
[![Container](https://img.shields.io/badge/ghcr.io-barback-2496ED?logo=docker&logoColor=white)](https://github.com/jmahlman/barback/pkgs/container/barback)

</div>

---

## Contents

- [What it does](#what-it-does)
- [API lookups only happen when you ask](#api-lookups-only-happen-when-you-ask)
- [Choosing a provider](#choosing-a-provider)
- [Settings](#settings)
- [Running it](#running-it)
  - [Behind a reverse proxy](#behind-a-reverse-proxy)
  - [Your data](#your-data)
- [Configuration](#configuration)
- [Authentication](#authentication)
  - [local (default)](#local-default)
  - [proxy](#proxy)
  - [none](#none)
  - [Account creation](#account-creation)
  - [Switching mode](#switching-mode)
  - [Break-glass administrator access](#break-glass-administrator-access)
  - [Which to choose](#which-to-choose)
- [Usernames](#usernames)
- [Releases and updates](#releases-and-updates)
  - [Cutting a release](#cutting-a-release)
  - [Updating an instance](#updating-an-instance)
- [Managing people](#managing-people)
- [Development](#development)
  - [Layout](#layout)
- [Built with](#built-with)
- [How AI is used](#how-ai-is-used)
- [Not done yet](#not-done-yet)
- [Licensing](#licensing)
  - [Barback itself](#barback-itself)
  - [Third-party code](#third-party-code)
  - [The photograph](#the-photograph)
  - [The wordmark typeface](#the-wordmark-typeface)
  - [Outside services](#outside-services)
- [Credits](#credits)

## What it does

**Inventory** — Everything behind your bar: spirits, liqueurs, vermouth,
bitters, syrups, juices, mixers, fresh ingredients and garnishes. Mark things
in or out of stock with one tap. Scan a bottle's barcode with your phone to
add it, or to put something you've just re-bought back in stock in one tap.

**Recipe book** — Your own drinks, with ingredients, measures, instructions,
glassware, method, garnish, notes, a photo and a rating. Dated tasting notes
let you record what you'd change next time.

**Photographs** — Take one, or let a saved cocktail bring its own. Pictures
are shrunk in the browser before they are uploaded and resized again on the
server, so a photo straight off a phone does not take an age to send or sit
on your disk at full size. Saving a drink from Discover copies its picture
into your own uploads folder rather than linking to it, so the recipe stays
intact if the provider reorganises its files — and the page says where the
photo came from until you put your own there. Tap any photo to see it larger.

**What can I make** — Every recipe is checked against your inventory and
labelled "you can make this" or "missing X". Optional ingredients and garnishes
never block a drink. A small amount of bartender knowledge is built in:

- Brand names collapse to their base: *Beefeater London Dry Gin* → `gin`
- Families: having *rum* covers a recipe calling for *white rum*
- Substitutions: *simple syrup* stands in for *sugar*, and the UI says so
- Staples like ice, water and salt are assumed rather than nagged about

**Discover** — The same matching run against an online cocktail database, so
you can find drinks you've never written down. It also tells you which single
bottle would unlock the most new drinks.

**Settings** — Choose which cocktail service to use and paste in your API
keys, without touching a config file or redeploying.

**People** — The owner can add accounts, set or replace passwords, sign
someone out everywhere, suspend an account, and delete one along with its
data.

## API lookups only happen when you ask

Barback never calls an outside service on its own. Loading, refreshing or
browsing any page makes zero outbound requests. A provider is contacted only
when you press one of these:

- **Check … now** on Discover
- **Look it up on …** next to the search box
- **Look it up on …** on a drink that isn't saved yet
- **Save to my book** when importing a drink
- **Test connection** on the Settings page
- **Scan a barcode** on Inventory, once a barcode has actually been read
- **Test lookup** in Settings → Barcode lookup

Everything fetched is cached in your own database, so afterwards Discover works
entirely offline. Every outbound call is logged to the server output as
`[cocktaildb] GET …`, `[apininjas] GET …` or `[upcitemdb] GET …`, so you can
confirm this for yourself. Clear the cache from Discover or Settings.

Reading a barcode is not a lookup. The camera frames and the decoder stay in
your browser — the decoder is served from Barback itself, not a CDN — so a
scan only becomes a request when there is a barcode to ask about, and then it
sends the digits and nothing else. Barcode lookups can be switched off
entirely in Settings; the scanner still fills the barcode in, and you type the
name yourself.

Structurally, nothing that renders a page is allowed to import a provider;
network calls live in `src/actions/` behind a button.

**One exception, and it is opt-in.** If you switch on automatic update
checking (Settings → Releases), Barback asks GitHub's public releases API
once a day whether there is a newer version. It is off by default, it sends
nothing about your instance, and the button beside it does the same thing on
demand. That is the only request Barback ever makes without being asked.

## Choosing a provider

Two services are supported. Pick one on the Settings page.

| | TheCocktailDB | API Ninjas |
| --- | --- | --- |
| Photos | yes | no |
| Glass, category, alcoholic | yes | no |
| Measures | separate field | embedded in the text, parsed out |
| Stable links to a drink | yes | no — matched by name |
| Results per search | unlimited | 10 |
| Multi-ingredient search | premium only | yes |
| Ingredient search, free key | **1 result** | up to 10 |
| Free tier | non-commercial, key `1` | non-commercial, monthly quota |

**TheCocktailDB is the default and the better fit.** Barback is a visual
recipe app, and it is the only one of the two with photographs, glassware and
stable per-drink links.

Its free key does cripple one thing: `filter.php?i=<ingredient>` returns a
single drink, and filtering on several ingredients at once is premium-only.
Searching your shelf one ingredient at a time would therefore return a
handful of arbitrary cocktails. Barback works around it by downloading the
whole catalogue once — about 440 drinks, complete with ingredients and
measures — and matching locally from then on. That is roughly 36 requests,
made once, and everything afterwards is offline.

API Ninjas is worth having as an alternative: it is the only one that can
filter on several ingredients at once, and it is a useful second source if
TheCocktailDB is down or you hit its limits. Two caveats worth knowing:

- Its ingredient search matches substrings, so asking for `gin` returns drinks
  whose only match is *ginger ale*. Barback filters those out after fetching,
  but they still consume part of the 10-result budget.
- Its ingredient strings mix measure and name together
  (`"1 1/2 oz Tequila, Lunazul Reposado"`). Barback parses these, keeping the
  measure exactly as published, but it is inference rather than structured data.

Fallback between providers is **off by default**. The two return noticeably
different data, and switching silently would change your results for reasons
the page does not show. Turn it on in Settings if you would rather have an
answer than an error.

## Settings

The Settings page holds the provider choice and both API keys. Values saved
there live in your database and take precedence over environment variables, so
you can rotate a key without redeploying. Keys are never sent back to the
browser — only a masked form showing the last four characters.

Settings belong to the **instance owner**, which is simply the first account
created. Other accounts see a locked page and are sent none of the
configuration.

## Running it

You need Docker. Nothing else — no separate database, no external services.

```bash
git clone https://github.com/jmahlman/barback.git && cd barback
```

`docker-compose.yml` points at the published image
(`ghcr.io/jmahlman/barback:latest`), so there is nothing to build. Swap it for
`build: .` if you would rather compile your own.

Create a `.env` next to `docker-compose.yml`:

```bash
printf 'BETTER_AUTH_SECRET=%s\n' "$(openssl rand -base64 32)" > .env
```

Then start it:

```bash
docker compose up -d
```

Open <http://localhost:3000>. A new instance shows a welcome page and asks you
to create the administrator account — every other page redirects there until
you do.

That account owns the instance: it manages everyone else, the cocktail API
keys, and how people sign in. **It keeps its password even if you later switch
to signing in through a reverse proxy**, which is deliberate — it is how you
get back in at the server's own address if the proxy is ever down. Store the
password somewhere safe.

Once you are in, set `ALLOW_SIGNUPS=false` in `.env` and run
`docker compose up -d` again, so nobody can register themselves. Add people
from the **People** page instead.

If you already run an SSO proxy, or want no login at all, see
[Authentication](#authentication) — you can switch from the Settings page
without a restart.

### Behind a reverse proxy

Set `BETTER_AUTH_URL` to the public URL, with no trailing slash:

```env
BETTER_AUTH_URL=https://bar.example.com
```

Serve it over HTTPS. Session cookies are marked secure on https URLs, and
**barcode scanning needs it too**: browsers only open a camera on a secure
page. `https://bar.example.com` is one, and so is `http://localhost:3000` on
the machine itself — but `http://nas.local:3000` and `http://192.168.1.50:3000`
are not, and no browser setting on a phone will make them one.

Reaching Barback that way is not the end of scanning. It offers to decode a
photo instead, which has no such restriction and uses your phone's own camera
app, so you still get autofocus and the flash. It is one tap more than live
scanning and reads the same barcode.

If your proxy injects a Content-Security-Policy, the decoder needs
`script-src 'wasm-unsafe-eval'`. Without it scanning fails with nothing but a
console error to show for it.

### Your data

Everything lives in the `barback-data` volume: `barback.db` (SQLite) and
`uploads/` (recipe photos). That volume is the whole backup.

```bash
docker run --rm -v barback-data:/data -v "$PWD":/backup busybox \
  tar czf /backup/barback-backup.tar.gz -C /data .
```

## Configuration

Every variable is optional except `BETTER_AUTH_SECRET`.

Anything cocktail-related here is only a starting value; the Settings page
overrides it.

| Variable | Default | Purpose |
| --- | --- | --- |
| `AUTH_MODE` | `local` | `local`, `proxy` or `none` |
| `BETTER_AUTH_SECRET` | — | **Required in `local` mode.** `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | `http://localhost:3000` | Public URL, no trailing slash |
| `ALLOW_SIGNUPS` | `true` | Starting value for the Settings toggle |
| `AUTH_PROXY_SHARED_SECRET` | — | `proxy` mode: strongly recommended |
| `AUTH_PROXY_ADMIN_GROUP` | — | `proxy` mode: group mapped to admin |
| `SINGLE_USER_NAME` | `You` | `none` mode: name, only if no account exists yet |
| `AUTH_LOCAL_ADMIN_FALLBACK` | `true` | `false` disables break-glass admin sign-in |
| `COCKTAIL_PROVIDER` | `cocktaildb` | `cocktaildb` or `apininjas` |
| `COCKTAIL_PROVIDER_FALLBACK` | `false` | Try the other provider on failure |
| `COCKTAILDB_API_KEY` | `1` | TheCocktailDB key |
| `API_NINJAS_API_KEY` | — | API Ninjas key |
| `BARCODE_LOOKUP` | `true` | `false` stops barcode lookups; scanning still works |
| `UPCITEMDB_API_KEY` | — | Optional. Blank uses UPCitemdb's free tier |
| `DATABASE_URL` | `file:/data/barback.db` | SQLite location |
| `UPLOAD_DIR` | `/data/uploads` | Where photos are written |

## Authentication

Pick one of three modes with `AUTH_MODE`. It takes a restart to change.

### `local` (default)

Barback's own email and password. The first account created becomes the
**instance owner**. Once you have yours, set `ALLOW_SIGNUPS=false` so nobody
else can register, and add people from the **People** page instead.

Barback sends no email, so there is no self-service password reset — the
owner sets passwords from People.

### `proxy`

For running behind Authelia, Authentik, Traefik forward-auth, oauth2-proxy,
Caddy, or anything else that authenticates first and passes the result on.
Barback reads the identity from request headers and creates the account the
first time it sees someone. Password sign-in is switched off entirely: the
endpoints return 404.

```env
AUTH_MODE=proxy
AUTH_PROXY_SHARED_SECRET=<openssl rand -base64 32>
AUTH_PROXY_ADMIN_GROUP=barback-admins
```

Default header names, which match Authelia and Authentik:

| Header | Purpose |
| --- | --- |
| `Remote-User` | Username. **This is what accounts are matched on.** |
| `Remote-Email` | Email. Used when no username arrives, and to fill one in. |
| `Remote-Name` | Display name. Optional. |
| `Remote-Groups` | Comma separated. Used for the admin mapping. |

Override any of them with `AUTH_PROXY_USER_HEADER`,
`AUTH_PROXY_EMAIL_HEADER`, `AUTH_PROXY_NAME_HEADER` and
`AUTH_PROXY_GROUPS_HEADER`.

**Matching happens on the username first.** Authelia sends
`Remote-User: john`, not an address, so an account you created as `john`
locally is the same account when the proxy later vouches for `john`. If your
proxy sends a username but no email, Barback stores a placeholder built from
`AUTH_PROXY_EMAIL_DOMAIN` (default `proxy.local`) and replaces it
automatically the first time a real address arrives — without creating a
second account.

> **Set `AUTH_PROXY_SHARED_SECRET`.**
>
> Header-based identity is only as trustworthy as the guarantee that nothing
> can reach Barback except through the proxy. That guarantee is easy to lose
> by accident — a published port, a second network on the container — and the
> failure is silent and total: anyone who can reach the app sets `Remote-User`
> to your username and is you.
>
> The shared secret is a second lock that does not depend on getting the
> network right. Barback checks it before reading any identity header, so a
> request that bypassed the proxy is refused outright. Configure your proxy to
> send it as `X-Barback-Proxy-Secret` (override with
> `AUTH_PROXY_SECRET_HEADER`).
>
> It is optional, because a properly isolated deployment does not strictly
> need it. Barback warns on startup and on the People page when it is unset.

Suspending someone in Barback blocks them even if the proxy still lets them
through, so you can cut off access without touching your directory.

#### Worked example: SWAG + Authelia

This is the common linuxserver.io setup. Authelia does the authenticating;
SWAG (nginx) does the proxying and is what actually talks to Barback.

**1. Keep Barback off the network.** This is the part that matters most.
Put it on SWAG's Docker network and publish no ports, so the only route in is
through the proxy:

```yaml
services:
  barback:
    image: barback:latest
    container_name: barback
    restart: unless-stopped
    # Note: no "ports:" section. SWAG reaches it by container name.
    networks:
      - swag
    environment:
      AUTH_MODE: "proxy"
      BETTER_AUTH_URL: "https://barback.example.com"
      AUTH_PROXY_SHARED_SECRET: "<openssl rand -base64 32>"
      AUTH_PROXY_ADMIN_GROUP: "barback-admins"
    volumes:
      - barback-data:/data

networks:
  swag:
    external: true

volumes:
  barback-data:
```

**2. Add the proxy conf** at
`/config/nginx/proxy-confs/barback.subdomain.conf` in SWAG:

```nginx
server {
    listen 443 ssl;
    listen [::]:443 ssl;

    server_name barback.*;

    include /config/nginx/ssl.conf;

    # Recipe photos. Barback shrinks them in the browser before sending, so
    # an upload is normally well under a megabyte; this is headroom for the
    # cases where it cannot.
    client_max_body_size 16M;

    # Authelia. Needed once per server block.
    include /config/nginx/authelia-server.conf;

    location / {
        # Requires an Authelia session, and sets the Remote-* headers.
        include /config/nginx/authelia-location.conf;

        include /config/nginx/proxy.conf;
        include /config/nginx/resolver.conf;

        set $upstream_app barback;
        set $upstream_port 3000;
        set $upstream_proto http;
        proxy_pass $upstream_proto://$upstream_app:$upstream_port;

        # Proves to Barback that the request came through SWAG.
        # Must match AUTH_PROXY_SHARED_SECRET exactly.
        proxy_set_header X-Barback-Proxy-Secret "<the same secret>";
    }
}
```

**3. Let Authelia protect the domain**, in its `configuration.yml`:

```yaml
access_control:
  rules:
    - domain: barback.example.com
      policy: two_factor
      # Optional: restrict to a group, and reuse it for Barback admins.
      subject:
        - "group:barback-users"
```

Nothing else is needed. `authelia-location.conf` already contains the
`auth_request_set` and `proxy_set_header Remote-*` lines that pass the
identity through, and Barback reads exactly those four header names by
default.

#### Why the secret is separate from Authelia

Authelia never sees the shared secret, and does not need to. The chain is:

```
browser → SWAG ──(auth subrequest)──→ Authelia
             │
             └──(Remote-User + X-Barback-Proxy-Secret)──→ Barback
```

Authelia tells SWAG *who* the person is. SWAG then calls Barback and attaches
both the identity and the secret. So the secret is a fact shared between SWAG
and Barback only — it goes in the nginx `proxy_set_header` line and in
Barback's environment, nowhere else.

It is worth being precise about what it does and does not protect:

- **It does not stop header spoofing through SWAG.** Nginx already handles
  that: `authelia-location.conf` sets `Remote-User` from Authelia's response
  with `proxy_set_header`, which overwrites whatever the browser sent.
- **It stops the proxy being skipped.** If Barback is ever reachable directly
  — a published port, a second Docker network, a host firewall change, a
  future `docker compose` edit — then without the secret, `curl -H
  'Remote-User: you' http://host:3000/` is a full login as you. With it, that
  request is refused before the identity headers are even read.

In other words, the secret turns "only SWAG can reach Barback" from an
assumption you have to keep true forever into something Barback checks on
every request.

#### If it is not working

Barback prints what it expects when it starts in proxy mode:

```
[auth] AUTH_MODE=proxy. Expecting these headers from your reverse proxy:
         user:   remote-user
         email:  remote-email
         name:   remote-name
         groups: remote-groups
         secret: x-barback-proxy-secret (required on every request)
```

And it says why any rejected request was rejected, naming the headers that
did arrive:

```
[auth] proxy request rejected: AUTH_PROXY_SHARED_SECRET is set but no
       x-barback-proxy-secret header arrived (received: remote-user,
       remote-email)
```

`docker logs barback` is the fastest way to tell the difference between
"SWAG is not forwarding anything", "the secret does not match", and
"Authelia is not populating the user". A browser that keeps landing on the
sign-in page tells you none of that.

### `none`

No authentication at all. Everyone who reaches the instance is the same single
user. Reasonable on a private network where the whole household shares one
bar; a bad idea anywhere else. Barback warns loudly on startup.

```env
AUTH_MODE=none
SINGLE_USER_NAME=You
```

There is nothing to sign in or out of, and the People page says as much.

### Account creation

Whether people can register themselves is a toggle on the Settings page,
under Authentication. `ALLOW_SIGNUPS` sets the starting value; after that the
toggle wins, and it applies on the next request.

It only applies in `local` mode. Under a proxy, accounts appear when your
proxy sends someone through, and with authentication off there is only one
account.

### Switching mode

The mode lives on the **Settings** page as a dropdown. Changing it spells out
what will happen, asks you to confirm, and takes effect on the very next
request — nothing restarts.

Two switches are refused outright, because they would lock you out:

- **To `local` without `BETTER_AUTH_SECRET`**, since sign-ins would not
  survive a restart.
- **To `proxy` when the request you are making did not come through a
  proxy.** If Barback cannot see the identity headers on your own request,
  no proxy is in front of it yet, and switching would leave no way in.

`AUTH_MODE` in the environment **overrides** the dropdown — the opposite of
every other setting, and on purpose. It is the way back in that does not
need a working login. Set `AUTH_MODE=local`, restart, and you are back; the
Settings page then shows the mode as fixed until you remove it again.

### Break-glass administrator access

In `proxy` and `none` mode the administrator can still sign in with a
password at the instance's own address — `http://host:3000` rather than
`https://barback.example.com`. This is what gets you in when the proxy is
down, misconfigured, or you are on the LAN.

It is deliberately narrow:

- **Administrators only.** An ordinary account with a password is refused,
  and told why rather than being bounced in a loop.
- **Inert until armed.** It does nothing until an administrator actually has
  a password, so an instance that has never had one has no password surface.
- **Visible.** The People page states whether it is ready, and the sign-in
  page says the form is there for administrators.

The first-run setup creates the account with a password, so this is ready
from the start. To arm or change it later, open **People**, pick the
administrator, and set a password. Switch it off entirely with
`AUTH_LOCAL_ADMIN_FALLBACK=false`.

### Which to choose

| | local | proxy | none |
| --- | --- | --- | --- |
| Separate accounts | yes | yes | no |
| Barback holds passwords | yes | no | no |
| Works with SSO / 2FA | no | via your proxy | no |
| Needs `BETTER_AUTH_SECRET` | yes | only for break-glass | no |
| Break-glass admin password | n/a | yes | yes |
| Exposed safely to the internet | with care | yes, via the proxy | **no** |

## Usernames

Every account has a username as well as an email, and **either one signs you
in**. The username is the important half: it is what reverse proxies send,
and what keeps one person as one account however they arrive.

- First-run setup asks for a username. The email is optional — Barback sends
  no mail, and a placeholder is stored if you leave it blank.
- Accounts created from the People page take a username too.
- Accounts created by self-registration get one derived from the email,
  with a numeric suffix if that is taken (`john`, then `john2`).
- Accounts provisioned by a proxy take the username it sends.

Usernames are lowercased and stripped to letters, numbers, dots, hyphens and
underscores, so `John` and `john` are the same person. A handful of names
such as `admin` and `root` are reserved.

The lookup from username to account happens on the server, and a wrong
username returns the same message as a wrong password, so the form cannot be
used to discover who has an account.

## Releases and updates

**Settings → Releases** lists every published release with its changelog,
rendered from the Markdown in the GitHub release. It also tells you whether
what you are running is behind.

Like everything else, opening the page makes no network request — it reads a
cached copy. Refresh it with **Check now**, or tick *Check once a day
automatically* and Barback will keep it current by itself.

When a newer release is known, the Settings entry in the navigation carries a
dot and the version number, and the Releases tile inside Settings is tagged
too. Only the instance owner sees it, since nobody else can act on it.
**Dismiss** on the release banner clears the badge until something newer than
the dismissed version appears, so it cannot nag you about an update you have
decided to skip.

Unauthenticated GitHub requests are capped at 60 an hour per IP, which is far
more than a daily check needs. Set `GITHUB_TOKEN` if you are behind a shared
address and hit the limit.

### Cutting a release

Releases are automated. Tagging is the only manual step:

```bash
npm version minor
```

```bash
git push --follow-tags
```

The tag triggers `.github/workflows/release.yml`, which:

1. refuses to continue if the tag and `package.json` disagree, so the version
   the app reports always matches the image;
2. builds the image for `linux/amd64` and `linux/arm64`;
3. pushes it to `ghcr.io/jmahlman/barback`, tagged with the full version,
   `major.minor`, `major`, and `latest` for non-prereleases;
4. writes release notes from the commits since the previous tag and publishes
   the GitHub Release — which is exactly what the app then shows.

A tag containing a hyphen (`v0.3.0-rc.1`) is published as a pre-release and
does not move `latest`.

`.github/workflows/ci.yml` typechecks, builds and builds the Docker image on
every push and pull request, so a tag is only ever cut from something that
already works.

### Updating an instance

```bash
docker compose pull && docker compose up -d
```

Migrations run automatically when the container starts. Your database and
uploads live on the `barback-data` volume and are not touched.

## Managing people

In `local` and `proxy` modes the owner gets a **People** page.

- **Add someone** (local only) with a name, username, optional email and
  optional password.
- **Set a password** (local only), replacing whatever they had.
- **Sign out of all devices** drops their sessions immediately.
- **Suspend** blocks sign-in by every route and revokes live sessions.
- **Delete** removes the account with its inventory, recipes and notes. This
  cannot be undone.

The owner cannot suspend or delete themselves, so an instance can never be
locked out of its own administration.

In `proxy` mode accounts appear by themselves the first time each person
arrives, so there is no Add button; everything else works the same.

## Development

```bash
npm install
cp .env.example .env     # then set BETTER_AUTH_SECRET
npx prisma migrate dev
npm run dev
```

Optional starter data — a stocked bar and four classic recipes — for an account
you've already created:

```bash
SEED_EMAIL=you@example.com npm run seed
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server on :3000 |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:migrate` | Create and apply a migration |
| `npm run db:studio` | Browse the database |
| `npm run seed` | Starter data (needs `SEED_EMAIL`) |
| `npm run licenses` | Regenerate the open-source licence list |
| `npm version <major\|minor\|patch>` | Bump the version and tag a release |

### Layout

```
prisma/schema.prisma           Data model and migrations
src/lib/ingredients.ts         Name normalisation, families, substitutions
src/lib/matching.ts            Makeability scoring and ranking
src/lib/settings.ts            Settings, database over environment
src/lib/auth-mode.ts           Which authentication mode is active
src/lib/setup.ts               First-run state
src/lib/identity.ts            Username rules, email-or-username telling
src/lib/releases.ts            GitHub releases and update checking
.github/workflows/release.yml  Tag -> image on GHCR -> GitHub Release
scripts/generate-licenses.mjs  Builds the licence list from node_modules
src/lib/session.ts             Resolves the current user, per mode
src/lib/owner.ts               Who owns the instance
src/lib/admin-context.ts       Marks admin-initiated user creation
src/lib/providers/types.ts     The provider interface
src/lib/providers/cocktaildb.ts   TheCocktailDB
src/lib/providers/api-ninjas.ts   API Ninjas
src/lib/providers/api-ninjas-parse.ts  Measure/name parsing (pure, testable)
src/lib/providers/cache.ts     Caching shared by all providers
src/lib/providers/registry.ts  Provider choice and fallback order
src/lib/products/upc.ts        Barcode validation (pure, testable)
src/lib/products/classify.ts   Product title -> name, size, shelf (pure)
src/lib/products/upcitemdb.ts  UPCitemdb, the only file that fetches
src/lib/products/cache.ts      Barcode lookups, hits and misses alike
src/lib/products/quota.ts      What is left of the daily allowance
src/lib/providers/artwork.ts   Fetching and shrinking a drink's picture
src/lib/providers/images.ts    Picking a provider image size
src/lib/image-resize.ts        Shrinking a photo in the browser, pre-upload
src/lib/uploads.ts             Stored photos, resizing and thumbnails
src/lib/discover.ts            Cache-only matching, plus the explicit scan
src/actions/                   Server actions; the only callers of a provider
src/app/                       Routes
src/components/                UI
```

Two rules worth preserving:

1. **Nothing that renders a page may call a provider.** Pages may import the
   registry for labels and capabilities, but every network call goes through
   `src/actions/`, behind a button.
2. **Adding a provider means implementing `CocktailProvider`** and registering
   it. Nothing else in the app knows which service the data came from.

## Built with

Next.js 16 · React 19 · Prisma 7 + SQLite · Better Auth 1.7 · Tailwind CSS 4 ·
TypeScript 6, on Node 26 LTS. All stable releases — no betas or release
candidates.

The image is around 560 MB, most of it the Prisma CLI that applies migrations
on startup. It's bundled deliberately: it means the container brings its own
schema up to date and you never run a migration by hand.

## How AI is used

**In development.** Barback was written from an empty repository by Claude,
Anthropic's coding model, across one long interactive session. The code, the
comments and this documentation were all written by it. My part was deciding
rather than typing: what to build, how authentication should work, which
cocktail services to use, the licence, and which third-party assets to
accept.

It is a personal project for my own bar, shared in case it is useful to
someone else. There is no automated test suite and it has not had an
independent security review — worth weighing before you expose an instance
to the internet.

**At runtime, there is no AI in Barback.** No model dependency, no inference
calls, no API keys for any AI service, no telemetry. Your inventory, your
recipes, your photos and your tasting notes live in a SQLite file on your own
disk and are never sent anywhere. The only outbound requests are the cocktail
and barcode lookups you press a button for and the optional daily update
check — see
[API lookups only happen when you ask](#api-lookups-only-happen-when-you-ask).

The longer version, including what gated the work, what did not, and the bugs
this approach produced, is in **[docs/AI-USAGE.md](docs/AI-USAGE.md)**.

## Not done yet

- **Sharing.** Everything is per-account and private; accounts cannot see each
  other's bars.
- **Email.** No invitation emails or self-service password resets, because the
  app sends no mail. The owner hands out credentials directly.

## Licensing

### Barback itself

**[GNU AGPL-3.0-or-later](LICENSE).** You may use, modify and redistribute
Barback, including commercially. In return:

- Keep the copyright and licence notices — that is the credit requirement.
- If you distribute a modified version, publish your changes under the same
  licence.
- **If you run a modified version as a network service, you must offer its
  source to the people using it.** This is the part that distinguishes AGPL
  from plain GPL, and it is the reason to choose it: it keeps improvements
  in the open even when nobody ships a binary.

Commercial use is allowed. Charging to host it is allowed. What is not
allowed is taking it private.

### Third-party code

Every package this build is made from is listed in the app under
**Settings → Open source**, with its version, licence and full licence text.
That page is generated from the installed dependency tree at build time by
`scripts/generate-licenses.mjs`, so it describes the exact image you are
running rather than whatever was true when someone last updated a document.

Regenerate it yourself at any time:

```bash
npm run licenses
```

At the time of writing that is 232 packages: 165 MIT, 26 ISC, 25 Apache-2.0,
and a handful of others. Two are worth knowing about specifically:

- **`@img/sharp-libvips`** is LGPL-3.0-or-later and *is* included in the
  runtime image. It is the libvips binary behind `sharp`, which Barback uses
  to resize photographs on upload and to make the smaller copies cards are
  served, and which Next.js uses for its own image optimisation. It ships as
  a shared library, which is how practically every Next.js deployment works.
  The licence text travels with it and is shown on the licences page.
- **`lightningcss`** (MPL-2.0), **`elkjs`** (EPL-2.0) and **`caniuse-lite`**
  (CC-BY-4.0) are build-time only and are not present in the runtime image.

Because the list is generated during the build, the platform-specific native
packages it names are the ones for the platform you built on — Linux binaries
in the Docker image, not whatever your laptop uses.

### The photograph

The sign-in background is *Brown wooden shelf with bottles* by
[Edgar Chaparro](https://unsplash.com/@echaparro), from
[Unsplash](https://unsplash.com/photos/brown-wooden-shelf-with-bottles-Lwx-q6OdGAc).

It is used under the [Unsplash License](https://unsplash.com/license), which
grants an irrevocable, worldwide, non-exclusive right to use, copy and modify
the photo for free, commercially or otherwise, with **no permission and no
attribution required**. Barback credits the photographer anyway, on the
sign-in page and on the licences page, because attribution is what keeps
photographers posting.

The licence does not permit selling the photo without significant
modification, or compiling Unsplash photos to build a competing service.
Neither applies here. The file lives at `public/images/bar.jpg`, resized to
1600px and recompressed from the original; replace it with anything you like.

### The wordmark typeface

The "Barback" logo is set in **Retro Gastroll** by
[Arterfak Project](https://arterfakproject.com/product/retro-gastroll-free/).

Both the vendor's page and the licence bundled with the font state it is
free with unlimited usage and unlimited copies, with one restriction: you may
not resell the font itself. Bundling it in an application is ordinary use and
is not resale. The licence as supplied is at
`public/fonts/retro-gastroll-license.txt`, and the foundry offers a custom
licence by email if you need something more explicit — worth doing if you
plan to redistribute Barback widely, since the terms are a short note rather
than a formal licence and say nothing specific about embedding in software.

It is applied only to the wordmark, through its own `--font-logo` token.
Headings keep the serif stack: Retro Gastroll is a display face and would be
hard work at body sizes. Swap it by replacing the file and the `@font-face`
rule in `src/app/globals.css`.

### Outside services

Recipes and imagery come from [TheCocktailDB](https://www.thecocktaildb.com/)
and [API Ninjas](https://api-ninjas.com/api/cocktail) when you ask for them.
Product details for a scanned barcode come from
[UPCitemdb](https://www.upcitemdb.com/). All of it is cached in your own
database, and each service has its own terms — the free tiers are for
non-commercial use. Get a production key from whichever you rely on before
putting an instance on the public internet.

None of them is ever told what is on your shelf. **Settings → Outside
services** lists each one in the app, with what it is sent and when.

## Credits

Recipe data and imagery: [TheCocktailDB](https://www.thecocktaildb.com/) and
[API Ninjas](https://api-ninjas.com/api/cocktail). Barback credits whichever
providers are configured, on Discover and on each drink.

Barcode product data: [UPCitemdb](https://www.upcitemdb.com/). Barcodes
themselves are read on your own device by
[barcode-detector](https://github.com/Sec-ant/barcode-detector) and
[zxing-cpp](https://github.com/zxing-cpp/zxing-cpp).

Sign-in photograph by [Edgar Chaparro](https://unsplash.com/@echaparro) on
Unsplash. Wordmark set in Retro Gastroll by
[Arterfak Project](https://arterfakproject.com/).

See [Licensing](#licensing) for the full picture. Inside the app,
**Settings → Outside services** lists every service Barback can contact, and
**Settings → Open source licenses** every package and its licence text.
