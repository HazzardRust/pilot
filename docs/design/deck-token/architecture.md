# deck-token: the deck takes a secret on loopback

Ticket `itm_f1e75f31d28b`. Merge: none (thread `itm_ee6b580fde54`: the public-repo move and the concise-prose
ticket share no route, client or store file). Base `pilot` at e01dbfc1. Grilling depth: every (`itm_53ea726508e6`).

## 1. Problem

The user asked what security problems running the pilot on a Mac could bring. The explorer found that the deck
daemon on `127.0.0.1:4321` takes no credential. Any local process can call its writing routes: post, resolve,
start a session, move a ticket. The Host and Origin guards stop browsers and DNS rebinding, but not a local
process that is not a browser.

## 2. Spec

Agreed by the user on itm_a6422d93cdc7 (2026-10-18), then changed by the user: reads in scope (A4, itm_257f34a7b234)
moved lines 1 and 3 and added line 8; the rotate pathway (A1, itm_9e8c2071d41e) added line 7.

| # | Behaviour | Evidence |
|---|---|---|
| 1 | The daemon has a per-store secret, `deck.secret` in the store dir: 32 random bytes as hex, created exclusively, 0600 on POSIX, reused on later starts (A1). Every POST without a matching secret gets 401. The check runs after the Host and Origin checks and before any handler. The 401 body never holds the secret. Reads: line 8 (changed by the user). | a server test: `POST /api/tool` without it is 401, with it 200; the 401 body does not contain the secret |
| 2 | Every non-browser client this package ships reads the file on each request and sends `Authorization: Bearer <secret>`: the MCP stdio client, `pilot wait`, the scratch seeder, hooks/lib/deck.js, `pilot run`, `pilot budget`, `pilot handoff`. If the file is missing, the error names its path and never a value. | 1 pin per client against a guarded server; a real-daemon `deck_post` + `pilot wait` round trip |
| 3 | The browser gets in through the deck's open file, `deck-open.html` (0600, A2). The file forwards to `GET /open?key=<secret>`, which sets the page credential (A3) and answers 200 with a same-origin forward to `/` (seam change, S3.md: a 303 from a `file://` start lands cross-site without the SameSite=Strict cookie). Forms, fetches and `/events` then carry it with no change to `deck/ui/js`. A request without it gets a 401 page saying to open the deck with `pilot deck`, which prints the open file's path (changed by the user: a bookmarked tab shows that page until reopened). | a test: `/open` with the key sets the cookie and forwards, a wrong key is 401; a press with the cookie is taken, one without gets the 401 page; seen in a browser |
| 4 | A scratch deck (`pilot deck --scratch`) has its own secret and open file in its own dir, and a cookie named by its port. A seeded run still shows. | the scratch tests pass unchanged; a test where two decks' cookies stand side by side and each deck takes only its own |
| 5 | The secret is never printed or posted. It appears in no deck.log line, no `/api/health` or 401 body, no CLI stdout (`pilot deck`, `--scratch`) and no item. | one sweep test over those outputs on a scratch deck |
| 6 | OPERATING.md says where the secret lives, what it does and does not stop, how to rotate it with `pilot deck --rotate`, and that it is never printed or posted. | a wording pin; `node scripts/check-references.mjs` exits 0 |
| 7 (added) | `pilot deck --rotate` replaces the secret: it deletes `deck.secret`, makes a new one, rewrites the open file and opens the deck through it. A running daemon takes the new secret on its next request and refuses the old one, and no client needs restarting (A1, itm_9e8c2071d41e). | a test: after the command the value differs, a POST with the old secret is 401 and one with the new is 200, and the open file holds the new key; stdout holds no secret |
| 8 (changed by the user) | Every GET needs the secret too, from the cookie or the Bearer header, bar three routes exempt by name: `GET /open` (it checks its own key), the UI's static assets (package code, no deck data, which the 401 page needs) and `/api/health` (L4). Every reading client sends it: `pilot tickets`, `pilot landing`, the record reader in `deck/schedule.mjs`, `pilot run`'s reads and `/events?wrapper=`, the hooks and the MCP client. | a server test: `GET /`, `/api/items`, `/thread/<id>` and `/events` 401 bare and 200 with either credential; `/api/health` and the UI files (`/ui/deck.mjs`, `/ui/favicon.svg`; the CSS is inlined, seam note S5.md) 200 bare; 1 pin per reading client against a guarded server |

Implied and stated: a same-user process can read a 0600 file, the agents' own Bash included. The secret stops other
OS users, and processes that reach loopback but not the user's files: sandboxed Mac apps, and containers (Docker
Desktop's `host.docker.internal` reaches host loopback and can set any Host). OPERATING.md says so (spec 6).
Cannot mean: "refuses any local process". Nothing on loopback can tell the user's own processes apart (L8).

## 3. Findings

- `deck/server-routes.mjs:69-104` `route`: `isOwnHost` (421) on every request, `isTrustedOrigin` (403) on every
  POST. `:63` `fromOwnPage` (an Origin equal to the Host) guards Sign off, Create, Start, Move and the others
  (`:243-538`). Any local process can set that header, so today an agent can curl a gate's Sign off. The secret
  does not change that (L8). `:775` `createDeckHttpServer` is the one factory; `deck/daemon.mjs:86`
  `startDaemon` is its only production caller.
- `deck/server-wait.mjs:243` `isTrustedOrigin`, `:263` `isOwnHost`: the guards a new `isAuthorized` sits beside.
- GETs that write: `GET /thread/<id>` clears a notice (`server-routes.mjs:190-195`). Kept tokenless (L4).
- Reads are open. `GET /api/items`, `/`, `/api/record` serve the whole deck to anything that reaches the port.
  ADR 0005 (`docs/adr/0005-one-deck-process-per-machine.md:13`) says so: "No authentication: anything on the
  machine can read the deck". In scope now (A4, spec 8).
- GET-only clients: `deck/tickets.mjs:128`, `deck/landing-wait.mjs:33`, `deck/schedule.mjs:81`; and `deck/run.mjs:354,422,449`.
  `/api/health` readers that run before or without the secret: `client.mjs` `isDeckUp` (inside `ensureDaemon`, before
  the daemon has written the file), `scratch.mjs:43` `healthPid`, `store-restore.mjs:87`, `procs.mjs:177`, and the
  hooks' `health()`. It answers `ok`, `pid`, `url`, `seq` and `rss`, and no item (`server-routes.mjs:573`).
- The store dir is `deck/store-dir.mjs:15` `storeDir()` (`PILOT_DECK_DIR` or `~/.claude/pilot`), where
  `deck.pid` already sits (`daemon.mjs:136`). The CommonJS hooks have no copy of that rule.
- POSTing clients, each with its own fetch: `deck/client.mjs:125` `get`/`post` and `:133` (MCP stdio),
  `deck/wait.mjs:95`, `deck/scratch.mjs:174`, `hooks/lib/deck.js:71` `request`, `deck/run.mjs:211,401,434`,
  `deck/budget.mjs:65`, `scripts/handoff.mjs:44`. `deck/ui/js/{inplace,reply,move}.mjs` post same-origin with no
  `credentials` option, so a cookie rides along. With no script, forms post natively (inplace.mjs, A3 there).
- CommonJS shared with ESM: `hooks/lib/atomic-write.js`, imported by `deck/daemon.mjs:25` and others.
- `deck/open.mjs:42` `openerFor` puts the URL in `open`/`xdg-open`/`start` argv. Jupyter Server opens a
  redirect file instead, for this reason (`use_redirect_file`, jupyter_server `serverapp.py`). macOS `ps` lists
  other users' argv.
- `deck/scratch.mjs:103` spawns a daemon with `PILOT_DECK_DIR`, `PILOT_DECK_PORT` and `PILOT_DECK_NO_OPEN`, and
  prints `url`, `pid`, `dir` (`bin/pilot.mjs:182`).
- Test reach: 134 POSTs over 82 test files. Most go to `deck/testUtils.mjs:84` `deckOnAPort`. Direct factories
  that POST: add-deck, handoff-unacked, skeleton. Real daemons that POST: daemon, gate2-base, scratch,
  hooks' held-handoff, inbox, owner-hooks.
- RFC 6265 §8.5: cookies do not isolate by port. One name across decks would clobber, and a cookie for
  `127.0.0.1` rides to every port on that host (A3).

### Seams

| Seam | Interface | Folded behind it | Category |
|---|---|---|---|
| deck secret (`hooks/lib/deck-secret.js`, new) | `deckDir()`, `secretFile(dir?)`, `ensureSecret(dir?)`, `readSecret(dir?)`, `bearer(dir?)`, `cookieName(port)` | `store-dir.mjs`'s dir rule (now delegates), and the header each client would build alone | local-substitutable (a temp `PILOT_DECK_DIR`) |
| request guard (`deck/server-wait.mjs`) | `isAuthorized(request, secret)`; `createDeckHttpServer({ secret })` | bearer and cookie parsing, constant-time compare | in-process |
| deck launch (`deck/launch.mjs`, new) | `writeOpenFile(dir, url, secret)`, `openCookie(port, secret)`; `GET /open?key=` | the URL `openDeck` put in argv | local-substitutable |

Deletion test. Without the deck secret, the file rule and header move into nine clients. Without the guard, the
compare moves into `route`. Without the launch, the redirect file moves into `daemon.mjs` and `scratch.mjs`.
All three earn their keep. The nine client fetch wrappers are shallow, but folding them into one HTTP client is
not this request. They each take `bearer()` instead. No fold slice.

## 4. Ubiquitous language

- **secret** — the 64-hex-character value in `deck.secret`, one per store, that every request to the deck carries.
  It is not a "token", which the store already refuses as a value shape, and not a "password".
- **guard** — the one check in front of every route that refuses a request without the secret with a 401. It is
  not a "middleware" and not an "auth layer".
- **open route** — a route the guard lets through without the secret: `GET /open`, the UI's static assets and
  `GET /api/health`. It is not a "public route": the Host and Origin checks still apply.
- **open file** — `deck-open.html`, the 0600 file that forwards a browser to `/open?key=`; the only way a browser
  gets in. It is not a "login page" and not a "launcher".
- **page credential** — what the browser carries after `/open`: the `pilot_deck_<port>` cookie (A3). It is not a
  "session": the deck keeps nothing for it.
- **rotate** — replacing the secret with a new one, by `pilot deck --rotate` or by deleting the file; the old
  value is refused from the next request on. It is not a "reset" and not a "logout".
- **same-user process** — anything running as the user, the agents' own Bash included. It can read the secret and
  is outside the threat model. It is not an "attacker" and not a "client".

## 5. Locked decisions

- **L1** Grilling depth is every (`itm_53ea726508e6`). Each decision below is posted as its own item.
- **L2** The secret is `crypto.randomBytes(32)` as hex, in `deck.secret` beside `deck.pid`, written with flag
  `wx` and mode `0o600`. Compared with `timingSafeEqual`. Rejected: an environment variable, which hooks and the
  browser never inherit; an HMAC per request, which costs a clock and buys nothing a static secret on loopback
  lacks. Answered: locked (itm_60bb8c81aff7).
- **L3** Non-browser clients send `Authorization: Bearer <secret>`. Rejected: a custom header (no reason to
  differ from the standard), and a query parameter (it lands in logs). Answered: locked (itm_79693c2762a6).
- **L4** (redefined after A4) The guard is one check in `route`, after `isOwnHost` (and `isTrustedOrigin` for a
  POST) and before any handler, on every method. A fixed list, `OPEN_ROUTES`, exempts `GET /open`, the `UI_ASSETS`
  and `GET /api/health`. Health stays open because `ensureDaemon` asks it before the daemon has written the file,
  and scratch, restore and `pilot ps` match a pid through it; it holds no deck data. Rejected: a check per route,
  which a new route forgets; guarding health, which makes "is a deck up" race the file being written. Answered: locked (itm_1ae905330bae).
- **L5** `createDeckHttpServer({ secret })` defaults to `ensureSecret()`, read on every POST (spec 7), and fails closed. Only an explicit
  `secret: null` serves unguarded, and `deck/testUtils.mjs` `deckOnAPort` passes it, so the 134 test POSTs over
  82 files stay as they are. The guard's own tests pass a string. Rejected: editing every test POST, which is a
  134-site diff for no new evidence. Answered: locked (itm_97e7fdec2ffe).
- **L6** The secret seam is CommonJS (`hooks/lib/deck-secret.js`), imported by ESM as `atomic-write.js` is.
  `store-dir.mjs` delegates to its `deckDir()`, so hooks and deck read one rule. Clients read the file on every
  request: the daemon may write it after a client starts, and deleting it rotates the secret. Rejected: an ESM
  module, which the hooks cannot load synchronously. Answered: locked (itm_18a7fb1613d4).
- **L7** A refusal names the file and never a value. API: 401 JSON `{ error: 'the deck wants its secret, from
  <path>' }`. Page: 401 text saying to open the deck with `pilot deck`. Rejected: 403, which says "never" where
  the fix is to authenticate. Answered: locked (itm_933be32afe57).
- **L8** Same-user processes are outside the threat model, and the docs say so. A 0600 file stops other users,
  not the user's own processes. Rejected: a second, page-only secret for gates. An agent can scrape it with
  `GET /`, as it can forge `fromOwnPage`'s Origin today. Answered: locked (itm_f29d2f246bec).

## 6. Assumed decisions

Posted on `itm_f1e75f31d28b`: A1 itm_9e8c2071d41e, A2 itm_bd5c8d0fd61d, A3 itm_8c4367b05c4c; A4 itm_257f34a7b234 (by `main`). Locked decisions posted one item each: L2 itm_60bb8c81aff7, L3 itm_79693c2762a6, L5 itm_97e7fdec2ffe, L6 itm_18a7fb1613d4, L7 itm_933be32afe57, L8 itm_f29d2f246bec; L1 answered (itm_53ea726508e6); L4, redefined after A4, posted on its own (see §5).

- **A1 Secret lifetime.** Default: create once and reuse until the file is deleted; rotation is deleting it.
  Trades away: a leaked secret lives until someone deletes it. Rejected: a fresh secret on every start. The
  10-minute idle exit (ADR 0136) restarts the daemon often, and each restart would log the tab out.
  Verdict: stands — judged on the queue and other runs.
  Answered: Persist until deleted, the default, after the user weighed rotation at session start (itm_9e8c2071d41e).
  Amended by the user on the same thread: "add a pathway to delete it rather than just a manual file delete". So spec 7
  (added): `pilot deck --rotate`, in S3. The guard reads the file on every POST rather than once at start; without that,
  a running daemon would keep the old secret after any rotation, a delete included.
- **A2 How the browser gets the key.** Default: the open file `deck-open.html` (0600), rewritten at each start
  with the port. `openDeck`, `pilot deck` and `pilot deck --scratch` point at that file, and the key never sits
  in argv. Trades away: one more file holding the secret, and `/open?key=` stays in browser history. Rejected:
  the URL in `open`'s argv, which macOS `ps` shows to other users (Jupyter's reason for `use_redirect_file`).
  Verdict: stands — the queued mac-linux ticket itm_1d6f74c3861a wants a hardened mac host; a 0600 open file fits it and moves no slice.
  Answered: Open file, the default (itm_bd5c8d0fd61d).
- **A3 The page credential.** Default: a cookie `pilot_deck_<port>=<secret>; HttpOnly; SameSite=Strict;
  Path=/; Max-Age=34560000`. No UI JS change, and the no-script form posts keep working. Trades away: cookies
  ignore ports, so the browser also sends it to other servers the user opens on `127.0.0.1` (not `localhost`).
  Rejected: `localStorage` plus a header and a hidden field on every form. It is origin-scoped, but costs a UI
  module, a guard that reads form bodies, and the no-script posts.
  Verdict: stands — nothing in the queue touches the page credential.
  Answered: Cookie, the default (itm_8c4367b05c4c).
- **A4 Reads stay open.** Default: out of scope, as ADR 0005 has it. Trades away: another OS user can read every
  thread over `GET`. Answered: overridden, in scope (itm_257f34a7b234), with the pilot's objection: "every reading
  client and the page's load change, about one more slice; a bookmarked tab shows the 401 page until reopened".
  This gives spec 8, redefines L4 and adds S5.
  Verdict: overturned: the user put reads in scope (itm_257f34a7b234); its replacement is L4 and spec 8, cut as S5.
- **A5 The spec itself.** Lines 1-6 as proposed. Answered: agreed (itm_a6422d93cdc7).
  Verdict: stands — the spec as agreed, amended by the user on A1 and A4.

## 7. Out of scope

- The store files' own modes (`deck.json` is 0644 under the default umask).
- Telling the user's own processes apart, including agents forging a page press (L8).
- TLS, a Unix socket in place of TCP, or moving off the fixed port.
- Folding the nine client fetch wrappers into one HTTP client.

## 8. Slices

Width 3; longest stem 3 (S1 → S3 → S4, S1 → S3 → S5).

| Slice | Title | Spec | Files owned | After | Reviewers | File |
|---|---|---|---|---|---|---|
| S1 | Walking skeleton: a POST without the secret is refused and the MCP client's is taken | 1, 2, 4 | `hooks/lib/deck-secret.js` (new), `deck/store-dir.mjs`, `deck/server-wait.mjs`, `deck/server-routes.mjs`, `deck/client.mjs`, `deck/wait.mjs`, `deck/scratch.mjs`, `hooks/lib/deck.js`, `deck/testUtils.mjs`, `deck/test/deck-secret.test.mjs` (new), `deck/test/deck-guard.test.mjs` (new), and the guarded-server tests' requests: `deck/test/{add-deck,handoff-unacked,skeleton,daemon,gate2-base}.test.mjs`, `hooks/test/{held-handoff,inbox,owner-hooks}.test.js` | – | ts, security | [S1](slices/S1.md) |
| S2 | pilot run, pilot budget and pilot handoff send the secret | 2, 8 | `deck/run.mjs`, `deck/budget.mjs`, `scripts/handoff.mjs`, `deck/test/run.test.mjs`, `deck/test/budget.test.mjs`, `scripts/test/handoff.test.mjs` | S1 (deck secret) | ts, security | [S2](slices/S2.md) |
| S3 | The browser gets in through the open file, and pilot deck --rotate replaces the secret | 3, 4, 7 | `deck/launch.mjs` (new), `deck/server-routes.mjs`, `deck/open.mjs`, `deck/daemon.mjs`, `deck/scratch.mjs`, `bin/pilot.mjs`, `deck/README.md`, `deck/test/open.test.mjs`, `deck/test/launch.test.mjs` (new) | S1 (server-routes.mjs, scratch.mjs, deck secret) | ts, security | [S3](slices/S3.md) |
| S4 | The secret is never printed, and OPERATING.md says where it lives | 5, 6 | `deck/test/secret-unprinted.test.mjs` (new), `docs/OPERATING.md`, `scripts/test/operating-secret.test.mjs` (new), `docs/adr/0164-the-deck-wants-a-secret-on-loopback.md` (status to accepted), `docs/adr/README.md` | S3 (deck launch's open line) | ts, security | [S4](slices/S4.md) |
| S5 | A read without the secret is refused, and every reading client sends it | 8 | `deck/server-routes.mjs`, `deck/tickets.mjs`, `deck/landing-wait.mjs`, `deck/schedule.mjs`, `deck/test/deck-reads.test.mjs` (new) | S3 (server-routes.mjs, the page credential) | ts, security | [S5](slices/S5.md) |

Between S1 and S2 the integration branch's `pilot run`, `pilot budget` and `pilot handoff` are refused by a
real deck. The gate stays green because their tests use `deckOnAPort`. The page's presses are refused until S3.
S5 comes after S3 so the page has its cookie before a read needs it. S2 sends the secret on its reads too, so it
runs beside S5 with no `after` between them.
No user runs the integration branch before Gate 2.

## 9. Acceptance evidence

In the order a user meets it, on a real deck:

1. `pilot deck` prints the open file's path and not the secret. Opening it lands on the deck, and a press is
   taken (spec 3, 5).
2. `pilot deck --rotate` prints no secret and opens the deck signed in again; the old secret now gets 401 (spec 7).
3. A plain `127.0.0.1:4321` tab in another browser gets the 401 page naming `pilot deck`, and reads nothing
   (spec 3, 8).
4. `curl -X POST http://127.0.0.1:4321/api/tool -H 'content-type: application/json' -d '{}'` and
   `curl http://127.0.0.1:4321/api/items` both get 401 with no secret in the body; `/api/health` answers (spec 1, 5, 8).
5. A pilot session's `deck_post`, `pilot wait`, its hooks, `pilot budget`, `pilot handoff`, `pilot tickets` and
   `pilot landing` all still work (spec 2, 8).
6. `ls -l ~/.claude/pilot/deck.secret` on a Mac or Linux shows `-rw-------` (spec 1).
7. `pilot deck --scratch --seed-run <run.json>` shows the seeded run. Its open file gets in, and the main deck's
   tab stays signed in (spec 4).
8. OPERATING.md's section reads as spec 6 says, and `check-references` exits 0 (spec 6).

### QA environment

Answered on itm_0f8196d35d70: a scratch deck (`pilot deck --scratch`) on this Windows machine, driven by a real
Chrome through the devtools tools, plus one `pilot wait` + `deck_post` round trip. The live deck on 4321 is never
touched. No migrations and no seed beyond the scratch seeder. Step 5 (the file mode) is read from the test on
Windows, where 0600 does not apply.

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
|---|---|---|---|---|---|---|
| S1 | planned | | | | – | 1, 2, 4 |
| S2 | planned | | | | S1 | 2, 8 |
| S3 | planned | | | | S1 | 3, 4, 7 |
| S4 | planned | | | | S3 | 5, 6 |
| S5 | planned | | | | S3 | 8 |
| deck-token | planned | | | | S1-S5 | 1-8 |
