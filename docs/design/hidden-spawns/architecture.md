# Hidden spawns: the pilot's child processes never flash a console

Ticket `itm_bddbe9c0a3d9` · base `pilot` at `1a04fe31` · branch `design/hidden-spawns` · merge: none (no other green ticket)

## 1. Problem

On Windows the user sometimes sees about five console windows flash open and shut together. It happened once when
they clicked a ticket on the deck, and once at random about two minutes later. The likeliest cause is child processes
that the pilot's CLI and deck start without `windowsHide: true`. The install's own spawns were hidden in `ecebaa7b`;
this ticket covers everything else.

## 2. Spec

| # | Behaviour | Evidence |
| --- | --- | --- |
| 1 | Every child-process call in the non-test sources under `scripts/`, `deck/`, `bin/` and `hooks/` passes `windowsHide: true`. This counts injected callee names (`spawnChild`, `spawnOpener`, a `spawn` parameter) and `exec*`/`fork`, not only `spawn`. The one named exemption is the interactive `claude` started with inherited stdio (L3). | A scan test, red today on the 21 unhidden sites in §3, green after. |
| 2 | Running `pilot land`, `pilot tickets`, `pilot base`, `pilot audit`, `pilot sync` and `pilot integrate` from a Claude Code session on this machine opens no console window. | QA runs each one from an agent on this Windows 11 machine while the user watches, and no window flashes. |
| 3 | *assumed (A1)*: posting a gate1 to the deck opens no console window. | QA posts a gate1 on a scratch deck (`deck/scratch.mjs`) while the user watches, and no window flashes. |
| 4 | *assumed (A2)*: one rule in one place. The install-only scan from `ecebaa7b` is folded into the repo-wide one. | `install-command.test.mjs` no longer holds its own scan, and the repo-wide test covers both install scripts. |

QA environment (recorded): this Windows 11 machine, run from a Claude Code session while the user watches.

## 3. Findings

**How a flash happens.** A console program gets a window of its own when it starts from a process that has no
console and Node did not pass `CREATE_NO_WINDOW`, which is what `windowsHide: true` does. libuv sets it only when no
stdio is inherited. The deck daemon is started `detached: true` (`deck/client.mjs:155`), so it has no console, and any
unhidden child it starts is a visible window. A CLI run under a console, hidden or not, passes that console to its
children, so whether a CLI run flashes depends on how Claude Code started its shell. That is why spec 2 is checked
live, not argued.

**Unhidden today (21 call sites, 10 files):**

| File | Lines | Reached from |
| --- | --- | --- |
| `scripts/pilot-branch.mjs` | 25 `holds`, 113 `pilotLineage`'s `git` | `pilot base`, `land`, `sync`, `integrate`, `worktrees`, `deck/tickets.mjs`, and **the deck daemon** via `deck/lineage.mjs` on every gate1 post |
| `scripts/integrate.mjs` | 36, 39, 51 (`execSync('npm ci')`), 85 (`shell: true`), 98, 228, 254 | `pilot integrate`, `land`, `sync`, `handoff` |
| `scripts/sync.mjs` | 67, 111, 115 | `pilot sync`, `land` |
| `scripts/land.mjs` | 111, 180 | `pilot land`, and the deck's Land button (`deck/landing.mjs:121`, a hidden parent) |
| `deck/tickets.mjs` | 22 `ghIn`, 113 `gitIn` | `pilot tickets` (the daemon imports only `queueView`, which spawns nothing) |
| `scripts/base.mjs` | 17 | `pilot base` |
| `scripts/audit-spend.mjs`, `scripts/audit-context.mjs` | 78; 132 | `pilot audit` |
| `scripts/build-rules-ledger.mjs`, `scripts/check-upstream.mjs` | 36; 175 | maintainer scripts |

**Already hidden:** `deck/client.mjs`, `scratch.mjs`, `open.mjs`, `session.mjs`, `landing.mjs`, `telemetry.mjs`,
`wait.mjs`, `scripts/worktrees.mjs`, `install-command.mjs`, `install-path.mjs`, `bin/launcher.mjs`. Every
`detached` and `shell: true` site in the trees is among these, except `integrate.mjs:85` (`shell: true`). There,
hiding `cmd.exe` hides its children too, because they inherit its hidden console.

**Not child_process:** `deck/run.mjs:590` `pty.spawn` (node-pty); every `.exec(` in the trees is `RegExp#exec`.
`hooks/` imports no `child_process` and nothing that spawns.

**The two bursts.** Clicking a ticket calls `GET` queue → `queueView`, which spawns nothing, so the click itself cannot
be the cause. The likeliest sources are the pilot's own `pilot tickets`/`pilot base` run in reaction to the click
(spec 2) and a gate1 post from the daemon, about five git calls in `pilotLineage` (spec 3). Both are covered.

**The existing pattern (`ecebaa7b`).** `install-command.test.mjs:338` scans named files for `spawn(`/`spawnSync(`,
matches parentheses to find each call's end, and asserts `windowsHide: true` inside it. Recording-spawn tests also
assert `options.windowsHide` (`install-path.test.mjs`, `deck/test/open.test.mjs`, `landing.test.mjs`,
`start-session.test.mjs`).

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| The hidden-spawn rule (`scripts/test/hidden-spawns.test.mjs`) | `childStarts(source)`, `EXEMPT`, the scanned trees | the install-only scan from `ecebaa7b` (deleted from `install-command.test.mjs`) | in-process |
| Each module's git/gh runner (`gitIn`, `ghIn`, `holds`, `git`, `out`) | `(args) => string` per module | nothing (L5) | true external (git, gh) |

Deletion test on the runners: each one is a single line whose options differ (stdio, timeout, `core.fsmonitor`,
maxBuffer). Deleting them spreads those options back to their callers, so they earn their place. A shared hidden
runner would also need eight modules' semantics reconciled, so it goes to `main` as a candidate ticket, not into this
run.

## 4. Ubiquitous language

- **Child start**: one call to a `node:child_process` function, or to a parameter that defaults to one.
- **Hidden**: started with `windowsHide: true`, so Windows gives it no console window of its own.
- **Flash**: a console window that opens and closes for a child start, seen by the user.
- **Scan**: the test reading the non-test sources and checking each child start is hidden.
- **Exemption**: a child start the scan names, with its reason, as deliberately not hidden.

## 5. Locked decisions

- **Grilling depth: forks** (the user, itm_4f132a2cd5ef): only decisions whose paths give materially different deliverables are posted; Gate 1 is one `gate1` item, no per-decision walk.

- **L1 One rule, enforced by a source scan.** One test walks `scripts/`, `deck/`, `bin/`, `hooks/` and checks every
  child start. *Rejected:* recording-spawn tests per module, which would mean 10 files of injection seams for a
  one-option rule.
- **L2 The callee set is wider than the draft.** It is bare `spawn*`, `execFile`, `execFileSync`, `execSync`, `exec`
  and `fork`, and excludes anything after a `.`. That catches `spawnChild`, `spawnOpener`, an injected `spawn`, and
  `integrate.mjs:51`'s `execSync`, and it skips `pty.spawn` and `RegExp#exec`. *Rejected:* matching imported names
  only, which misses `install-path.mjs:151` and `session.mjs`'s injected `spawn`.
- **L3 `deck/run.mjs` `startPlain` is the one exemption, named in the test.** It starts the user's interactive
  `claude` with inherited stdio in their own terminal. *Rejected:* hiding it too. That is probably inert under
  libuv's inherited-stdio rule, but a wrong guess would hide the user's session.
- **L4 Fold the install-only scan into the repo-wide one.** *Rejected:* keeping both, which is two rules that drift.
- **L5 Edit each call in place; no shared git runner.** That is the pattern the codebase uses (`worktrees.mjs:24`,
  `wait.mjs:113`). *Rejected:* a `scripts/git.mjs`, which reconciles eight modules' options and is offered as its
  own ticket.
- **L6 One slice.** About 21 one-line edits plus one test, roughly 70 changed lines, with one risk (the scan's
  precision). *Rejected:* splitting by tree; the test is shared and so would serialise the halves anyway.

## 6. Assumed decisions, agreed by the user with the spec (itm_fb4fa5543414)

- **A1 Spec 3 is in.** *Agreed.* The deck daemon's gate1 lineage check is the one unhidden path in a process with no console,
  so it is the strongest candidate for the random burst. Default: in scope, at no extra diff (it is
  `pilot-branch.mjs`, already in spec 1). The cost is one more QA step.
- **A2 The `ecebaa7b` install scan is deleted in favour of the repo-wide one.** *Agreed.* Default: delete (16 lines). The cost
  is that the install's pin then lives in a test whose name does not say "install".

## 7. Out of scope

- A shared hidden git runner (L5): a candidate ticket for `main`.
- Test helpers under `*/test/` (`scripts/test/lib/run-hook.mjs`): they are not the pilot's runtime.
- Windows that Claude Code itself opens for its own Bash, hooks or MCP servers, and the `pilot run` terminal that the
  deck's Start opens on purpose (`deck/session.mjs:128`).
- Any change to stdio, shell, timeout or detached options.

## 8. Slices

Width 1; longest stem 1

| Slice | Delivers | Files owned | After | Reviewers | Detail |
| --- | --- | --- | --- | --- | --- |
| S1 Every child the pilot starts is started hidden (walking skeleton) | 1, 2, 3, 4 | `scripts/test/hidden-spawns.test.mjs` (new), `scripts/test/install-command.test.mjs`, `scripts/{audit-context,audit-spend,base,build-rules-ledger,check-upstream,integrate,land,sync,pilot-branch}.mjs`, `deck/tickets.mjs` | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S1](slices/S1.md) |

## 9. Acceptance evidence, in the order the user meets it

1. On this machine, QA runs `pilot tickets`, `pilot base`, `pilot audit`, `pilot sync`, `pilot integrate` and
   `pilot land` from a Claude Code agent while the user watches: no console window flashes (spec 2).
2. QA posts a gate1 on a scratch deck while the user watches: no window flashes (spec 3).
3. `npm test`: `hidden-spawns.test.mjs` is green; its red run before the edits listed the 21 sites (spec 1). The
   install scan exists only there (spec 4).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Delivers |
| --- | --- | --- | --- | --- | --- | --- |
| S1 Every child the pilot starts is started hidden | integrated 19fe51ab | `slice/hidden-spawns-s1` | #770 | `pilot-hidden-spawns-s1` | – | 1, 2, 3, 4 |
| Feature `hidden-spawns` | fix round, QA | `feat/hidden-spawns` | #592 (draft) | `pilot-hidden-spawns` | S1 | 1, 2, 3, 4 |

## 11. Principles review (once, on the whole feature, after S1)

| Finding | Verdict |
| --- | --- |
| Test-1 fixture line ` * sync spawns (…)` sits outside any comment block, so S1's rewrite check fails on it | kept: wrapped in `/** … */` |
| Duplicate `windowsHide` key at `deck/landing.mjs` `startLanding` beside `landingSpawnOptions` | dropped: the alternative is a scanner special case for one helper; the pilot's decision in #770 |
| `childStarts` and `EXEMPT` exported with no importer | kept: exports dropped |
| Function-declaration skip (test line 28) never fires in production | kept: deleted; fixture `declared` carries `spawnChild` |
| No guard against `import * as`, `require(` or a non-`spawn` alias of `child_process` | kept: one assertion added, closing the typescript-reviewer's MEDIUM |
| S1 Files owned misses the five files the base merge added; no `Model:` line | kept: doc edit |
| Security read of `deck/landing.mjs`, `scripts/{gate,branches,merge-generated,vocabulary}.mjs` | APPROVE: only `windowsHide: true` added, no stdio/env/argv change |
| Design alternative: a `scripts/child.mjs` shim defaulting `windowsHide` plus an import ban, replacing the scan (moves L1, L5) | user: Keep the scan (itm_c7dcd93b5044); the shim is the rejected alternative, not built |
| Evidence runner table (coverage, mutation, complexity, duplication, cycles) | dropped: it ran on an incomplete review checkout (ENOENT `agents/`, `docs/adr`), so none of it describes this tree |
