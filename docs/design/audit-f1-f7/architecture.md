# Audit F1-F7: deck reads, test loop, scratch deck, deck map and split

Ticket `itm_f323d36f1473` · slug `audit-f1-f7` · base `pilot` 178c7e5e · source: the housekeeping audit of 2026-10-09
(`~/.claude/pilot/audits/c_users_hazzard_projects_pilot-01e1a5f943/2026-10-09T14-16-20-000Z.md`, rows F1-F7).

## 1. Problem

The audit measured what makes an agent in this repository slow and expensive. Reading one thread costs a
`deck_read` of 115 KB. A green `npm test` prints 231 KB. One fake server that leaves a request open hangs the
suite until the 120 s cap. Every QA agent hand-rolls its own scratch deck. There is no map of the repository or
of the deck. And three deck files are too long to read in one go. The user: "put the first 7 of those into a ticket".

## 2. Spec

Agreed by the user on itm_09b0d748c277, as the 10-line proposal that became the 13 lines below. Line 13's scope
is the user's "Split all five" (itm_949553df1d2f, L14).

| # | Behaviour | Evidence |
| --- | --- | --- |
| 1 | `deck_read {id}` returns that item and its replies only. An unknown id is refused by name. It hands over that item's replies under today's rule (only owned threads, only when the run is named). | `deck_read {id}` text < 5 KB, against 115242 chars for `{limit:40}`. The existing deck_read tests stay green. |
| 2 | `deck_read {brief:true}` returns one line per item (id, kind, state, owner, reply count, title) and no bodies. It combines with `open`, `limit` and `repo`. | `{brief:true, open:true}` < 3 KB for 20 items. |
| 3 | `deck_read`'s tool schema stays at or under its current 467 bytes. QA's prompt pin has 0 headroom and the pilot's has 7.25 tokens, and both agents are granted the tool. | `measure-prompt.test.mjs` and `qa-preview.test.mjs` are green with their budgets unmoved. |
| 4 | `GET /api/items` answers JSON. It takes `id`, `open`, `brief` and `limit` as query parameters, makes the same selection as deck_read, and marks nothing delivered. | `curl -w '%{content_type}'` prints `application/json`, where `/items` gave text/html at 966677 B. |
| 5 | `npm run test:quiet` runs the same files as `npm test` with the dot reporter, and still prints a failing test's name and diff. | Green output < 10 KB (`wc -c`) and the same pass count as `npm test`. A planted failure's name shows. |
| 6 | `npm test` and `npm run coverage` pass `--test-timeout=60000`. A test whose fake leaves a request open fails by name, and the suite does not hang. | The audit's run-hang copy (no `/api/chain` answer) exits non-zero in < 90 s and names the test. |
| 7 | Every fake deck in `deck/test/run.test.mjs` answers 404 to a route it does not model. | A new test gets 404 from `/api/unknown` on each fake. |
| 8 | `pilot deck --scratch [--port N]` starts a detached deck with a fresh temp store on a free port (or N) and opens no browser. It prints its URL, pid and store directory, and it outlives the shell that started it. | `/api/health` on the printed URL answers 200 after the starting shell exits. The mtime of `~/.claude/pilot` is unchanged. |
| 9 | `pilot deck --stop <pid>` stops only a deck that `--scratch` started, and removes its temp store. It refuses any other pid, the live 4321 deck's included. | After stop the connection is refused and the store dir is gone. `--stop` with the live deck's pid is refused and that deck still answers. |
| 10 | `--seed-run <run.json>` registers a run (repo is the record's `worktree`, pid is the scratch daemon's) and writes the record. `docs/INSTALL.md` and `agents/pilot-qa.md` name the command. | `GET /api/runs` lists the run and `GET /api/record?repo=<worktree>` returns the record. A grep finds `--scratch` in both docs. The QA pin is unmoved. |
| 11 | `docs/architecture.md`, about 60 lines, maps bin, deck, hooks, agents, skills, rules and scripts. It links `CONTEXT.md` and `docs/adr/README.md`, and README links it. | Greps for `CONTEXT.md` and `docs/adr` in it, and for `docs/architecture.md` in README.md. |
| 12 | `deck/README.md` (new) gives every `deck/*.mjs` and `deck/ui/*.mjs` a one-line purpose and gives the entry order bin/pilot.mjs, daemon.mjs, server.mjs, store.mjs. README's Layout covers every top-level directory and says where to start. | A test pins that the README's module list equals the directory listing. `ls` of the root matches the Layout rows. `grep -i 'start here' README.md` matches. |
| 13 | `deck/ui/render.mjs`, `deck/store.mjs`, `deck/server.mjs`, `deck/run.mjs` and `deck/items.mjs` are split by concern into modules of ≤ 800 lines each. Each old path stays as a re-exporting facade, so every import keeps resolving. | `wc -l` of every non-test deck source file shows none over 800. `npm test` passes the same count. `git grep` of the five import specifiers returns the same paths. |

## 3. Findings

| Area | What exists | Anchor |
| --- | --- | --- |
| deck_read | Selection, owner and hand-off live in one branch of `callTool`. It has `limit`, `open` and `repo`, with no id and no brief. | `deck/server.mjs:841-877`; schema `deck/tools.mjs:195-216` |
| Prompt pins | Tool schemas count toward an agent's prompt share. deck_read is 467 B. Pilot is at 10037/10044.25. QA is at 4357.25/4357.25. Explorer is at 2208.5/2209 and is not granted deck_read. | `scripts/test/measure-prompt.test.mjs:127`; `scripts/test/qa-preview.test.mjs:135` |
| Stdio cursor | `deck/client.mjs` treats deck_read as a read that never moves the wait cursor. | `deck/client.mjs:224,287,361` |
| /items | `GET /items` renders HTML. There is no `/api/items`, so the request falls through to the page. `isOwnHost` guards every route. | `deck/server.mjs:1141`, `:362` |
| Test scripts | `"test": "node --test"`, plus coverage. Node 26.1. There is no per-test timeout. | `package.json` |
| Fakes | `deckHolding` answers every non-`/api/record` URL as a tool call. `deckWatching` answers every unknown POST as a tool call. A third fake answers everything 200. Teardown is `server.close`, which waits on open sockets. | `deck/test/run.test.mjs:116,512,1349` |
| Deck start | `ensureDaemon` spawns the daemon detached (`stdio:'ignore'`, `windowsHide`, `unref`). The store dir is `PILOT_DECK_DIR`, the port is `PILOT_DECK_PORT`, and `openDeck` stays silent when either is set. `/api/health` returns `{ok,pid,url,seq}`. | `deck/client.mjs:128-160`; `deck/store-dir.mjs:11`; `deck/open.mjs:65`; `deck/server.mjs:1529` |
| CLI | `pilot deck` reads only `argv[1]`, and only `--foreground` is known. | `bin/pilot.mjs:107-129` |
| Runs vs records | A run is a session registration with a live pid (`POST /api/runs`, `registerRun`). A record is `records[]` in deck.json, served by `/api/record`. | `deck/store.mjs:1549-1590,1832`; `deck/runs.mjs:117-163` |
| QA today | `pilot-qa.md` describes the hand-rolled scratch deck, and the warning never to kill by a process sweep. | `agents/pilot-qa.md:50-55,88-96` |
| Maps | There is no `deck/README.md` and no `docs/architecture.md`. README's Layout omits `bin/`, `hooks/` and `vendor/`. There are 99 ADRs. | `README.md:88-101` |
| Split | render (2267 lines) is pure functions in 12 regions with 9 exports, served only server-side. `deck/ui/js/*` is the browser allowlist, so nothing new may go there. store (2144) has no module-level state; deck.json is its only handle. server (1729) shares one `changes` emitter, and its `route()` is a single 617-line function. | `deck/server.mjs:136-158`; `deck/test/ui-route.test.mjs:74` |
| Split pins | `days.test.mjs:295` counts `RECENT_DAYS` in render.mjs's source. `create.test.mjs:204` greps store and server text. `daemon.test.mjs:1515` keeps store and server out of the stdio graph. | as named |
| Overlaps | #451 (open, base main) changes `deck/store.mjs` and `deck/tools.mjs`. #445 (open, base main) changes `bin/pilot.mjs`, `deck/server.mjs`, `deck/store.mjs`, `deck/items.mjs`, `deck/status.mjs`, `deck/ui/render.mjs` and `deck/testUtils.mjs`. | `gh pr view 451/445` |

## 4. Ubiquitous language

- **Brief read**: a read that returns one line per item and no bodies.
- **Scratch deck**: a deck that `pilot deck --scratch` started on a temp store and a non-default port, recorded in the scratch registry.
- **Scratch registry**: one file per scratch deck, `<os.tmpdir()>/pilot-scratch-<pid>.json` holding `{pid, port, dir}`. It is the only thing `--stop` trusts.
- **Seeded run**: a run registered against the scratch daemon's own pid, with its record written beside it.
- **Facade**: the old module path, reduced to re-exports of the modules its body moved into.

## 5. Locked decisions

| # | Decision | Rationale | Rejected |
| --- | --- | --- | --- |
| L1 | Item selection moves to a new pure module, `deck/read.mjs`. It takes items and query options and returns the chosen, shaped items. `callTool` and `GET /api/items` both call it, and the hand-off stays in `callTool`. | One seam for two adapters. It is testable without the server, and server.mjs does not grow before it is split. | Duplicate the filter in the route; or put it in store.mjs, which #451 is changing. |
| L2 | The two new deck_read properties are paid for inside the schema's own text, which stays ≤ 467 B. | Prompt budgets never move, and QA has 0 headroom. | Raising the pins; or trimming agent prose in an unrelated slice. |
| L3 | `/api/items` marks nothing delivered, as `/api/record` does. | Hand-off belongs to a session's tool call (ADR 0041). A curl must not mark a reply "the pilot has it". | Mirroring deck_read's hand-off. |
| L4 | `test:quiet` is `node --test --test-reporter=dot --test-timeout=60000`. | It is the built-in reporter and needs no dependency. | A custom reporter file. |
| L5 | The hang is cured in two places: the timeout in the scripts, and each fake's teardown ending its open connections (`closeAllConnections`) before `close`. Amended by S5 (#479), seam change within the rails: the measured leak was each failed test's `wrapper.watch` loop retrying a closed fake, so seven watch and wait tests in `run.test.mjs` abort it in `t.after`; the two named cures stay (23 s to exit without `closeAllConnections`, 8 s with it). | A timeout alone fails the test, but a `t.after` `server.close` still waits on the open socket. | The timeout only; or `--test-force-exit`, which hides leaks. |
| L6 | The scratch starter lives in a new module, `deck/scratch.mjs`, and `bin/pilot.mjs` only dispatches to it. The starter picks the port (or takes N) and spawns `daemon.mjs` with `ensureDaemon`'s recipe, setting `PILOT_DECK_DIR`, `PILOT_DECK_PORT` and `PILOT_DECK_NO_OPEN=1`. It polls health and writes the registry. | It reuses the proven detach. `ensureDaemon` would reuse the live deck. Setting the port in the parent keeps `/api/health`'s `url` right. | `startDaemon({port:0})`, whose `deckUrl()` would then be wrong. |
| L7 | `--stop` kills only a pid listed in the scratch registry whose health still reports that pid. It then removes the dir and the registry file. | On 2026-09-19 a sweep killed the live deck, and Windows kill skips the daemon's own cleanup. | Killing any pid given; or leaving temp dirs behind. |
| L8 | Seeding goes through the scratch deck's own HTTP API after health answers: `POST /api/runs` with the daemon's pid, then the record write path `deck_status` already uses. Nothing writes deck.json from outside. | This keeps a single writer and preserves the validation (`recordFields`). | Pre-writing deck.json before spawning. |
| L9 | The new modules are flat siblings with prefixes: `deck/server-*.mjs`, `deck/store-*.mjs`, `deck/ui/render-*.mjs`. | `deck/` is flat, `UI_DIR` is resolved from `import.meta.url`, and `deck/ui/js/` is the served allowlist. Spec 12's list stays a plain `ls`. This corrects the subdirectories named in the first proposal to `main`. | `deck/store/`-style subdirectories. |
| L10 | A facade re-exports an explicit public list. The names its modules share internally are not re-exported. `deck/test/facades.test.mjs` pins each facade's export names and the line count (≤ 800) of each new module. | Every existing import is unchanged, the public surface is unchanged, and the bar is a test, not a one-off `wc`. | `export *`, which would leak private helpers into the surface. |
| L11 | Each F7 slice is a move with no edits. The only allowed changes are import lines, one `readUiFile` path, and the source pins named in §3, which are pointed at the new files. | A reviewer can check a move with `git diff --color-moved`. | Tidying while moving. |
| L12 | F7 goes last. Every F7 slice waits for #445 and #451 to reach `pilot`. F1 waits for #451, and S6 waits for #445. | No slice gets rebased onto code that has moved. | Splitting first.  overridden: on 2026-10-09 the user said on itm_f323d36f1473 "assume that the other tickets landed on main and write on top of them as if they are true"; feat/co-pilot-successor (a7a8ec9b) and feat/user-threads-open (72e27af8) were merged into feat/audit-f1-f7 (4746f1f0, 68ee4a67) and the waits are lifted. The objection: if either PR changes before it merges, this feature re-merges it. |
| L13 | F6's pin test (`scripts/test/deck-readme.test.mjs`) lands before F7, so each F7 slice adds its new modules to `deck/README.md`. | The map stays true as the split lands. | Writing the map after the split, which delays F6 behind the whole of F7. |
| L14 | F7 splits all five deck files over 800 lines, adding `run.mjs` (S19) and `items.mjs` (S20) as two more mechanical moves behind facades at the end of the F7 chain. The user chose "Split all five" on itm_949553df1d2f and held it after pushback ("yeah"). Overridden: run.mjs is 5 lines over, so its split is a facade for 5 lines; items.mjs is also changed by #445, so its slice rebases onto that landing; 18 → 20 slices leaves no headroom under the one-run bound. | The user's call. The audit's bar holds for every non-test deck source file. | Naming the three files only (the recommended default). |

Forks from the user, recorded: grilling depth is *forks* (itm_c69b70d36193). QA runs on a scratch deck that F4's own
`pilot deck --scratch` starts, seeded with a run record and measured by curl, with the suite run in QA's worktree. It never
uses 4321 or `~/.claude/pilot` (itm_c741107b02a7).

## 6. Assumed decisions awaiting the user

| # | Default taken | Tradeoff | Asked |
| --- | --- | --- | --- |
| – | None open. | | |

## 7. Out of scope

- Audit rows F8-F18, including the CRLF pin, the MAX_PATH worktree, dead code, and the missing typecheck or lint.
- Splitting `deck/ui/deck.css` or `hooks/gateguard-fact-force.js`.
- Changing `npm test`'s reporter, or any test's speed.
- Rewriting `route()` into smaller functions. F7 moves it whole.
- A Windows service, or a scratch deck that survives a reboot.

## 8. Slices

Diff limit: 200 changed lines per slice. F7 slices count moved lines separately; see each slice file.

| Slice | Title | Spec | Files owned | After | File |
| --- | --- | --- | --- | --- | --- |
| S1 | An agent reads one thread by id (walking skeleton) | 1, 3 | `deck/read.mjs` (new), `deck/server.mjs` (deck_read branch), `deck/tools.mjs` (deck_read schema), `deck/test/read-one.test.mjs` (new) | #451 on pilot | [S1](slices/S1.md) |
| S2 | A brief read lists the deck in one line per item | 2, 3 | `deck/read.mjs`, `deck/tools.mjs` (deck_read schema), `deck/test/read-brief.test.mjs` (new) | S1 | [S2](slices/S2.md) |
| S3 | `GET /api/items` answers JSON | 4 | `deck/server.mjs` (route), `deck/test/api-items.test.mjs` (new) | S2 | [S3](slices/S3.md) |
| S4 | `npm run test:quiet` prints dots and failures | 5 | `package.json` (scripts), `scripts/test/test-quiet.test.mjs` (new) | – | [S4](slices/S4.md) |
| S5 | A hung fake fails its test by name | 6, 7 | `package.json` (scripts), `deck/test/run.test.mjs` (fakes), `scripts/test/test-timeout.test.mjs` (new) | S4 | [S5](slices/S5.md) |
| S6 | `pilot deck --scratch` starts an isolated deck | 8 | `deck/scratch.mjs` (new), `bin/pilot.mjs` (deck dispatch, usage), `docs/INSTALL.md`, `deck/test/scratch.test.mjs` (new) | #445 on pilot | [S6](slices/S6.md) |
| S7 | `pilot deck --stop` stops only a scratch deck | 9 | `deck/scratch.mjs`, `bin/pilot.mjs` (deck dispatch), `deck/test/scratch-stop.test.mjs` (new) | S6 | [S7](slices/S7.md) |
| S8 | `--seed-run` loads a run record, and QA uses the command | 10 | `deck/scratch.mjs`, `bin/pilot.mjs` (flag), `agents/pilot-qa.md`, `deck/test/scratch-seed.test.mjs` (new) | S7 | [S8](slices/S8.md) |
| S9 | `docs/architecture.md` maps the repository | 11 | `docs/architecture.md` (new), `README.md` (link) | – | [S9](slices/S9.md) |
| S10 | `deck/README.md` maps the deck, and README says where to start | 12 | `deck/README.md` (new), `README.md` (Layout), `scripts/test/deck-readme.test.mjs` (new) | S9 | [S10](slices/S10.md) |
| S11 | server's waiting half moves out | 13 | `deck/server.mjs`, `deck/server-wait.mjs` (new), `deck/README.md`, `deck/test/facades.test.mjs` (new), `deck/test/create.test.mjs`, `deck/test/daemon.test.mjs` (pin lists) | S3, S10, #445, #451 | [S11](slices/S11.md) |
| S12 | server's tool layer and routes move out | 13 | `deck/server.mjs`, `deck/server-tools.mjs` (new), `deck/server-routes.mjs` (new), `deck/README.md`, `deck/test/facades.test.mjs`, the same two pin lists | S11 | [S12](slices/S12.md) |
| S13 | store's core moves out | 13 | `deck/store.mjs`, `deck/store-core.mjs` (new), `deck/README.md`, `deck/test/facades.test.mjs`, the same two pin lists | S12 | [S13](slices/S13.md) |
| S14 | store's items, replies and tickets move out | 13 | `deck/store.mjs`, `deck/store-items.mjs` (new), `deck/README.md`, `deck/test/facades.test.mjs`, the same two pin lists | S13 | [S14](slices/S14.md) |
| S15 | store's runs and records move out; store.mjs is a facade | 13 | `deck/store.mjs`, `deck/store-runs.mjs` (new), `deck/README.md`, `deck/test/facades.test.mjs`, the same two pin lists | S14 | [S15](slices/S15.md) |
| S16 | render's thread parts and cards move out | 13 | `deck/ui/render.mjs`, `deck/ui/render-parts.mjs` (new), `deck/ui/render-cards.mjs` (new), `deck/README.md`, `deck/test/facades.test.mjs` | S15 | [S16](slices/S16.md) |
| S17 | render's status, strip, tickets and rail move out | 13 | `deck/ui/render.mjs`, `deck/ui/render-strip.mjs` (new), `deck/ui/render-rail.mjs` (new), `deck/README.md`, `deck/test/facades.test.mjs` | S16 | [S17](slices/S17.md) |
| S18 | render's days and pages move out; render.mjs is a facade | 13 | `deck/ui/render.mjs`, `deck/ui/render-pages.mjs` (new), `deck/README.md`, `deck/test/facades.test.mjs`, `deck/test/days.test.mjs` (source pin) | S17 | [S18](slices/S18.md) |
| S19 | run.mjs's claim moves out | 13 | `deck/run.mjs`, `deck/run-claim.mjs` (new), `deck/README.md`, `deck/test/facades.test.mjs` | S18 (#445 on pilot) | [S19](slices/S19.md) |
| S20 | items.mjs's bounds move out | 13 | `deck/items.mjs`, `deck/items-bounds.mjs` (new), `deck/README.md`, `deck/test/facades.test.mjs` | S19 (#445 on pilot) | [S20](slices/S20.md) |

Four lanes are independent: S1-S3, S4-S5, S6-S8 and S9-S10 (S5 follows S4 because both edit `package.json`).
F7 (S11-S20) is one serial chain after them, because every F7 slice edits `deck/README.md` and the server, store and
render moves each re-point the same source pins. 20 slices sit exactly at the one-run bound, with no headroom (L14); a slice added mid-run may take it to 22.

## 9. Acceptance evidence

On a scratch deck started by S6's own command, seeded by S8, in QA's worktree:

1. `pilot deck --scratch --seed-run docs/design/audit-f1-f7/run.json` prints the URL, pid and store dir. The shell closes, and `curl <url>/api/health` answers 200. `~/.claude/pilot`'s mtime is unchanged (spec 8).
2. `curl <url>/api/runs` lists the seeded run, and `/api/record?repo=<worktree>` returns the record (spec 10).
3. `curl -w '%{content_type}' <url>/api/items?brief=1&open=1` prints `application/json` and fewer than 3 KB; `?id=<one>` returns that item only (spec 4).
4. `deck_read {id}` and `{brief:true, open:true}` are called against the scratch deck through the stdio client, and `wc -c` is under 5 KB and under 3 KB (spec 1, 2). The prompt pins are green (spec 3).
5. `pilot deck --stop <live 4321 pid>` is refused. `pilot deck --stop <scratch pid>` gives connection refused, and the dir is gone (spec 9).
6. `npm run test:quiet | wc -c` is under 10 KB, with the same pass count as `npm test`. A planted failure shows its name (spec 5).
7. The run-hang copy exits non-zero in under 90 s, naming its test (spec 6, 7).
8. The greps for spec 11 and 12, and `wc -l` of every non-test deck source file showing none over 800 (spec 13).
9. The full gate: `npm test`, with the same count as at S1's base plus the new tests.

## 10. Status

| Slice | State | Branch | PR | Worktree | Blocker | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | | | | #451 | 1, 3 |
| S2 | planned | | | | S1 | 2, 3 |
| S3 | planned | | | | S2 | 4 |
| S4 | planned | | | | – | 5 |
| S5 | planned | | | | S4 | 6, 7 |
| S6 | planned | | | | #445 | 8 |
| S7 | planned | | | | S6 | 9 |
| S8 | planned | | | | S7 | 10 |
| S9 | planned | | | | – | 11 |
| S10 | planned | | | | S9 | 12 |
| S11 | planned | | | | S3, S10, #445, #451 | 13 |
| S12 | planned | | | | S11 | 13 |
| S13 | planned | | | | S12 | 13 |
| S14 | planned | | | | S13 | 13 |
| S15 | planned | | | | S14 | 13 |
| S16 | planned | | | | S15 | 13 |
| S17 | planned | | | | S16 | 13 |
| S18 | planned | | | | S17 | 13 |
| S19 | planned | | | | S18 | 13 |
| S20 | planned | | | | S19 | 13 |
| audit-f1-f7 | planned | feat/audit-f1-f7 | | | S20 | 1-13 |
