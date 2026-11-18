# Brief: handoff-books

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Default branch `main`, pilot branch `pilot`. Never
work in that checkout or another session's worktree; create your own beside it, `pilot-handoff-books-s<n>`. Run
`npm ci` in the new worktree before the first test run.

## Base and PR target

The base is `feat/handoff-books`, cut at Gate 1 from `origin/pilot` (d7569a49 at the design). Every slice PR is a
**draft** against `feat/handoff-books`, never marked ready. Branch name: `slice/handoff-books-s<n>`.

## Remote

Remote: origin

## PR titles

- A slice: `feat(handoff-books): S<n> <title as in the artefact, lower-case first>`
- A fix round: `fix(handoff-books): <what>`
- The feature PR: `feat(handoff-books): the hand-off is when the run keeps its books`

## Commit trailer

```
Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NXgSFodNbTKqoJ71EpWMS5
```

## PR footer

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01NXgSFodNbTKqoJ71EpWMS5
```

## Gate command

```
npm ci
npm test
```

One file: `node --test <file>`. The pilot prompt's own-share pin is 11871 (`node scripts/measure-prompt.mjs`, 11850
at d7569a49) and is never raised. No test asserts a phrase in an agent's prose; a test that greps for an absence
is a structural lint and carries `// lint: <rule>`.

## Known flaky tests

None recorded.

## Other runs on these files

- handoff-mod (itm_97c9e8fdf1d2) owns `hooks/context-size-guard.js`, `scripts/handoff.mjs` and pilot.md's hand-off
  section until it lands; S2 and S3 start after it is on `pilot`.
- blocked-steps (itm_a2aeb8349afc) S2 edits `agents/pilot.md` first; S10 moves the guard's `advice` text to
  `hooks/lib/guard-advice.js`. Re-read line numbers on `pilot` at your start.

## Tests and live verification

Tests isolate the store with `PILOT_DECK_DIR` (`deck/store-dir.mjs`) and never read `~/.claude/pilot`. Live checks
use a scratch deck (`pilot deck --scratch`, stopped after). Claude Code 2.1.326 is installed.

## Diff limit

400 changed lines per slice. Past that, stop and ask `main`.
