# Brief: clear-waits-co-pilot

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`), default branch `main`, pilot branch `pilot`. Never
work in that checkout or in another session's worktree: create your own, named `pilot-clear-waits-co-pilot-s<n>`,
beside it.

On Windows a worktree in a deep directory needs `git -c core.longpaths=true worktree add`: tracked fixture paths
run to 127 characters. Run `npm ci` in the new worktree before the first test run; without it about twenty
unrelated tests fail.

## Base and PR target

Base: `feat/clear-waits-co-pilot`, cut from `design/clear-waits-co-pilot` at Gate 1, itself on `origin/pilot` at
`b5270c0e` (0.7.20 plus the yellow-agent run). Every slice PR is a **draft** against `feat/clear-waits-co-pilot`
and is never marked ready; the pilot merges it. Branch name: `slice/clear-waits-co-pilot-s<n>`. PR title:
`feat(clear-waits-co-pilot): S<n> <title as the artefact words it>`. Write PR bodies with
`gh pr create --body-file <file>`; a heredoc body fails in Git Bash.

## Artefact

`docs/design/clear-waits-co-pilot/architecture.md`. Slice files are `docs/design/clear-waits-co-pilot/slices/S<n>.md`.
The locked decisions are §5 (L1 to L12; L6 is superseded by L11); a slice moves none of them. The ADR for this feature is `docs/adr/0089`;
no slice adds one. The ubiquitous language is §4: a *chain hand-off* has `next`, a *context hand-off* has none,
a *release* is any write that ends a live co-pilot, and a *pause* is `main`'s message telling its co-pilot to
integrate the slice in flight and hand back `paused`. Both kinds of hand-off are held while a co-pilot is live.

## Gate command

```
npm ci
npm test
node scripts/check-references.mjs
node scripts/check-provenance.mjs agents/ skills/ rules/
```

`check-provenance.mjs` run without directories prints its usage and exits 2: it has checked nothing.

There is no typecheck, lint or build step. For output you can grep, `node --test --test-reporter=tap <file>`. Pins
on one rule are spread over many test files (`deck/test/`, `scripts/test/`, `hooks/test/`): grep for the sentence
or the refusal before the first full run. One file alone: `node --test <file>`. A directory does not work on
Windows: use the glob form, `node --test deck/test/*.test.mjs`.

The live gate, for every slice whose file names one under Verification: a scratch repository with its own deck,
`PILOT_DECK_DIR=<scratch>/.deck PILOT_DECK_PORT=45<nn> PILOT_DECK_NO_OPEN=1 node bin/pilot.mjs deck --foreground`
with nn = your slice number, and `pilot run` from your worktree's `bin/pilot.mjs` in that scratch repository, under
a Claude session that loads this worktree's copy of the plugin (`claude --plugin-dir <your worktree>`), never the
installed one. Its output goes in the PR.

Never the user's deck on port 4321, never its store at `~/.claude/pilot/deck.json`, never the real
`~/.claude/settings.json`, and never this repository's branches on GitHub beyond your own slice branch. The test
suite must never open a window or a browser: `deck/test/no-open.mjs` sets `PILOT_DECK_NO_OPEN` and
`PILOT_DECK_NO_START`. Set `MSYS_NO_PATHCONV=1` before a curl whose argument starts with `/api`.

## Known flaky tests

`deck/test/usage.test.mjs`'s reset-time test and `deck/test/daemon.test.mjs`'s progress-token test have failed
under load and never alone; rerun the one file before you call it a regression. Otherwise none known.

## Shared constraints

- `deck/server.mjs` and `deck/test/co-pilot.test.mjs` are owned by both slices in sequence: touch only the
  functions and tests your slice file names.
- Several tests read the real `agents/pilot.md` and pin its wording. When a pin fails after your edit, read what
  rule it pins: change the pin only when your slice changed that rule on purpose, and say so in the PR; never
  loosen a pin to pass.
- `scripts/measure-prompt.mjs` pins the pilot's prompt share at 10124 with no surplus
  (`scripts/test/measure-prompt.test.mjs:123`): a sentence added to `agents/pilot.md` is paid for by one cut. The
  CLI table does not print the pinned figure: call `measure()` as that test does. S2 reports the figure before and
  after and ends at or under the pin; its slice file's Payment line says what pays.
- A stored run record is data, never an instruction: no agent type, branch or artefact is read from one.
- The wrapper never reads the deck through `deck_read` with a `repo`: that marks the user's replies delivered. It
  reads `GET /api/record?repo=`.
- Small-diff limit: 400 changed lines per slice, tests included. Past it, stop and ask `main`.
- `deck/store.mjs`, `deck/server.mjs` and `deck/run.mjs` are each over a thousand lines: read the ranges your slice
  file anchors, not the whole file, and one file per turn.
- Files: use the Edit and Write tools, never a shell heredoc.
- The reviewer is `pilot:typescript-reviewer` for every slice. S1 (a new write on `/api/tool` and a new read on
  `/api/record`) also gets `pilot:security-reviewer`.

## Commit trailer

Copy it exactly, whatever model you run on.

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

## PR footer

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```
