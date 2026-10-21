# Brief: design-docs-only

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`), default branch `main`, pilot branch `pilot`. Never
work in that checkout or in another session's worktree: create your own, named `pilot-design-docs-only-s<n>`,
beside it. Run `npm ci` in the new worktree before the first test run.

## Base and PR target

Base: `feat/design-docs-only`, cut from `design/design-docs-only` at Gate 1 (itself from `origin/pilot`
178c7e5e). Every slice PR is a **draft** against `feat/design-docs-only`, never marked ready; the pilot merges it.
Branch: `slice/design-docs-only-s<n>`. Write PR bodies with `gh pr create --body-file <file>`.

## PR titles

- Slice: `feat(design-docs-only): S<n> <title as the artefact words it>`, the first word after `S<n>` lower-case.
- Fix round: `fix(design-docs-only): <what>`
- Feature PR: `feat(design-docs-only): a design branch is pilot plus docs commits only`

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

`docs/design/design-docs-only/architecture.md`; slice files `docs/design/design-docs-only/slices/S<n>.md`.
Locked decisions §5 (L1 to L10) move in no slice. New ADR, written by S2:
`docs/adr/0112-a-design-branch-is-pilot-plus-docs-commits-only.md`, recording L3, L4 and L6 in the format of its
neighbours (0107 to 0110 are taken by other live features), then `node scripts/adr-index.mjs` to regenerate
`docs/adr/README.md`. The graph: S1, S3 and S4 start at once from the feat tip; S2 after S1 (`pilotLineage`);
S5 after S3 and S4 (both integrated).

## Gate command

```
npm ci
npm test
node scripts/adr-index.mjs --check
node scripts/check-slices.mjs
```

No typecheck, lint or build step. One file: `node --test <file>`; on Windows use the glob form,
`node --test scripts/test/*.test.mjs`, not a directory.

## Known flaky tests

- `deck/test/usage.test.mjs` "in 2 hrs"
- `deck/test/run.test.mjs` "a session that ends while the wrapper waits for the marker stops the wait" (timing; passes alone)

## Constraints

- Git is run with an argument array (`execFileSync`/`spawnSync` and friends), never a shell string: the
  branch name a gate1 carries comes from a deck post.
- No git in `deck/store.mjs` `postItem`; no fetch on any deck post path (L5).
- `scripts/test/measure-prompt.test.mjs`: the prompt budget pins are the user's and never move; the pilot's share
  has 7 tokens of room, so S5 rewords `agents/pilot.md`'s gate1 sentence and adds none.
- Live verification (L2, S2 and QA): a scratch clone whose `origin` is a local bare repository, with a scratch
  deck started with its own `PILOT_DECK_DIR` and `PILOT_DECK_PORT`; never the live deck on 4321, never this
  repository's branches or the user's `~/.claude/pilot`.
- Small-diff limit: 200 changed lines per slice; past it, stop and ask `main`.

## Report

A table: slice, branch, PR, head SHA, tests added (failed before, pass after), gate output line, live evidence.
