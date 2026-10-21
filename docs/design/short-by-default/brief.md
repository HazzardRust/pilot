# Brief: short-by-default

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`), default branch `main`, pilot branch `pilot`. Never
work in that checkout or in another session's worktree: create your own, named `pilot-short-by-default-s<n>`,
beside it. Run `npm ci` in the new worktree before the first test run.

## Base and PR target

Base: `feat/short-by-default`, cut from `design/short-by-default` at Gate 1 (ticket itm_f679fbab1ae9), itself on
`origin/pilot` 5714fa17. Every slice PR is a **draft** against `feat/short-by-default`, never marked ready; the pilot
merges it. Branch: `slice/short-by-default-s<n>`. Write PR bodies with `gh pr create --body-file <file>`. S1 and S2
share no file and run side by side; S3 runs after both (it reads S1's `MAX_WALKTHROUGH_BODY_LINES` and S2's
`USER_FACING`).

## PR titles

- Slice: `feat(short-by-default): S<n> <title as the artefact words it>`, the first word after `S<n>` lower-case.
- Fix round: `fix(short-by-default): <what>`
- Feature PR: `feat(short-by-default): human-facing text short by default, detail on request`

## Commit trailer

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019aXY9ksfTqaDQ45XvJgA7D
```

## PR footer

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_019aXY9ksfTqaDQ45XvJgA7D
```

## Artefact

`docs/design/short-by-default/architecture.md`; slice files `docs/design/short-by-default/slices/S<n>.md`.
Locked decisions §5 (L1 to L10) move in no slice. S2 writes ADR 0122 (`pilot` already holds 0121; `main` 0119, so
the number may collide at the base merge and be renumbered by the pilot, never by a slice).

## Where things live

The walkthrough refusal is in `deck/store-items.mjs` (grep `MAX_QUESTION_CHARS`), not `deck/items.mjs`; the shape
check in `deck/walkthrough-shape.mjs`. Prompt-budget pins: `scripts/test/measure-prompt.test.mjs` lines ~101-139
(pilot, explorer) and `scripts/test/qa-preview.test.mjs` line ~144 (QA); headroom today pilot 4, QA 0, explorer 0
tokens. The crew voice rule is pinned in `scripts/test/crew-voice.test.mjs`; QA's body-table rule in
`scripts/test/pilot-agents.test.mjs:898`. `:line` anchors are from `pilot` at 5714fa17; find by name if moved.

## Gate command

```
npm ci
npm test
node scripts/adr-index.mjs --check
node scripts/check-references.mjs
```

No typecheck, lint or build step. One file: `node --test <file>`; on Windows use the glob form,
`node --test deck/test/*.test.mjs`, not a directory. `npm run test:quiet` is the dot reporter.

## Known flaky tests

- `deck/test/usage.test.mjs` "in 2 hrs"
- `deck/test/run.test.mjs` "a session that ends while the wrapper waits for the marker stops the wait" (timing; passes alone)
- `hooks/test/inbox.test.js:471` "a session takes its place on the deck without being told anything" (ECONNRESET under load, once in 10)

## Constraints

- Pins move by exactly the measured cost, with a history comment each (L9); nothing else in those test files moves.
- The crew-voice rule L3 forbids brevity wording: the new rule is content ("what the decision needs"), never a line or word cap in prose (L1).
- Live verification, every slice with a surface: a scratch deck started with `pilot deck --scratch --port <spare>`
  (set `PILOT_DECK_NO_START=1`); never the deck on 4321, never `~/.claude/pilot`. The DevTools MCP browser may be
  held by another session; drive your own headless Chrome over CDP or check HTML over HTTP.
- Small-diff limit: 150 changed lines per slice; past it, stop and ask `main`.

## Report

A table: slice, branch, PR, head SHA, tests added (failed before, pass after), gate output line, live evidence, friction.
