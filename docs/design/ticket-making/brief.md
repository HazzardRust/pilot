# Brief: ticket-making

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`), default branch `main`. Never work in that checkout
or in another session's worktree: create your own, named `pilot-ticket-making-s<n>`, beside it.

On Windows a worktree in a deep directory needs `git -c core.longpaths=true worktree add`: 21 tracked fixture paths
are 127 characters long.

## Base and PR target

Base: `feat/ticket-making`. Every slice PR is a **draft** against `feat/ticket-making` and is never marked ready; the
pilot merges it. Branch name: `slice/ticket-making-s<n>`.

## Artefact

`docs/design/ticket-making/architecture.md`, approved at Gate 1 on 2026-09-29 (itm_497127a587c9). Slice files are
`docs/design/ticket-making/slices/S<n>.md`.

## Gate command

```
npm ci
npm test
node scripts/check-references.mjs
node scripts/check-provenance.mjs agents/ skills/ rules/
```

`check-provenance.mjs` run without directories prints its usage and exits 2: it has checked nothing.

There is no typecheck, lint or build step. One file alone: `node --test <file>`.

For a slice with a surface (S1, S4, S5, S6), the live gate is the deck started from your worktree on its own port
and store, opened in a browser and looked at:

```
PILOT_DECK_DIR=<scratch>/.deck PILOT_DECK_PORT=<free port> PILOT_DECK_NO_OPEN=1 node bin/pilot.mjs deck --foreground
```

Never the user's deck on port 4321, and never its store at `~/.claude/pilot/deck.json`.

## Known flaky tests

None. On 2026-09-29 the suite ran 1772 tests twice with identical results, 0 failures, about 30 s.

## Shared constraints

- `agents/pilot.md` and the deck tool schemas the pilot is granted are pinned together to 10400 tokens by `scripts/test/measure-prompt.test.mjs` (L18; 9563 after S2). Six slices edit it; your slice
  file states your share. Measure with `scripts/measure-prompt.mjs` before you commit.
- Small-diff limit: 400 changed lines a slice. Past it, stop and ask `main`.
- `hooks/` and `scripts/install-rules.mjs` are out of scope for every slice.

## Commit trailer

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

## PR footer

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```
