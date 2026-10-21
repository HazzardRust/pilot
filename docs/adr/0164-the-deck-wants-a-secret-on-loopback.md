---
status: accepted
date: 2026-10-18
tags: [deck, security]
supersedes: [0005]
superseded_by: []
paths: [hooks/lib/deck-secret.js, deck/server-wait.mjs, deck/server-routes.mjs, deck/launch.mjs, deck/client.mjs, deck/store-dir.mjs, hooks/lib/deck.js, docs/design/deck-token/architecture.md]
---
# The deck wants a secret on loopback

This supersedes the "No authentication" consequence of ADR 0005. It keeps the rest: one deck per machine, on 4321, started by the first session that needs it.

We decided the deck takes a per-store secret on every request: a file, `deck.secret`, beside `deck.pid`, that every process client sends as a bearer header and the browser carries as a cookie, checked by one guard in front of every route bar three named open ones.

## Context

The deck daemon on `127.0.0.1:4321` took no credential. The Host and Origin checks stop browsers and DNS rebinding, but anything that reaches loopback could post, resolve, start a session, move a ticket and read every thread: another OS user on a shared machine, a sandboxed Mac app, a container reaching host loopback through `host.docker.internal`. The user asked what running the pilot on a Mac exposes. Ticket `itm_f1e75f31d28b`; the design is `docs/design/deck-token/architecture.md`.

## Decision

- **L2** The secret is `crypto.randomBytes(32)` as hex in `deck.secret`, in the store dir beside `deck.pid`, created exclusively with mode `0o600` and reused on later starts; compared with `timingSafeEqual`.
- **L3** Non-browser clients send `Authorization: Bearer <secret>`, reading the file on every request. The browser gets in through the 0600 open file `deck-open.html`, which forwards to `GET /open?key=<secret>`; that sets the `pilot_deck_<port>` cookie and redirects to `/`.
- **L4** One guard in `route`, after the Host and Origin checks and before any handler, on every method. A fixed list, `OPEN_ROUTES`, exempts `GET /open`, which checks its own key; the UI's static assets, which are package code holding no deck data and which the 401 page needs; and `GET /api/health`, which the launcher asks before the daemon has written the file, which `pilot ps`, scratch decks and `pilot store restore` match a pid through, and which answers a pid, URL, counter and memory figure, never a thread.

The user locked L2, L3 and L4 on 2026-10-18 (itm_60bb8c81aff7, itm_79693c2762a6, itm_1ae905330bae) and answered the assumed decisions:

| # | Decision |
|---|---|
| A1 | The secret persists until deleted; `pilot deck --rotate` replaces it and reopens the deck (itm_9e8c2071d41e, amended by the user to add the pathway). |
| A2 | The browser gets the key from the open file, never from `open`'s argv (itm_bd5c8d0fd61d). |
| A3 | The page credential is a cookie, so `deck/ui/js` and the no-script form posts stay as they are (itm_8c4367b05c4c). |
| A4 | Reads are in scope: every `GET` wants the secret too (itm_257f34a7b234, overriding the default of leaving reads open as ADR 0005 had them). |

## Rejected

- *An environment variable*: hooks and the browser never inherit it.
- *An HMAC per request*: costs a clock and buys nothing a static secret on loopback lacks.
- *A custom header*, with no reason to differ from the standard, and *a query parameter*, which lands in logs.
- *A check per route*, which a new route forgets.
- *Guarding `/api/health`*, which makes "is a deck up" race the file being written at startup.
- *A second, page-only secret for gates*: an agent can scrape it with `GET /`, as it can forge a page's Origin today.
- *A fresh secret on every start* (A1): the 10-minute idle exit (ADR 0136) restarts the daemon often, and each restart would log the tab out.
- *The key in `open`'s argv* (A2): macOS `ps` shows it to other users.
- *`localStorage` plus a header* (A3): origin-scoped, but costs a UI module, a guard that reads form bodies, and the no-script posts.
- *403 for a missing secret*: it says "never" where the fix is to authenticate; the refusal is 401, naming the file and never a value.

## Consequences

- **L8** Same-user processes are outside the threat model, and the docs say so. A 0600 file stops other OS users and processes that reach loopback but not the user's files; it cannot tell the user's own processes apart, the agents' own Bash included, and nothing on loopback can.
- **L5** `createDeckHttpServer({ secret })` fails closed: it defaults to the file, read on every request, so a rotation or a deletion takes effect at the next request with no restart. Only an explicit `secret: null` serves unguarded; `deckOnAPort` in `deck/testUtils.mjs` passes it, so the existing test requests stay as they are and the guard's own tests pass a string.
- A bookmarked deck tab shows the 401 page, which names `pilot deck`, until it is reopened through the open file.
- The cookie is sent to any other server the user opens on `127.0.0.1` (cookies ignore ports), and `/open?key=` stays in browser history.
