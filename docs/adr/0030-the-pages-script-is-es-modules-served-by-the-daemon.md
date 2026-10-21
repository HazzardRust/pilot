---
status: accepted
date: 2026-09-24
tags: [deck-ui]
supersedes: []
superseded_by: []
paths: [docs/design/deferred-ledger/architecture.md, deck/ui/js, deck/testUtils.mjs]
---
# The page's script is ES modules served by the daemon

The deck's page ran one 1,481-line `deck/ui/deck.js`, inlined into every page through a `<!--JS-->` slot (deck-usability D2), and the only way a test could reach it was to read its text into `node:vm`. Node's coverage never saw that text as a module, so the ledger's ask, that coverage report the page's code, could not be met (spec 9–10 of `docs/design/deferred-ledger/architecture.md`). The user locked the answer as A4. We decided that the page's script is native ES modules under `deck/ui/js/`, and that the daemon serves them at `GET /ui/<name>.mjs` from a fixed allowlist. The list is the `.mjs` files in that directory, read when the daemon starts, and a request is answered only when its whole path is a key on it, so no part of a request is ever joined onto a directory. A module is served as `text/javascript; charset=utf-8` with `cache-control: no-cache`, behind `isOwnHost` like every route (L10). Each page carries `<script type="module" src="/ui/deck.mjs">` where the inline script was. A module script is deferred, so it runs where the end-of-body inline script ran. Each module exports `install(env)` and reads the page's globals off `env` and nothing else. The entry `deck.mjs` is the only module that touches `window`, and a test passes `aSandbox(...)` (L11). The split moves code and changes no behaviour (L12). S4 moves the usage readout into `usage.mjs` and the rest into `legacy.mjs`, whose `install(env)` is the old IIFE with its body unchanged, and S5 and S6 empty `legacy.mjs` region by region.

This supersedes deck-usability D2.

Rejected:
- Concatenating the modules back into the inline slot. It keeps D2, but the browser would then run text the tests never import: a home-made bundler.
- A bundler. That is a build step and a dev dependency for a 1,500-line script.
- Serving `deck/ui/js/` by joining the requested name onto the directory. One `..` or an encoded one away from serving any file the daemon can read.
- Modules that read `document` when they are imported. They cannot be tested without a `vm`, which is the thing being removed.

**Consequences**:
- `npm run coverage` (`node --test --experimental-test-coverage`, included to `deck/**`) measures the bytes the browser runs, because a test imports the same file the route serves.
- A page costs one request per module, where it used to cost none. On loopback that is not a cost anyone can see.
- The allowlist is read once, at startup. A module added to `deck/ui/js/` is served after the daemon restarts, which is also when the daemon picks up any other change to its own code. A module's bytes are read on each request, and `no-cache` makes the browser ask again on every load, so an upgraded deck is not run from a stale cached module.
- Module scope is strict. A sloppy-mode reliance found during the move is fixed in place and named in the slice's PR.
- A test that asserted something about a page's script by reading it off the rendered page now reads the page together with its modules (`withItsScript` in `deck/testUtils.mjs`), and every `node:vm` loader is replaced by one `loadLegacy(env)`. That helper goes when `legacy.mjs` goes.
- `daemon.test.mjs`'s check that no `closed` reaches the served page now covers markup and CSS only, because the script is no longer on the page.
