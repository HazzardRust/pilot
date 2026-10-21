# architect-runs-red: implementer brief

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Artefact: `docs/design/architect-runs-red/architecture.md`.

## Base and PR target

Base and slice PR target: `feat/architect-runs-red`. Feature PR: `feat/architect-runs-red` into `main`, by the pilot.

## Remote

Remote: origin

## Gate command

`npm test` once on Windows in your own worktree. Before a landing: `node scripts/gate.mjs` five times in a row on a
fresh WSL clone at the exact commit (node 26 at `~/node26`); all five must pass. GitHub Actions does not run on this
account; the local run is the referee.

## QA environment

Scratch decks on this machine (`pilot deck --scratch`); `npm test` on Windows; the Linux gate in WSL as referee;
no migrations.

## Known flaky tests

On Windows the worktrees test has failed MODULE_NOT_FOUND mid-run with no summary, outside the feature under test
(seen twice on 2026-10-19).

## Overlap

`feat/short-path` (S3, S4) owns `deck/items.mjs`, `deck/tools.mjs`, `deck/store-items.mjs`, `agents/pilot.md`
(`## Yellow`) and `docs/adr/README.md`; `one-integration-line` S9 owns `agents/pilot.md`. Whichever lands second
rebases onto the other. ADRs 0165-0168 are reserved; this feature's is 0169.

## Commit trailer

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Cmu6QXexHes1EiTfHDYBgB
```

## PR footer

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01Cmu6QXexHes1EiTfHDYBgB
```

## PR titles

- Slice: `feat(architect-runs-red): S<n> <title>`, the title lower-case first.
- Fix round: `fix(architect-runs-red): <what>`.
- Feature: `feat(architect-runs-red): the architect runs red to the gate 1 post`.
