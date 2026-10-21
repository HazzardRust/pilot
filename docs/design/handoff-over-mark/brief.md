# Brief: handoff-over-mark

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`), default branch `main`, pilot branch `pilot`. Never
work in that checkout or in another session's worktree: create your own, named `pilot-handoff-over-mark-s<n>`,
beside it. Run `npm ci` in the new worktree before the first test run.

## Base and PR target

Base: `feat/handoff-over-mark`, cut from `design/handoff-over-mark` at Gate 1 (itm_f92d704694c6, 8f0b661a, itself
on `origin/pilot` 26547862). The slice PR is a **draft** against `feat/handoff-over-mark`, never marked ready; the
pilot merges it. Branch: `slice/handoff-over-mark-s1`. Write PR bodies with `gh pr create --body-file <file>`.

## PR titles

- Slice: `feat(handoff-over-mark): S1 <title as the artefact words it>`, the first word after `S1` lower-case.
- Fix round: `fix(handoff-over-mark): <what>`
- Feature PR: `feat(handoff-over-mark): a finished run hands off only over the context mark`

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

`docs/design/handoff-over-mark/architecture.md`; slice file `docs/design/handoff-over-mark/slices/S1.md`.
Locked decisions §5 (L1 to L9) move in no slice. S1 writes the ADR amending 0060 at the next free number (0115 expected;
0113 and 0114 are taken on other live branches), then `node scripts/adr-index.mjs` to regenerate `docs/adr/README.md`.

## Gate command

```
npm ci
npm test
node scripts/adr-index.mjs --check
node scripts/check-references.mjs
```

No typecheck, lint or build step. One file: `node --test <file>`; on Windows use the glob form,
`node --test deck/test/*.test.mjs`, not a directory.

## Known flaky tests

- `deck/test/usage.test.mjs` "in 2 hrs"
- `deck/test/run.test.mjs` "a session that ends while the wrapper waits for the marker stops the wait" (timing; passes alone)

## Constraints

- Prompt budget pins (`scripts/test/measure-prompt.test.mjs`, `qa-preview.test.mjs`) are the user's and never move;
  this feature changes no byte of `agents/pilot.md` (L: the instruction rides the finish reply).
- The guard owns both marks (`hooks/context-size-guard.js`); no number is copied into `deck/` — a grep pin says so.
- A test never touches `~/.claude/pilot` or the deck on 4321: stores under `os.tmpdir()`, the daemon on a free port.
- Live verification (S1 and QA): a scratch deck on a free port with a seeded red ticket and a queued head ticket, the finish
  driven once under the mark and once over it; never the deck on 4321.
- Small-diff limit: 200 changed lines; past it, stop and ask `main`.

## Report

A table: slice, branch, PR, head SHA, tests added (failed before, pass after), gate output line, live evidence.
