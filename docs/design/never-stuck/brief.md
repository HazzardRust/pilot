# Brief: never-stuck

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Default branch `main`, pilot branch `pilot`. Never
work in that shared checkout (it is on `main`) or in another session's worktree. Create your own beside it,
`pilot-never-stuck-s<n>`, and run `npm ci` there before the first test.

## Remote

Remote: origin

## Base and PR target

Two runs in sequence (§8 Runs). The base is `feat/never-stuck`, cut at Gate 1 from `origin/pilot` (d7569a49 at
design time). Run B's base is re-cut from `origin/pilot` after Run A lands. Every slice PR is a **draft** against
`feat/never-stuck`, never marked ready; the pilot merges it. Branch: `slice/never-stuck-s<n>`. Write the body with
`gh pr create --body-file <file>`.

## PR titles

- A slice: `feat(never-stuck): S<n> <title as in the artefact, lower-case first>`
- A fix round: `fix(never-stuck): <what>`
- The feature PR: `feat(never-stuck): A run never stops silently, or sits stuck, and a stale plan is re-cut`

## Commit trailer

Every commit ends with these two lines, copied exactly:

```
Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NXgSFodNbTKqoJ71EpWMS5
```

## PR footer

Every PR body ends with these lines, copied exactly:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01NXgSFodNbTKqoJ71EpWMS5
```

## Artefact

`docs/design/never-stuck/architecture.md`, slices in `slices/S<n>.md`. Terms (§4) are fixed; locked decisions §5
are not moved by a slice. A later slice reads an earlier slice's seam from the integration branch by name. The
run's ADR is `docs/adr/0187-never-stuck.md` (S6); the landing numbers it.

## Tests

Nothing reaches GitHub, the live deck on 4321 or a real remote from a test. A test needing a repository makes a
real temp git repository with a bare remote (pattern `deck/test/gate1-lineage.test.mjs`) and removes it in teardown.
A timer test uses `t.mock.timers` (pattern `deck/test/orphan.test.mjs`). A process test uses a stub child script.

## Gate command

```
npm ci
npm test
```

`npm test` runs `node scripts/gate.mjs`. One file: `node --test <file>`. Prompt pins: `node scripts/measure-prompt.mjs`.

## Known flaky tests

None recorded.

## Live verification

A scratch deck only: `pilot deck --scratch`, then `pilot deck --stop <pid>`. A browser look for S12's card; a real
`pilot wait` against the scratch deck for S13; `pilot live-root` on this machine for S17. Claude Code 2.1.326.

## Overlaps

handoff-mod (itm_97c9e8fdf1d2) edits `deck/wait.mjs` and the hand-off hook's neighbours. handoff-books edits
`hooks/session-handoff.js` and `agents/pilot.md`. blocked-steps edits five agent definitions. S8, S12, S13 and the
prose slices start only once those are on `origin/pilot`. Merge `origin/pilot` in; never rebase a pushed branch.

## Diff limit

400 changed lines per slice. Past that, stop and ask `main`.
