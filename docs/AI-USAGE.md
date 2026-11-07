# How AI is used in this project

It is a fair thing to want to know before running someone else's software, so
here is the long answer. The short one lives in the
[README](../README.md#how-ai-is-used).

## In the software you run: none

Barback contains no AI.

- No model, SDK or AI service appears in `package.json`. The full dependency
  list, with versions and licences, is in the app under
  **Settings → Open source** and is regenerated from `node_modules` on every
  build.
- There are no inference calls anywhere in `src/`.
- There is no telemetry of any kind. Nothing about your instance, your
  inventory or your recipes is reported anywhere.

Your data is a SQLite file and a folder of uploads on a volume you control.

Barback makes exactly two kinds of outbound request, both of which you turn
on yourself: a cocktail lookup when you press a button, and a daily check
against GitHub's releases API if you tick that box. Both are described in the
README under
[API lookups only happen when you ask](../README.md#api-lookups-only-happen-when-you-ask).

## In development: effectively all of it

Barback was not an existing project that gained AI contributions. It was
written from an empty repository by Claude, Anthropic's coding model, across
one long interactive session with the owner. The code, the comments, the
README and this file were all written by it.

The owner's part was deciding, not typing: what to build, what it should feel
like, which cocktail services to use, how authentication should work, the
licence, and which third-party assets to accept. Several times those
decisions reversed an earlier direction — social login was built and then
removed in favour of reverse-proxy authentication, and the licence moved from
"no commercial use" to AGPL-3.0 after discussion.

## What gated it

Honestly, less than a mature project would have.

- TypeScript in strict mode, a production build, and a Docker build, all
  clean before anything was considered done.
- Each feature exercised in a browser and again in a container — signing in,
  creating and deleting accounts, switching authentication modes, suspending
  someone and confirming their session actually died.
- The ingredient matcher checked against hand-written expectations, and the
  API Ninjas measure parser checked against twenty real API responses.
- Decisions with consequences — dependencies, external URLs, the licence,
  the font and photograph — were put to the owner rather than assumed.

## What did not gate it

- **There is no automated test suite.** The checks above were run once, by
  hand, at the time each feature was built. Nothing re-runs them.
- **No line-by-line human review.** The owner read summaries, looked at
  screenshots and made decisions. Claiming otherwise would be the untrue
  version of this document.
- **No independent security review.** The authentication work in particular
  — proxy header trust, break-glass admin access, session handling — would
  benefit from someone who did not write it looking at it.

## Where this has failed

Every one of these was written, and then caught, during the same session that
produced the code. They are listed because the pattern matters more than any
single bug: the mistakes were real, and several were the kind that would have
been quiet in production.

- **Suspending someone did not actually lock them out.** Sessions were cached
  in a signed cookie for five minutes, so a suspended or deleted account kept
  working until it expired. Found by testing the suspension rather than
  assuming it worked. The cookie cache is now off.
- **Turning authentication off would have hidden your entire bar.** The
  single-user mode created its own placeholder account instead of adopting
  the existing owner, so every bottle and recipe would have vanished from
  view. It looked exactly like data loss.
- **A permission check that never ran.** After a refactor,
  `if (!isLocalAuth)` was testing a function reference rather than calling
  it, so it was always false and the guard it protected did nothing.
- **A masked API key was sent to people who should not have had it.** The
  settings page hid it in the UI but still passed it as a prop, so it
  travelled to the browser anyway.
- **A tequila became a sweetener.** Ingredient normalisation collapsed
  "tequila 100% agave" to "agave syrup", which would have quietly produced
  wrong answers about what you can make.
- **A gitignore rule swallowed a generated file.** An unanchored `data/`
  matched `src/data/` too, so a fresh clone would not have typechecked.

## Verifying any of this

The repository is public and the history is honest, with one caveat worth
stating: **the initial import landed as a single commit.** There is no
incremental review trail for the first version, because there was no
incremental development — it arrived whole. Everything after that point is
ordinary commit history.

If something here is inaccurate, open an issue and it will be corrected.
