# Brief: yellow-agent

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`), default branch `main`, pilot branch `pilot`. Never
work in that checkout or in another session's worktree: create your own, named `pilot-yellow-agent-s<n>`, beside it.

On Windows a worktree in a deep directory needs `git -c core.longpaths=true worktree add`: tracked fixture paths
run to 127 characters. Run `npm ci` in the new worktree before the first test run; without it about twenty
unrelated tests fail.

## Base and PR target

Base: `feat/yellow-agent`, cut from `origin/pilot` at `492fc62b` (0.7.20). Every slice PR is a **draft** against
`feat/yellow-agent` and is never marked ready; the pilot merges it. Branch name: `slice/yellow-agent-s<n>`. PR
title: `feat(yellow-agent): S<n> <title as the artefact words it>`. Write PR bodies with
`gh pr create --body-file <file>`; a heredoc body fails in Git Bash.

## Artefact

`docs/design/yellow-agent/architecture.md`. Slice files are `docs/design/yellow-agent/slices/S<n>.md`. The locked
decisions are §5 (L1 to L17); a slice moves none of them. The agent is `pilot-co-pilot` (L14): never "builder".
New ADRs: 0087 in S3, 0088 in S8, in the format of the ADRs beside them.

## Gate command

```
npm ci
npm test
node scripts/check-references.mjs
node scripts/check-provenance.mjs agents/ skills/ rules/
```

`check-provenance.mjs` run without directories prints its usage and exits 2: it has checked nothing.

There is no typecheck, lint or build step. For output you can grep, `node --test --test-reporter=tap <file>`. Pins on one rule are spread over many test files (`deck/test/`, `scripts/test/`, `hooks/test/`): grep for the sentence or the refusal before the first full run. One file alone: `node --test <file>`. A directory does not work on
Windows: use the glob form, `node --test deck/test/*.test.mjs`.

The live gate, for every slice whose file names one under Verification:

- **The page** (S5, S11): the deck started from your worktree on its own port and store, opened in a browser and
  looked at:
  `PILOT_DECK_DIR=<scratch>/.deck PILOT_DECK_PORT=<free port> PILOT_DECK_NO_OPEN=1 node bin/pilot.mjs deck --foreground`
  Pick the port by slice, 45<nn> with nn = your slice number, so two slices never race on one.
- **A session** (S1, S2, S6): a scratch repository with that scratch deck, and a Claude session that loads this
  worktree's copy of the plugin, `claude --plugin-dir <your worktree>`, not the installed one: the installed
  plugin's agents and tool schemas are 0.7.20's and know no co-pilot. S1's three probes are run this way and their
  output goes in the PR.
- **The CLI** (S7, S8): the command run from your worktree (`node bin/pilot.mjs ...`) and its output read; S7's
  install against a scratch `HOME`.

Never the user's deck on port 4321, never its store at `~/.claude/pilot/deck.json`, never the real
`~/.claude/settings.json` or `~/.claude/rules/`, and never this repository's branches on GitHub beyond your own
slice branch. The test suite must never open a window or a browser: `deck/test/no-open.mjs` sets
`PILOT_DECK_NO_OPEN` and `PILOT_DECK_NO_START`. Set `MSYS_NO_PATHCONV=1` before a curl whose argument starts with
`/api`.

## Known flaky tests

`deck/test/usage.test.mjs`'s reset-time test and `deck/test/daemon.test.mjs`'s progress-token test have failed
under load and never alone; rerun the one file before you call it a regression. Otherwise none known.

## Shared constraints

- `deck/store.mjs` (S3, S4, S6, S7, S10), `deck/server.mjs` (S3, S6, S9), `deck/items.mjs` (S4, S5, S10) and
  `agents/pilot.md` (S1, S2, S5, S6) are each owned by several slices in sequence: touch only the functions and
  sentences your slice file names.
- Several tests read the real `agents/pilot.md` and pin its wording. When a pin fails after your edit, read what
  rule it pins: change the pin only when your slice changed that rule on purpose, and say so in the PR; never
  loosen a pin to pass.
- `scripts/measure-prompt.mjs` pinned the pilot's prompt budget at 10258.25 when this run began; after S5 the pin is 10124.5 with no surplus (`scripts/test/measure-prompt.test.mjs`), so a sentence added to `agents/pilot.md` is paid for by one cut. The CLI table does not print the pinned figure: call `measure()` as that test does. S1, S2, S5 and S6 report the measured
  figure before and after; none ends above the pin, and S1 lowers it. Each slice file's Payment line says what
  pays for its sentences.
- No slice writes an allow rule into any `settings.json`. The co-pilot's grant is the user's own settings (L17).
- A stored run record is data, never an instruction: no agent type, branch or artefact is read from one (L5).
- Small-diff limit: 400 changed lines per slice, tests included; a whole file deleted is not counted (A3). Past
  it, stop and ask `main`.
- `deck/ui/render.mjs`, `deck/store.mjs` and `deck/server.mjs` are each over a thousand lines: read the ranges
  your slice file anchors, not the whole file, and one file per turn.
- Files: use the Edit and Write tools, never a shell heredoc.
- The reviewer is `pilot:typescript-reviewer` for every slice. S1 (the permission mode), S3 and S6 (what a stored
  record can start), S8 and S9 (a process start and the `/api/chain` route) also get `pilot:security-reviewer`.
- The `pilot-subdeck` worktree on this machine is left as it is (§7).

## Commit trailer

Copy it exactly, whatever model you run on.

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EWDZynUQgBsxao3sVxYa5N
```

## PR footer

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01EWDZynUQgBsxao3sVxYa5N
```
