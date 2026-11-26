# Brief: handoff-self-close

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/jrylk/Projects/pilot` (GitHub `HazzardRust/pilot`). Never work in that shared checkout or in another
session's worktree. Create your own beside it, `pilot-handoff-self-close-s<n>`, and run `npm ci` there first.

## Remote

Remote: origin

## Base and PR target

The base is `feat/handoff-self-close`, cut at Gate 1 from the design tip on `origin/main` (da9a644). Branches:
`slice/handoff-self-close-s<n>`, pushed for the pilot to integrate; no slice PR. The feature PR target is `pilot`.

## Live root

C:\Users\jrylk\.claude\pilot\live untrusted

## PR titles

- A slice: `feat(handoff-self-close): S<n> <title>`, the title lower-case first, e.g. `feat(handoff-self-close): S1 the deck closes a crew-handoff when its ticket moves on`
- A fix round: `fix(handoff-self-close): <what>`
- The feature PR: `feat(handoff-self-close): a crew hand-off item closes itself`

## Commit trailer

Every commit ends with these two lines, copied exactly:

```
Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NXgSForDWcHA67cB28cNrm
```

## PR footer

Every PR body ends with these lines, copied exactly:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01NXgSForDWcHA67cB28cNrm
```

## Artefact

`docs/design/handoff-self-close/architecture.md`, slices in `slices/S1.md` and `slices/S2.md`. The run's ADR is
`docs/adr/0214-handoff-self-close.md` (S1); the landing numbers it.

## Gate command

```
npm ci
npm run test:quiet
```

One file: `node --test <file>`. Run the full suite once, on the slice's final state. No typecheck, lint or build script.

- `deck/test/facades.test.mjs` caps deck source files at 800 lines: `deck/items.mjs` and `deck/server-wait.mjs` are
  at 799. Net-add no line to them (architecture L5).
- `scripts/test/measure-prompt.test.mjs` pins `agents/pilot.md`'s size; it may only move down.
- Tests that write the trace or store inject a temporary home; never write `~/.claude/pilot/`.

## Known flaky tests

- Full `npm test` runs over 3 minutes and its default reporter has died with no summary: use `npm run test:quiet` for totals.
- The suite writes the live `~/.claude/pilot/deck.json`.
- Every child process must pass `windowsHide: true`; `hidden-spawns.test.mjs` enforces it, in the full suite only.
- `pilot checks --wait` returns pending on windows-latest and needs re-arming.

## Diff limit

400 changed lines per slice. Past that, stop and ask `main`.
