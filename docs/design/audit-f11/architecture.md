# audit-f11: fixture git stops printing CRLF warnings

Ticket itm_9e6eb292dcf7 · audit 2026-11-17T00-56-45-000Z F11 · base `origin/pilot` 655a49d8 · merge: none (itm_a3043e599942)

## 1. Problem

Fixture git noise fills gate logs an agent greps or reads on a red: 116 and 156 `LF will be replaced by CRLF`
lines in two full runs on this Windows machine.

## 2. Spec

| # | Behaviour | Evidence | Bar |
| --- | --- | --- | --- |
| 1 | A full `npm test` on this Windows machine prints no `LF will be replaced` line. | `grep -c 'LF will be replaced'` on the gate's output (§9). | 0 (was 116, 156). |
| 2 | Fixture git ignores the machine's `core.autocrlf`: in a fixture repo `git config core.autocrlf` reads `false`, and `git add` of an LF file prints nothing on stderr. practitioner: hermetic-test practice (Bazel), no host config leaks into a fixture. | A `git-fixture.test.mjs` pin, red before on this machine (system gitconfig sets `true`) and on Linux (unset). | 1 pin, red before, green after. |
| 3 | Every test file that printed the warning is silent when run alone. | The per-file probe of §3 rerun. | 0 of the 32 files that printed 310 lines on 200a74b8. |
| 4 | Nothing outside the suite's temp dirs is written: the real `~/.gitconfig` and the checkout's `.git/config` are unchanged by a run. | Their hashes before and after the §9 run. | 2 of 2 hashes equal. |
| 5 | The gate is otherwise unchanged: suite green, no added spawn. | The gate's `spawns` line and exit code. | Exit 0; spawn total within the ceiling and no `git config` spawn added. |

All 5 lines agreed by the user on itm_0d83fa6154c6 ("All 4", read there as these 5).

## 3. Findings

- `scripts/test/lib/git-fixture.mjs:32-44` writes a global gitconfig into `fake-home.mjs`'s `FAKE_HOME` and points
  `GIT_CONFIG_GLOBAL` at it (identity, gpgsign, `checkStat`, maintenance, gc). 69 files import it, directly or through
  `scripts/test/lib/land-repos.mjs`. Every git a test or its child spawns inherits the env.
- Where `true` comes from: `C:/Program Files/Git/etc/gitconfig` and `C:/Users/Hazzard/.gitconfig` both set
  `core.autocrlf=true`. The fake global hides the user file but not the system one, and global outranks system, so
  `autocrlf = false` in the fake global wins.
- Per-file probe on 200a74b8 (`node --test <file>` over 513 test files, counting the line): 32 files, 310 lines.
  31 import `git-fixture.mjs`; one, `scripts/test/audit-context.test.mjs`, imports only `fake-home.mjs` and runs
  `git init` / `git add -A` at :45-47. Top: `release` 39, `land-generated` 35, `adr-allocate` 26.
- Ten repo-making tests import neither helper (`ledgers`, `rules-ledger`, `landing-recreate`, `stale-checkout`,
  `procs`, `posters`, `audit-spend*`, `measure-plain`, `line-endings`); none prints the warning today.
  `line-endings.test.mjs:14` already passes `-c core.autocrlf=false`.
- `.gitattributes` is `* text=auto eol=lf`; fixtures are fresh repos without it.
- CI (`.github/workflows/gate.yml`) runs Linux, where `autocrlf` is unset: the suite already passes with no conversion,
  so `false` changes no test outcome.

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `scripts/test/lib/git-fixture.mjs` | import side effect: `GIT_CONFIG_GLOBAL` → the fixture config; `gitFixture(t, key, build)` | `core.autocrlf = false` joins the config it already owns | in-process |

Deletion test: removing the helper puts identity and the config back into 69 files' builders, so it earns its place.
`audit-context.test.mjs` joins it by importing it rather than by a second config writer. No fold slice.

## 4. Ubiquitous language

- **fixture config**: the gitconfig file `git-fixture.mjs` writes in `FAKE_HOME` and exports as `GIT_CONFIG_GLOBAL`.
- **CRLF warning**: a stderr line containing `LF will be replaced by CRLF`.
- **fixture repo**: a git repository a test creates under the OS temp dir.

## 5. Locked decisions

- **L1** The setting lives in the fixture config, one `[core]` key beside `checkStat`. Every git in a test process
  and its children inherits it, with no spawn. Rejected: `git config core.autocrlf false` per repo (a spawn per build,
  and builders that skip the helper miss it); `GIT_CONFIG_COUNT` in `gate.mjs`'s `gateEnv` (misses `node --test <file>`,
  the way implementers iterate).
- **L2** Only `core.autocrlf = false`. With no conversion there is no warning to silence. Rejected: also
  `core.safecrlf = false`, as the audit's fix words it: it only governs conversion, so it adds a key with no effect.
- **L3** `audit-context.test.mjs` imports `git-fixture.mjs` in place of `fake-home.mjs` (which it imports through it).
  Rejected: `fake-home.mjs` writing its own `.gitconfig`, a second writer of the same file.
- **L4** Grilling depth: no grilling (user, itm_4ce86bd96635). No design question is posted; the stashes stand assumed.
- ADR 0192, `docs/adr/0192-audit-f11.md`, records L1-L2; the landing numbers it.

## 6. Assumed decisions

- **A1** *assumed*: the spec lines of §2 as proposed to `main`. Default: as written. Trade: spec 4 and 5 add QA checks
  the ticket did not name.
  Verdict: stands — the user agreed every proposed spec line on itm_0d83fa6154c6
- **A2** *assumed*: no guard against a future test that makes a repo without the helper. Default: none; the warning
  is noise, not a fault. Rejected: a gate check grepping the suite's stderr, which would make noise a red.
  Verdict: stands — no queued ticket adds a fixture-repo guard; the spec's grep count catches a regression
- **A3** *assumed*: QA environment. Default: a CLI run of the gate in a scratch clone on this Windows machine (§9);
  a 1-slice plan takes the short path.
  Verdict: stands — a CLI gate run in a scratch clone on this machine; no database, and the user's git config is checked byte-identical by spec 4
- red team: switching fixtures from CRLF to LF checkouts could break a test that reads a checked-out file. Attacked:
  CI on Linux already runs every test with no conversion and is green, and `line-endings.test.mjs` forces `false`
  already. Not broken.
- red team: a test that sets its own `GIT_CONFIG_GLOBAL` or `HOME` for a child loses the key. Attacked:
  `measure-plain.test.mjs:121` sets `HOME` for a Claude child, which runs no fixture git; `test-command.test.mjs:168`
  adds `GIT_CONFIG_COUNT`, which layers over the global file. Neither printed a warning in the probe.
- red team: the pin of spec 2 passes on a machine with `autocrlf` unset if it only asserts silence. It also asserts
  the key reads `false`, which is red on Linux before the change.

## 7. Out of scope

Silencing other git stderr (`hint:`, `Switched to branch`); changing the ten tests that build repos without the
helper; `.gitattributes` in fixtures; a gate-level check on suite stderr (A2).

## 8. Slices

Width 1; longest stem 1

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | Fixture git prints no CRLF warning | 1-5 | `scripts/test/lib/git-fixture.mjs`, `scripts/test/git-fixture.test.mjs`, `scripts/test/audit-context.test.mjs`, `docs/adr/0192-audit-f11.md` (new) | – | `pilot:typescript-reviewer` | [S1](slices/S1.md) |

S1 is the walking skeleton and the whole feature: one config key, one import, one pin, about 30 lines.

## 9. Acceptance evidence

In a scratch clone of `feat/audit-f11` after `npm ci`, on this Windows machine:

1. Hash `~/.gitconfig` and the clone's `.git/config`.
2. `npm test 2>&1 | tee gate.log`: exit 0, the `spawns` line within the ceiling.
3. `grep -c 'LF will be replaced' gate.log` prints 0.
4. The hashes of step 1 are unchanged.

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | `slice/audit-f11-s1` | – | – | – | 1-5 |
| audit-f11 | planned | `feat/audit-f11` | – | – | S1 | 1-5 |
