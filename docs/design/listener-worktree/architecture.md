# listener-worktree

Deck ticket itm_79cbc557a1de. Design branch `design/listener-worktree`, cut from origin/pilot 389c6f3d. Slug `listener-worktree`.

## 1. Problem

"hey why wasnt my response getting picked up from the deck?" On 2026-10-05 the pilot started `pilot wait` from the `pilot-feat-pilot-branch` worktree. The user's Sign off on itm_2812f52a7a1b, filed under `C:\Users\Hazzard\Projects\pilot`, woke no listener; it reached the pilot 2 min 8 s later through a tool-call hook. The wait sent its cwd as its repository, the daemon joins repositories by exact path, so it listened where nobody posts, and nothing said so.

## 2. Spec

| # | Behaviour | Evidence | State |
|---|---|---|---|
| 1 | A `pilot wait` started in a linked worktree of a repository exits on a reply to an item filed under that repository's main checkout. | `deck/test/wait.test.mjs:154`: cwd a real `git worktree`, reply on the main checkout, the wait exits with it and line 1 is `listening on <main checkout>`. | **On pilot** since #318 (user-thread-listener spec 5, ADR 0091), landed 2026-10-07, two days after the miss. S1 keeps it green. |
| 2 | The inbox alert and the Stop gate hand a pilot whose shell sits in a worktree the replies on its repository's threads. | `hooks/test/listener-join.test.js:54` (Stop holds) and `:121` (PostToolUse delivers), `cwd` a worktree and `CLAUDE_PROJECT_DIR` the repository. | **On pilot** since #318 (user-thread-listener spec 6, ADR 0092). Unchanged here. |
| 3 | A wait whose listening repository has no run and no open thread on this deck says so, naming the directory, instead of waiting in silence. | A test: a wait on a directory no run and no item names prints `listening on <dir>` then `NO DECK for <dir>: …`; a wait on a known repository prints no such line. *assumed A1, A2* | S2 |
| 4 | A wait run inside a `pilot run` session listens on that session's own repository (`PILOT_RUN_REPO`) wherever its shell has drifted, so a session launched in a worktree hears the threads it posted there, and the wait keys on the same directory the hooks do. Outside `pilot run`, line 1's git join stands. | A test: `PILOT_RUN_REPO` a linked worktree, cwd elsewhere; a reply on an item stamped with that worktree wakes the wait and line 1 names the worktree. With it unset, line 1's test passes unchanged. *assumed A3* | S1 |

Replaced from the draft: line 4, "a sub-deck's worktree still resolves to its own main deck", cannot mean here. The sub-deck is gone (ADR 0088, yellow-agent L10; `deck/store.mjs:231`). What survives of it is a deck filed under a worktree (`pilot run` started there; a ticket's `dir`, run-chaining S6), and #318's git join broke that case the other way round: such a session stamps its posts with the worktree (`deck/client.mjs:186`) while its `pilot wait` listens on the main checkout. New line 4 covers it.

So lines 1 and 2 are already true on pilot; this run's new behaviour is lines 3 and 4.

## 3. Findings

| Area | What is there | Anchor |
|---|---|---|
| Wait's repository | `listeningRepo(cwd)`: parent of `git rev-parse --path-format=absolute --git-common-dir`, else cwd. Asked once per wait. Line 1 `listening on <repo>` before anything can fail. | `deck/wait.mjs:107-116`, `:128`, `:137`; ADR 0091 |
| Daemon join | `forRun`: a reply with no repo belongs to any waiter, else `sameRepo` (case-folded `path.resolve`). | `deck/server.mjs:704-711`, `deck/items.mjs:672`, `:764` |
| Item stamp | The stdio client registers `process.cwd()` (the launch directory) and stamps every `deck_post` with it. | `deck/client.mjs:186`, `:218` |
| Session env | `pilot run` starts Claude with `PILOT_RUN_REPO` = its cwd, inherited by every Bash call and every crew agent's. | `deck/run.mjs:701`; read at `hooks/lib/deck.js:589` |
| Hook join | `projectDir(input, env)` = `CLAUDE_PROJECT_DIR`, else cwd. | `hooks/lib/deck.js:225`; ADR 0092 |
| Is a repo known | `GET /api/runs` lists runs (`?live=1` for the hooks' `isOnDeck`); `deck_read {repo}` lists a repository's items. | `deck/server.mjs:1500-1508`, `hooks/lib/deck.js:342` |
| Create | Refuses a repository with no run ("start a pilot there once first"), so an unknown directory can only hear a session that registers later. | `deck/store.mjs:1616-1623` |
| Worktree decks | Tabs are per directory; a ticket's `dir` files it under a worktree's deck; `repoOf` reads a worktree's `.git` file. | `deck/server.mjs:803`, `deck/runs.mjs:104` |
| Pilot prose | The listener rule quotes `NO REPLY after 110 minutes`; nothing quotes `listening on`. | `agents/pilot.md:63-75` |
| Test hazard | The suite calls `wait()` directly; a suite run inside a `pilot run` session inherits `PILOT_RUN_REPO`. | `deck/test/wait.test.mjs` |

#318 re-read against its slices: draft 1 = its spec 5; draft 2 = its spec 6; draft 3 is half there (line 1 names the repository; nothing says it is unknown); draft 4's surviving case was not in it.

## 4. Ubiquitous language

- **Listening repository**: the one path `pilot wait` sends as `repo`, chosen once at start, never per poll.
- **Session repository**: the directory a `pilot run` session registered (`PILOT_RUN_REPO`); every thread it posts is stamped with it.
- **Main checkout**: the directory whose `.git` is the repository's common git dir.
- **Unknown directory**: a listening repository with no run and no open thread on this deck.

## 5. Locked decisions

| # | Decision | Rationale | Rejected |
|---|---|---|---|
| L1 | The wait does the join, client side, once at start; the daemon's `sameRepo` is unchanged. | Keeps ADR 0091 (no per-poll cost) and keeps a worktree's own deck (its tab, a ticket's `dir`) a separate deck. | Widening `sameRepo`/`forRun` to fold a worktree into its main checkout: merges every worktree deck into the main one, and a main-checkout wait would take, and mark delivered, replies meant for a worktree session. |
| L2 | Listening repository = `PILOT_RUN_REPO` when set and non-empty, else `listeningRepo(cwd)`. | It is exactly the stamp on the session's own posts and the directory the hooks key on, costs no spawn, and survives the shell drifting into another session's worktree. | Asking `/api/runs` which candidate is live: a network read for what the env already holds. Listening on two repositories: `deck_wait` takes one. |
| L3 | `wait()` takes `env` as a parameter (default `process.env`); the suite passes its own. | The test hazard in §3. | Reading `process.env` inside: a suite run under `pilot run` would listen on the real repository. |
| L4 | Line 1 stays `listening on <repo>`, printed before anything can fail; the unknown line is line 2. | ADR 0091's guarantee; agents and the user already read line 1. | Folding the warning into line 1, which would need the deck to answer before anything prints. |
| L5 | The unknown check is one `GET /api/runs` and one `deck_read {repo}` at start; a deck that does not answer them gets the existing unreachable line and exit 1. | Two reads per wait, none per poll; one failure path. | A new field on `deck_wait`'s answer: the hot path changes for a once-per-wait question. |
| L6 | QA runs against a scratch deck on a free port, started from QA's own worktree with its own `deck.json`, with a linked worktree for the `PILOT_RUN_REPO` case and a fresh `git init` directory nobody registered for the `NO DECK` case. The live deck on 127.0.0.1:4321 is never touched. (User, itm_b3c515944d54.) | A test wait on the live deck would take, and mark delivered, replies meant for the sessions live now. | The live deck. |
| L8 | Grilling depth: forks (user, itm_3900e41d6c6d). Only decisions whose paths change what ships reach the user; Gate 1 is the one item. | Path resolution inside the deck's join; no schema, auth, money, public API or irreversible data. | every. |
| L7 | On an unknown directory the wait prints the `NO DECK` line and keeps waiting. (User, itm_89084f10f7ae; was A1.) | A session that registers a moment later is still heard; an agent that does not read line 2 waits on nothing until the 110-minute exit. | Exit 1 at once: wakes the caller but kills a wait started just before its own session registered, and makes unknown a failure rather than a notice. |

## 6. Assumed decisions

| # | Question | Default taken | Tradeoff |
|---|---|---|---|
| A2 | The line's wording. | `NO DECK for <dir>: no run and no open thread is filed here, so nothing reaches this wait until a session registers it`. Uppercase token, like `REPLY` and `NO REPLY`. | Grep-able beside the exit lines; not added to `agents/pilot.md`, which sits under its prompt pin. |
| A3 | Does `PILOT_RUN_REPO` win even when the shell is in a worktree whose own deck is live? | Yes: the session's repository always wins. | A pilot that `cd`s into another session's worktree will not hear that deck, which is right: its replies are that session's. A crew agent spawned by the session inherits the same repository. |

## 7. Out of scope

- Merging itm_2f6e4ffe0495 or itm_5feb313ba8de into this ticket: the user chose Merge none (itm_f515e449a32c).

- The hooks: spec 2 is on pilot, ADR 0092 stands.
- The daemon's `sameRepo`, `repoKey` and every per-directory reader (tabs, ticket queues).
- `listeningRepo`'s subdirectory and bare-repository rules (pinned at `wait.test.mjs:176-189`).
- The 2-minute hook latency: it is the fallback path working as designed.

## 8. Slices

| Slice | Title | Spec | Files owned | After | File |
|---|---|---|---|---|---|
| S1 | A wait in a `pilot run` session listens on the session's repository | 4 (keeps 1 green) | `deck/wait.mjs`, `deck/test/wait.test.mjs`, `docs/adr/0104-a-wait-listens-on-its-sessions-repository.md` (new), `docs/adr/README.md` (regenerated) | – | [S1](slices/S1.md) |
| S2 | A wait on an unknown directory says so | 3 | `deck/wait.mjs`, `deck/test/wait.test.mjs` | S1 | [S2](slices/S2.md) |

Spec 1 and 2 are delivered on pilot by #318; no slice re-delivers them, and S1's gate re-runs their pins. S1 is the walking skeleton: the env read, the parameter seam and one real-worktree test through a real daemon. S2 shares S1's files, so it runs after it. Estimate: about 40 minutes, two slices under 80 lines net each.

## 9. Acceptance evidence

1. On a scratch deck, `pilot run` in a linked worktree; a question posted from that session; `pilot wait` from that session prints `listening on <worktree>` and exits `REPLY …` when the question is answered (spec 4).
2. With `PILOT_RUN_REPO` unset and the shell in a worktree of the main checkout: `listening on <main checkout>`, and a reply on the main checkout wakes it (spec 1).
3. `pilot wait` from a fresh `git init` directory nobody registered: line 2 is `NO DECK for <dir>: …` (spec 3).
4. `npm test` green, `hooks/test/listener-join.test.js` unchanged (spec 2).

## 10. Status

| Slice | State | Branch | PR | Worktree | Blocker | Spec |
|---|---|---|---|---|---|---|
| S1 | planned | | | | – | 4 |
| S2 | planned | | | | S1 | 3 |
| listener-worktree | planned | | | | S2 | 1–4 |
