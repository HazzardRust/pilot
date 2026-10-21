# Brief: hidden-spawns

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/socce/Projects/pilot` (GitHub `HazzardRust/pilot`), default branch `main`, pilot branch `pilot`. Never
work in that checkout or in another session's worktree: create your own, named `pilot-hidden-spawns-s<n>`,
beside it. Run `npm ci` in the new worktree before the first test run.

## Base and PR target

Base: `feat/hidden-spawns`, cut from `design/hidden-spawns` at Gate 1 (ticket itm_bddbe9c0a3d9), itself on
`origin/pilot` 1a04fe31. Every slice PR is a **draft** against `feat/hidden-spawns`, never marked ready; the pilot
merges it. Branch: `slice/hidden-spawns-s<n>`. Write PR bodies with `gh pr create --body-file <file>`. One slice.

## PR titles

- Slice: `feat(hidden-spawns): S<n> <title as the artefact words it>`, the first word after `S<n>` lower-case.
- Fix round: `fix(hidden-spawns): <what>`
- Feature PR: `feat(hidden-spawns): the pilot's child processes never flash a console`

## Commit trailer

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

## PR footer

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

## Artefact

`docs/design/hidden-spawns/architecture.md`; slice file `docs/design/hidden-spawns/slices/S1.md`. Locked
decisions §5 move in no slice; A1 and A2 in §6 were agreed by the user with the spec (itm_fb4fa5543414). ADR 0155
is written at Gate 1 by the pilot, not by the slice.

## Where things live

The 21 unhidden call sites are listed in the artefact's §3 table (`:line` anchors from `pilot` at 1a04fe31; find by
name if moved). The pattern to match is the one `ecebaa7b` used in `scripts/install-command.mjs` and
`scripts/install-path.mjs`. The install-only scan to fold away is in `scripts/test/install-command.test.mjs`
("every child the install starts has its console hidden"). The one exemption is `deck/run.mjs` `startPlain`
(the user's interactive `claude`, inherited stdio), named in the new test with its reason (L3).

## Tools

`gh` is at `C:/Program Files/GitHub CLI/gh.exe`; a shell started without it on PATH calls it by that full path.

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

- The scan test is the slice's red test: it must fail on `pilot` at 1a04fe31 (21 sites) and pass after. Run it
  before the edits and read the failure list.
- Edit each call in place (L5): add `windowsHide: true` to its options; introduce no shared runner.
- Live verification: from a Claude Code session on this Windows 11 machine run `pilot base`, `pilot tickets`,
  `pilot sync` (dry or against your worktree) and confirm no console window appears; the deck's gate1 path is QA's.
- Small-diff limit: 150 changed lines (code plus tests); past it, stop and ask `main`.

## Report

A table: slice, branch, PR, head SHA, tests added (failed before, pass after), gate output line, live evidence, friction.
