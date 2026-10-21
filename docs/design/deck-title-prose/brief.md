# Brief: deck-title-prose

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`), default branch `main`, pilot branch `pilot`. Never
work in that checkout or in another session's worktree: create your own, named `pilot-deck-title-prose-s<n>`,
beside it. Run `npm ci` in the new worktree before the first test run.

## Base and PR target

Base: `feat/deck-title-prose`, cut from `design/deck-title-prose` at Gate 1 (itself from `origin/pilot` 178c7e5e).
Every slice PR is a **draft** against `feat/deck-title-prose`, never marked ready; the pilot merges it.
Branch: `slice/deck-title-prose-s<n>`. Write PR bodies with `gh pr create --body-file <file>`.
S2 comes after S1: branch it from S1's tip (pipeline) and rebase onto `feat/deck-title-prose` once S1 is integrated.

## PR titles

- Slice: `feat(deck-title-prose): S<n> <title as the artefact words it>`, the first word after `S<n>` lower-case.
- Fix round: `fix(deck-title-prose): <what>`
- Feature PR: `feat(deck-title-prose): a title inside deck prose is set off from the prose`

## Commit trailer

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018AhBBtoZQLm8YkRkinesmx
```

## PR footer

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_018AhBBtoZQLm8YkRkinesmx
```

## Artefact

`docs/design/deck-title-prose/architecture.md`; slice files `docs/design/deck-title-prose/slices/S<n>.md`.
Locked decisions §5 (L1 to L8) move in no slice. No new ADR unless a slice file names one.

## Gate command

```
npm ci
npm test
node scripts/adr-index.mjs --check
```

No typecheck, lint or build step. One file: `node --test <file>`; on Windows use the glob form,
`node --test deck/test/*.test.mjs`, not a directory.

## Known flaky tests

- `deck/test/usage.test.mjs` "in 2 hrs"
- `deck/test/run.test.mjs` "a session that ends while the wrapper waits for the marker stops the wait" (timing; passes alone)
- A fake deck in a test that leaves one route unanswered hangs `node --test` with no timeout: answer every route the code reads.

## Constraints

- `deck/ui/render.mjs` is also edited by feat/user-threads-open (#451, near the chat list ~1680-1690) and
  feat/co-pilot-successor (#445, the Tickets panel); stay inside the sites the slice file names.
- One `.ref` rule in `deck/ui/deck.css`; no inline style; the `<title>` tag stays plain text (L4, HEADING slot).
- Live verification: a scratch deck daemon on a free port with its own `PILOT_DECK_DIR` and `PILOT_DECK_NO_OPEN=1`,
  seeded by HTTP or MCP, screenshots of the overview and one thread page in a real browser (chrome-devtools) on the PR.
  Never the user's live deck on 4321 or 4399.
- Small-diff limit: 200 changed lines per slice; past it, stop and ask `main`.

## Report

A table: slice, branch, PR, head SHA, tests added (failed before, pass after), gate output line, live evidence (screenshot paths).
