# fundamentalist-decisions: implementer brief

## Repository

`C:/Users/Hazzard/Projects/pilot` (HazzardRust/pilot). Artefact: `docs/design/fundamentalist-decisions/architecture.md`; slices under `slices/`.

## Base and PR target

Base: `feat/fundamentalist-decisions`, cut from `pilot` at `7c987d3c` or its tip when the run starts. Slice PRs target `feat/fundamentalist-decisions`; the feature PR targets `pilot`.

## Remote

Remote: origin

## Gate command

`npm test` on Windows, once, in your own worktree. Before a landing: `node scripts/gate.mjs` five times in a row on a fresh Linux clone (WSL, node 26 at `~/node26`) at the exact commit; all five must pass. GitHub Actions does not run on this account: a red or unstarted check is not evidence.

## Known flaky tests

- Windows: the worktrees test has failed `MODULE_NOT_FOUND` mid-run with no summary (seen twice 2026-10-19).
- The nested fixture gate once reported "powershell.exe not found" while three gates ran at once.

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

- Slice: `feat(fundamentalist-decisions): S<n> <title>`, the title lower-case first, e.g. `feat(fundamentalist-decisions): S1 the fundamentalist leads with the decisions pass`
- Fix round: `fix(fundamentalist-decisions): <what>`
- Feature: `feat(fundamentalist-decisions): the fundamentalist attacks the big-picture decisions`

## Overlaps and rebase order

- suite-at-landing (about to land) edits `agents/pilot-co-pilot.md:47` beside S2's section: land it first, rebase onto it.
- short-path edits `agents/pilot.md` `## Yellow`; architect-runs-red edits Phase A and `agents/pilot-architect.md`: neither touches step 7. Both may raise the pilot pin in `scripts/test/measure-prompt.test.mjs:178`; whichever lands later re-measures on rebase and records the combined number.
- ADR 0165-0169 are held by other design branches; this run takes 0171 (S3).

## QA environment

Scratch decks and the local gate; no migrations. Spec 4's replay: the fundamentalist on `architect-deeper` and `back-arrow` (their artefacts and landed diffs).
