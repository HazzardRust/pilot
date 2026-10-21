# Brief: install-allow-land

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`), default branch `main`, pilot branch `pilot`. Never
work in that checkout or in another session's worktree: create your own, named `pilot-install-allow-land-s<n>`,
beside it. Run `npm ci` in the new worktree before the first test run.

## Base and PR target

Base: `feat/install-allow-land`, cut from `design/install-allow-land` at Gate 1 (itself from `origin/pilot`
178c7e5e). Every slice PR is a **draft** against `feat/install-allow-land`, never marked ready; the pilot merges it.
Branch: `slice/install-allow-land-s<n>`. Write PR bodies with `gh pr create --body-file <file>`.

## PR titles

- Slice: `feat(install-allow-land): S<n> <title as the artefact words it>`, the first word after `S<n>` lower-case.
- Fix round: `fix(install-allow-land): <what>`
- Feature PR: `feat(install-allow-land): the install allows the pilot's merge commands`

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

`docs/design/install-allow-land/architecture.md`; slice files `docs/design/install-allow-land/slices/S<n>.md`.
Locked decisions §5 (L1 to L11) move in no slice. New ADR: `docs/adr/0110-the-install-allows-the-pilots-own-merge-commands.md`
in S1, in the format of its neighbours (0107 to 0109 are taken by other live features), then
`node scripts/adr-index.mjs` to regenerate `docs/adr/README.md`. S1 and S2 run in parallel and share no file.

## Gate command

```
npm ci
npm test
node scripts/adr-index.mjs --check
```

No typecheck, lint or build step. One file: `node --test <file>`; on Windows use the glob form,
`node --test scripts/test/*.test.mjs`, not a directory.

## Known flaky tests

- `deck/test/usage.test.mjs` "in 2 hrs"
- `deck/test/run.test.mjs` "a session that ends while the wrapper waits for the marker stops the wait" (timing; passes alone)

## Constraints

- The user's own `~/.claude/settings.json` is never written or read by a test: every install run goes to a
  scratch file via `--settings <path>`.
- `scripts/test/measure-prompt.test.mjs`: the prompt budget pins are the user's and never move; S2's edit to
  `agents/pilot.md` (:387) pays for added text by removing redundant text.
- Live verification (spec 4, S1 and QA): a scratch auto-mode session, `claude --permission-mode auto --settings <scratch>`,
  in a scratch clone whose `origin` is a local bare repository; never the user's session or settings.
- Small-diff limit: 200 changed lines per slice; past it, stop and ask `main`.

## Report

A table: slice, branch, PR, head SHA, tests added (failed before, pass after), gate output line, live evidence.
