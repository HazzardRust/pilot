# Brief: install-pilot-path

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/socce/Projects/pilot` (GitHub `HazzardRust/pilot`), default branch `main`, pilot branch `pilot`. Never
work in that checkout or in another session's worktree: create your own, named `pilot-install-pilot-path-s<n>`,
beside it. Run `npm ci` in the new worktree before the first test run.

## Base and PR target

Base: `feat/install-pilot-path`, cut from `design/install-pilot-path` at Gate 1 (ticket itm_26df84bdd527), itself on
`origin/pilot` e7c389e4. Every slice PR is a **draft** against `feat/install-pilot-path`, never marked ready; the
pilot merges it. Branch: `slice/install-pilot-path-s<n>`. Write PR bodies with `gh pr create --body-file <file>`.
S1 first; S2 and S3 share no file and run side by side once S1 is integrated.

## PR titles

- Slice: `feat(install-pilot-path): S<n> <title as the artefact words it>`, the first word after `S<n>` lower-case.
- Fix round: `fix(install-pilot-path): <what>`
- Feature PR: `feat(install-pilot-path): the install puts pilot on the PATH permanently`

## Commit trailer

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

## PR footer

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

## Artefact

`docs/design/install-pilot-path/architecture.md`; slice files `docs/design/install-pilot-path/slices/S<n>.md`.
Locked decisions §5 move in no slice; A1, A2 and A4 in §6 stand as assumed. S3 writes ADR 0128 (`pilot` holds
0127 today; if `main` has moved, the pilot renumbers at the base merge, never a slice).

## Where things live

`scripts/install-command.mjs` (`onPath` at ~178 reads the process env: that is what S1 replaces for Windows;
`describe` ~192 emits the notes; `installCommand` ~230 is the entry). Tests: `scripts/test/install-command.test.mjs`
(in-process `installCommand` runs: they must be given an in-memory registry so no test writes the real PATH),
`scripts/test/scripts.test.mjs`, and the INSTALL.md pin at `scripts/test/install.test.mjs:998` (`doesNotMatch
/shell profile/`, S3 amends it). `:line` anchors are from `pilot` at e7c389e4; find by name if moved.

## Tools

`gh` was installed during this run at `C:/Program Files/GitHub CLI/gh.exe`. A shell started before that does not
have it on PATH: if `gh` is not found, call it by that full path. The feature PR is #567.

## Gate command

```
npm ci
npm test
node scripts/adr-index.mjs --check
node scripts/check-references.mjs
```

No typecheck, lint or build step. One file: `node --test <file>`; on Windows use the glob form,
`node --test scripts/test/*.test.mjs`, not a directory. `npm run test:quiet` is the dot reporter.

## Known flaky tests

- `deck/test/usage.test.mjs` "in 2 hrs"
- `deck/test/run.test.mjs` "a session that ends while the wrapper waits for the marker stops the wait" (timing; passes alone)
- `hooks/test/inbox.test.js:471` "a session takes its place on the deck without being told anything" (ECONNRESET under load, once in 10)

## Constraints

- **Never write this machine's real registry or a real profile from a test or a gate run.** Every test injects the
  registry adapter and `home`; the only live run is against a scratch `--prefix`, and S1 removes any scratch entry it
  adds before it reports.
- The directory from `npm prefix -g` is data: it reaches PowerShell as an environment variable (never script text)
  and the POSIX block single-quotes it, refusing `'`, newline or `$` (A4).
- Live verification for S1: `node scripts/install-command.mjs --prefix <scratch-dir>` on this machine, then
  `reg query HKCU\Environment /v Path` read and the entry removed; a new terminal is the user's step at QA.
- Small-diff limit: 300 changed lines per slice (code plus tests); past it, stop and ask `main`.

## Report

A table: slice, branch, PR, head SHA, tests added (failed before, pass after), gate output line, live evidence, friction.
