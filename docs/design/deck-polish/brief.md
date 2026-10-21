# Brief: deck-polish

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`), default branch `main`. Never work in that checkout
or in another session's worktree: create your own, named `pilot-deck-polish-s<n>`, beside it.

On Windows a worktree in a deep directory needs `git -c core.longpaths=true worktree add`: 21 tracked fixture paths
are 127 characters long. Run `npm ci` in the new worktree before the first test run; without it about twenty
unrelated tests fail.

## Base and PR target

Base: `feat/deck-polish`. Every slice PR is a **draft** against `feat/deck-polish` and is never marked ready; the
pilot merges it. Branch name: `slice/deck-polish-s<n>`. Write PR bodies with `gh pr create --body-file <file>`; a
heredoc body fails in Git Bash.

## Artefact

`docs/design/deck-polish/architecture.md`, approved at Gate 1 on 2026-09-30 (itm_0555aa06312d). Slice files are
`docs/design/deck-polish/slices/S<n>.md`. The locked decisions are §5 (L1–L13); a slice moves none of them.

## Gate command

```
npm ci
npm test
node scripts/check-references.mjs
node scripts/check-provenance.mjs agents/ skills/ rules/
```

`check-provenance.mjs` run without directories prints its usage and exits 2: it has checked nothing.

There is no typecheck, lint or build step. One file alone: `node --test <file>`.

For a slice with a surface (S1, S3, S5, S6, S7), the live gate is the deck started from your worktree on its own
port and store, opened in a browser and looked at:

```
PILOT_DECK_DIR=<scratch>/.deck PILOT_DECK_PORT=<free port> PILOT_DECK_NO_OPEN=1 node bin/pilot.mjs deck --foreground
```

A Windows recipe that seeds such a deck is in `C:/Users/Hazzard/Projects/pilot-qa-seed/ticket-making/`. Never the
user's deck on port 4321, and never its store at `~/.claude/pilot/deck.json`. S4's surface is the Claude Code
status line: run `hooks/context-usage-statusline.js` with a fixture on stdin and read what it prints.

## Known flaky tests

`deck/test/usage.test.mjs`'s reset-time test failed twice under load on 2026-09-28 and never alone; rerun the one
file before you call it a regression. Otherwise none: the suite ran 1905 of 1905 on 2026-09-29, about 30 s.

## Shared constraints

- `agents/pilot.md` and the deck tool schemas are pinned together by `scripts/test/measure-prompt.test.mjs`; no
  slice of this run edits `agents/` or `skills/`.
- Small-diff limit: 300 changed lines a slice. Past it, stop and ask `main`.
- `deck/ui/render.mjs` is 1892 lines, `store.mjs` 1490, `server.mjs` 1295: read the ranges your slice file anchors,
  not the whole file, and one file per turn.

## Commit trailer

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

## PR footer

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```
