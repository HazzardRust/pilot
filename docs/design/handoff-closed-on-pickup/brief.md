# Brief: handoff-closed-on-pickup

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`), default branch `main`, pilot branch `pilot`. Never
work in that checkout or in another session's worktree: create your own, named `pilot-handoff-closed-on-pickup-s<n>`,
beside it. Run `npm ci` in the new worktree before the first test run.

## Base and PR target

Base: `feat/handoff-closed-on-pickup`, cut from `design/handoff-closed-on-pickup` at Gate 1 (itm_07d6f0cadd84,
387491f5, itself on `origin/pilot` 26547862). Every slice PR is a **draft** against `feat/handoff-closed-on-pickup`,
never marked ready; the pilot merges it. Branch: `slice/handoff-closed-on-pickup-s<n>`. Write PR bodies with
`gh pr create --body-file <file>`. The three slices share no file and run at once.

## PR titles

- Slice: `feat(handoff-closed-on-pickup): S<n> <title as the artefact words it>`, the first word after `S<n>` lower-case.
- Fix round: `fix(handoff-closed-on-pickup): <what>`
- Feature PR: `feat(handoff-closed-on-pickup): the pilot closes the hand-off on pick-up, No grilling, ticket proposals`

## Commit trailer

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014NzGDsFAKbgZCKm3yKrMDh
```

## PR footer

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_014NzGDsFAKbgZCKm3yKrMDh
```

## Artefact

`docs/design/handoff-closed-on-pickup/architecture.md`; slice files `docs/design/handoff-closed-on-pickup/slices/S<n>.md`.
Locked decisions §5 move in no slice. No new ADR.

## Gate command

```
npm ci
npm test
node scripts/adr-index.mjs --check
node scripts/check-references.mjs
```

No typecheck, lint or build step. One file: `node --test <file>`; on Windows use the glob form,
`node --test hooks/test/*.test.js`, not a directory.

## Known flaky tests

- `deck/test/usage.test.mjs` "in 2 hrs"
- `deck/test/run.test.mjs` "a session that ends while the wrapper waits for the marker stops the wait" (timing; passes alone)

## Constraints

- Prompt budget pins (`scripts/test/measure-prompt.test.mjs`, `qa-preview.test.mjs`) are the user's and never move.
  The pilot's share has **0.25 tokens** of headroom at 26547862: every byte S2 adds to `agents/pilot.md` is paid for
  by a byte removed elsewhere in it, and the pin may only go down.
- The Stop hook keeps its never-a-trap rules: blocks once per stop, stands aside on `stop_hook_active`, never blocks on a
  dead deck, never waits. It blocks only the session that was handed the item, never the one that posted it.
- A test never touches `~/.claude/pilot` or the deck on 4321: stores under `os.tmpdir()`, the daemon on a free port.
- Small-diff limit: 200 changed lines per slice; past it, stop and ask `main`.

## Report

A table: slice, branch, PR, head SHA, tests added (failed before, pass after), gate output line, live evidence.
