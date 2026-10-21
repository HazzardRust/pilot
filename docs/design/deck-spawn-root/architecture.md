# deck-spawn-root: a deck is only ever spawned from the installed plugin

Ticket `itm_2c871094c3ac` · base `origin/pilot` 9e77cbf3 · ADR 0165 (0164 is deck-token's) · depth: forks (itm_48e6f55c85ec)

## 1. Problem

The deck on 127.0.0.1:4321 went to HTTP 500 on 2026-10-19. A QA agent's client in the worktree `pilot-qa-lander`
was at plugin 0.9.4. It found the running deck older, replaced it, and spawned `deck/daemon.mjs` from its own
worktree. When that worktree was pruned, the page lost `deck/ui/strips.html`. The first landing of #849 died too,
because the daemon runs `pilot land` from its own `bin/pilot.mjs` and that worktree had no `node_modules`. The user:
"why would i ever want a deck running out of a QA's worktree? why did it even spawn there in the first place?"
They never want it.

## 2. Spec

| # | Behaviour | Evidence |
| --- | --- | --- |
| 1 | A session or `pilot deck` finds no deck on 4321, or an older one. It starts the daemon from the installed plugin root, never from the checkout it runs from. practitioner: a service manager, whose unit's ExecStart names an installed absolute path and never a working copy. | A client test from a temp checkout (it has `.git`) with an injected lookup: the spawn argv is `<installed>/deck/daemon.mjs`. |
| 2 | "Older" is measured against the version of the root it would spawn, not the caller's package.json. A 0.9.4 branch client that finds a 0.9.2 installed deck keeps it with 0 exit requests, so decks don't churn. | A replace test (own 0.9.4, installed 0.9.2, found 0.9.2): `kept`, no exit POST. With installed 0.9.5 the POST carries `0.9.5`. |
| 3 | When the installed root cannot be found, a checkout client starts no deck. It prints one stderr line naming why and `pilot deck --from <dir>`, and never falls back to its checkout. | A test with the lookup throwing: no spawn, and that line. |
| 4 | A client in an installed copy (no `.git` in its root, the `${CLAUDE_PLUGIN_ROOT}` case) spawns its own root with 0 calls to `claude plugin list`. A checkout client calls it at most once per start, and only when no deck answers or the deck is older than the client. | A test whose lookup throws if called. |
| 5 | A deck on a port other than 4321 (`PILOT_DECK_PORT`: `deckOnAPort`, `daemon-replace.test.mjs`) still spawns from its own checkout. | The existing suite stays green and its tests are unchanged. |
| 6 | `pilot deck --from <dir>` is the one opt-in. It refuses a dir with no `deck/daemon.mjs` or no resolvable `@modelcontextprotocol/sdk`, naming which. | A CLI test: exit 1 and the reason. A good dir starts there. |
| 7 | The landing child runs `<daemon root>/bin/pilot.mjs`, so the installed deck lands from the installed root. This already holds (`deck/landing.mjs:26`). | 1 pin: a daemon module loaded from root R spawns `R/bin/pilot.mjs land`. |
| 8 | `/api/health` reports `root` and `checkout` (whether the root holds `.git`). `pilot status` prints `root <dir>`, and every page shows a banner naming the dir while the deck serves from a checkout. practitioner: an SRE, who reads the binary's path first, the way `systemctl status` prints a unit's ExecStart. | Health and status pins; the banner seen in a browser on a `--from` scratch deck, and absent on an installed one. |
| 9 | `pilot doctor` fails its deck row when the deck on 4321 serves from a checkout, and prints the one-time restart (§9 step 0). | A doctor pin over a probe answering `checkout: true`. |
| 10 | `pilot worktrees prune` and the landing's clear refuse a tree a running daemon was started from, naming its pid. This already holds (ADR 0163). | 1 pin: a fake table with a leashless `node <tree>/deck/daemon.mjs` row keeps the tree as `live <pid>`. |

Cannot mean here: `pilot deck --foreground` serves the code it was typed from (a hand-typed debug path, which spec 8
makes visible). `pilot deck --scratch` keeps spawning its own checkout on its own port, because QA has to run the
feature's code.

## 3. Findings

- `deck/client.mjs:45` `DAEMON = fileURLToPath(new URL('./daemon.mjs', import.meta.url))` and `:212`
  `spawn(process.execPath, [DAEMON], …)`: every client spawns the checkout its module lives in. Both callers inherit
  this: `ensureOnTheDeck` (`client.mjs:409`, a session) and `pilot deck` (`bin/pilot.mjs:216`).
- `client.mjs:210` replaces a deck when `isOlder(found.version, PLUGIN_VERSION)`, where PLUGIN_VERSION is the
  caller's own package.json (`deck/version.mjs`). `postExit` (`:150-155`) sends that version, and
  `deck/exit-route.mjs:20` refuses an older caller. ADR 0156 records this rule; ADR 0165 amends it to the root's version.
- `bin/launcher.mjs` `pluginRoot(env)` answers `PILOT_PLUGIN_ROOT` or `claude plugin list --json`'s `installPath`
  (shell spawn, up to 30 s). Installed copies such as `~/.claude/plugins/cache/pilot/pilot/0.9.2` have no `.git` and
  do have `node_modules`. Checkouts and worktrees have `.git`, a directory or a file.
- `deck/landing.mjs:26` `PILOT_BIN` is relative to the daemon's own module, and `:295`, `:371` spawn it.
  `deck/test/land-again.test.mjs:97` already pins the argv against the test's own checkout.
- `deck/procs.mjs:177-195`: a leashless daemon row gets `owner = ppid` and `worktree = dirname(dirname(file))`.
  `holderOf` (`:225-238`) answers its pid, and `scripts/worktrees.mjs:155` keeps the tree as `live <pid>`. That covers
  both `pilot worktrees prune` (`holderFrom(processTable)`) and land's clear (`scripts/land.mjs:464-466`).
  `origin/feat/lander`'s `land.mjs:161` predates this; it resolves when lander syncs pilot.
- `deck/health.mjs` answers `{ ok, pid, url, seq, rss, version, startedAt }`. `deck/probe.mjs:29-34` keeps `pid`,
  `version` and `startedAt`. `deck/status-command.mjs:49` `statusLines` and `deck/doctor.mjs` `deckRows` read the probe.
  No page shows the version today; all three pages load `deck/ui/js/deck.mjs`.
- Live: 4321 answers `version 0.9.4, startedAt 2026-10-18`. `installed_plugins.json` says pilot@pilot is 0.9.2.

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `deck/spawn-root.mjs` (new) | `spawnRoot({ ownRoot, port, from?, env?, lookup? }) -> { root, version }`, throws `Error` naming why | the checkout test (`.git`), the port rule, the installed lookup, `--from` validation, reading the root's version | 4 true external (`claude`) behind `lookup`; fs local-substitutable (temp dirs) |
| `deck/client.mjs` `ensureDaemon` | `ensureDaemon({ from?, resolve? }) -> Promise<boolean>`; `replaceOlder(found, { version, … })` | the spawn's root and the version compared and sent | 1 in-process |
| `deck/health.mjs` `healthOf` | adds `root: string, checkout: boolean` | the daemon's own package dir and its `.git` | 2 local-substitutable |
| `deck/probe.mjs` `probeDeck` | adds `root?`, `checkout?` | health's new fields, text-checked | 3 remote but owned (HTTP to own daemon) |
| `deck/doctor.mjs` `deckRows` | `deckRows({ found, port }) -> Row[]`, now reading `found.checkout` | the checkout verdict and the restart wording | 1 in-process |
| `deck/landing.mjs` `PILOT_BIN` | unchanged; pinned | — | 1 in-process |
| `deck/procs.mjs` `holderOf` / `scripts/worktrees.mjs` `prune` | unchanged; pinned | — | 2 local-substitutable (fake table) |

Deletion test: `spawn-root.mjs` earns its keep. Deleting it puts the root rule back in two callers (`ensureDaemon`
and `pilot deck --from`) and in their tests. `pluginRoot` stays in `bin/launcher.mjs` and is imported, not copied.
No fold changes existing code, so there are no fold slices.

## 4. Ubiquitous language

- **Installed root**: the `installPath` `pluginRoot()` answers. Never a checkout.
- **Checkout**: a directory whose root holds `.git` (a clone or a worktree).
- **Spawn root**: the directory whose `deck/daemon.mjs` a spawn runs; `spawnRoot` answers it.
- **Root version**: the `version` in the spawn root's package.json. Replacement compares against it, and the exit request carries it.
- **Opt-in deck**: a deck started by `pilot deck --from <dir>`, the only way 4321 serves a checkout.

## 5. Locked decisions

- **L1 Depth is forks** (user, itm_48e6f55c85ec): only materially forking questions go to the user.
- **L2 The root rule lives in one module**, `deck/spawn-root.mjs`, with `claude` behind an injected `lookup`.
  Rejected: inline in `ensureDaemon`, which would duplicate it for `--from`.
- **L3 Fail closed** (spec 3): if the lookup fails, no deck is started. Rejected: falling back to the checkout, which is the incident.
- **L4 Port rule** (spec 5): only 4321 is held to the installed root. Rejected: tests set `PILOT_PLUGIN_ROOT`, which
  edits every daemon test and leaves the env var to leak into sessions.
- **L5 `--from` checks dependencies at the spawn side** (spec 6), not in the daemon. A daemon that refused to start
  would only time out the caller. Rejected: a daemon-side check.
- **L6 The landing and prune keep their code** (specs 7, 10): spec 1 makes both hold for 4321. Pins only.
- **L7 The banner shows only for a checkout** (spec 8); an installed deck shows nothing new. Rejected: an always-on
  footer with the root, which is noise on every page of the normal case.
- **L8 4321 runs the installed plugin** (user, itm_dc1637502408): installed only; `claude plugin update` to see branch
  daemons. Rejected: a dev-mode deck following this checkout's branch (A1).
- **L9 QA environment** (user, itm_c0d8a42d77ff): this machine. QA starts a `pilot deck --from` scratch deck on its own
  port for the banner, doctor and refusal checks; the installed deck on 4321 is read only (`pilot status`, health) and
  QA never restarts it; the restart is the one human step (§9 step 0). Rejected: QA restarting 4321 on the user's go.

## 6. Assumed decisions

- **A1 4321 runs the installed plugin** (itm_dc1637502408, answered 2026-10-19: "Installed only, update to see branch
  daemons"). Default: installed only, update to see branch
  daemons. Trade: a deck change on pilot or feat/* reaches 4321 only after `claude plugin update` or `pilot deck --from`.
  Rejected: a dev-mode deck that follows this checkout's branch, which is today's behaviour and today's breakage.
  Verdict: stands — the user took the default, so it is locked as L8 below.
- **A2 Today's checkout deck is not replaced automatically.** Default: doctor and status name it, and the user restarts
  it once (§9 step 0). Trade: the stray deck lives until it is restarted. Rejected: the exit route accepting an installed
  caller when the deck is a checkout, which edits lander's `exit-route.mjs` and lets any session stop an opt-in deck.
  Verdict: stands — the pilot withdrew the question as not forking (itm_dc2060df8cec).
- red team: A1's default leaves the user's deck on the installed 0.9.2 once today's 0.9.4 checkout deck is restarted
  (§9 step 0), until `claude plugin update`. Lander's exit route (0.9.3+) is then absent from 4321, so an installed
  0.9.2 client meeting a newer installed deck after an update falls back to kill-by-pid (`client.mjs:186-189`).
  That path is already pinned, so nothing changes. Verdict: stands.
- **A3 Checkout detection by `.git`** in the client's own root, not a `claude plugin list` call on every spawn. Trade:
  a non-git copy outside the plugin cache counts as installed. Rejected: always asking `pluginRoot()`, 1-30 s per spawn.
  Verdict: stands — the pilot ruled it no fork.

## 7. Out of scope

- Changing `exit-route.mjs`, `replaceOlder`'s kill-by-pid proof (L4 of daemon-lifecycle) or the leash.
- `pilot deck --scratch` and `--foreground`, which keep serving their own checkout.
- Auto-updating the installed plugin, and any `pilot deck --restart` command.
- Lander's `land.mjs:161` holder gap, which closes when lander syncs pilot.

## 8. Slices

Width 2; longest stem 3

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | A checkout client spawns the installed deck | 1, 2, 3, 4, 5 | `deck/spawn-root.mjs` (new), `deck/client.mjs`, `deck/test/spawn-root.test.mjs` (new), `docs/adr/0165-a-deck-spawns-from-the-installed-plugin.md` (new), `docs/adr/README.md` | – | typescript, security | [S1](slices/S1.md) |
| S2 | `pilot deck --from <dir>` is the one opt-in | 6 | `bin/pilot.mjs`, `deck/spawn-root.mjs`, `deck/test/deck-from.test.mjs` (new) | S1 (`spawnRoot`, `ensureDaemon`) | typescript, security | [S2](slices/S2.md) |
| S3 | The deck names its root, and a checkout deck says so on the page | 8 | `deck/health.mjs`, `deck/probe.mjs`, `deck/status-command.mjs`, `deck/ui/js/deck.mjs`, `deck/ui/deck.css`, `deck/test/health-root.test.mjs` (new) | S1 (`spawn-root.mjs`'s `isCheckout`) | typescript | [S3](slices/S3.md) |
| S4 | Doctor fails a checkout deck and prints the restart | 9 | `deck/doctor.mjs`, `deck/test/doctor-deck.test.mjs` | S3 (`probeDeck`'s `root`, `checkout`) | typescript | [S4](slices/S4.md) |
| S5 | Pins: the landing's root and prune's daemon holder | 7, 10 | `deck/test/land-again.test.mjs`, `scripts/test/worktrees-holder.test.mjs` | – | typescript | [S5](slices/S5.md) |

S1 is the walking skeleton: on its own, it makes the incident impossible.

- red team: S1's first red steps, walked against `client.mjs:208-212`, show a second problem. Comparing against the root
  version would call the lookup (a `spawnSync` of up to 30 s, `bin/launcher.mjs`) on every join a checkout client
  makes to a running deck, and that stalls the MCP server. Change: S1 resolves the root only when no deck answers or
  `isOlder(found.version, PLUGIN_VERSION)`, which is spec 4's "at most once" and test 7 in `slices/S1.md`.
- red team: S1 and S3 would each half-build the checkout test, the `.git` check in `spawnRoot` and in `healthOf`.
  Change: S1 exports `isCheckout(root)` and S3 comes after S1 for it. That costs a width of 1 (3 to 2) and
  lengthens the stem from 2 to 3.

## 9. Acceptance evidence

0. One-time step, the only human step this feature leaves. Run `pilot status`. If it prints `root` under a checkout,
   or no `root` line at all (a deck from before this feature), wait until no landing is running, then run
   `taskkill /PID <pid> /F` with the pid from `pilot status` (`kill <pid>` off Windows), then `pilot deck`.
1. `pilot status` prints `root C:\Users\Hazzard\.claude\plugins\cache\pilot\pilot\<version>`, and no banner shows on the page.
2. From a worktree, `node bin/pilot.mjs deck` with no deck running brings 4321 up, and `pilot status` names the installed root.
3. `pilot deck --from <a checkout without node_modules>` refuses and names `@modelcontextprotocol/sdk`.
4. A `--from` scratch deck in a browser shows the banner naming its dir.
5. `pilot doctor` passes its deck row on the installed deck and fails it on a checkout deck, naming the restart.
6. A Sign off press lands from the installed deck. Prune output names `live <pid>` for a tree a `--from` deck serves.

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | `slice/deck-spawn-root-s1` | – | – | – | 1, 2, 3, 4, 5 |
| S2 | planned | `slice/deck-spawn-root-s2` | – | – | S1 | 6 |
| S3 | planned | `slice/deck-spawn-root-s3` | – | – | S1 | 8 |
| S4 | planned | `slice/deck-spawn-root-s4` | – | – | S3 | 9 |
| S5 | planned | `slice/deck-spawn-root-s5` | – | – | – | 7, 10 |
| deck-spawn-root | planned | `feat/deck-spawn-root` | – | – | S1, S2, S3, S4, S5 | 1–10 |
