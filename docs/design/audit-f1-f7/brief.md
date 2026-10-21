# Brief: audit-f1-f7

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`), default branch `main`, pilot branch `pilot`. Never
work in that checkout or in another session's worktree: create your own, named `pilot-audit-f1-f7-s<n>`,
beside it. Run `npm ci` in the new worktree before the first test run.

## Base and PR target

Base: `feat/audit-f1-f7`, cut from `design/audit-f1-f7` at Gate 1 (itself from `origin/pilot` 178c7e5e).
Every slice PR is a **draft** against `feat/audit-f1-f7`, never marked ready; the pilot merges it.
Branch: `slice/audit-f1-f7-s<n>`. Write PR bodies with `gh pr create --body-file <file>`.

Waits, from §8, lifted by the user (L12 overridden): feat/co-pilot-successor (#445) and feat/user-threads-open (#451) are merged
into `feat/audit-f1-f7` (4746f1f0, 68ee4a67), so every slice builds on their code now; none waits.

## PR titles

- Slice: `feat(audit-f1-f7): S<n> <title as the artefact words it>`, the first word after `S<n>` lower-case.
- Fix round: `fix(audit-f1-f7): <what>`
- Feature PR: `feat(audit-f1-f7): cheaper deck reads, a quiet test loop, a scratch deck, maps and the split`

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

`docs/design/audit-f1-f7/architecture.md`; slice files `docs/design/audit-f1-f7/slices/S<n>.md`.
Locked decisions §5 (L1 to L14) move in no slice. New ADR, written by S11:
`docs/adr/0112-deck-modules-are-flat-siblings-behind-facades.md`, recording L9 and L14 in the format of its
neighbours (0107 to 0111 are taken by other live features), then `node scripts/adr-index.mjs` to regenerate
`docs/adr/README.md`.

## Gate command

```
npm ci
npm test
node scripts/adr-index.mjs --check
node scripts/check-references.mjs
```

No typecheck, lint or build step. One file: `node --test <file>`; on Windows use the glob form,
`node --test scripts/test/*.test.mjs`, not a directory.

## Known flaky tests

- `deck/test/usage.test.mjs` "in 2 hrs"
- `deck/test/run.test.mjs` "a session that ends while the wrapper waits for the marker stops the wait" (timing; passes alone)

## Constraints

- Prompt budget pins (`scripts/test/measure-prompt.test.mjs`, `qa-preview.test.mjs`) are the user's and never
  move: QA's share has 0 headroom, the pilot's 7.25 tokens. `deck_read`'s schema stays ≤ 467 bytes (L2); S8's
  edit to `agents/pilot-qa.md` is byte-neutral or shorter.
- `pilot deck --stop` kills only a pid in the scratch registry whose health reports that pid (L7); a test never
  starts or stops anything on 4321, never touches `~/.claude/pilot`, and writes stores under `os.tmpdir()`.
- Test fixtures that must fail go to a temp directory, never under any `test/` directory (Node's glob).
- Live verification (S6–S8 and QA): a scratch deck from the feature's own `pilot deck --scratch` on a free port;
  never the user's deck.
- Small-diff limit: 200 changed lines per slice; a move slice (S11–S20) may exceed it only in moved lines, and
  says so in its PR; past 200 lines of non-move change, stop and ask `main`.

## Report

A table: slice, branch, PR, head SHA, tests added (failed before, pass after), gate output line, live evidence.
