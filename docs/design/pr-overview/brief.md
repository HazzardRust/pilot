# Brief: pr-overview

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/jrylk/Projects/pilot` (GitHub `HazzardRust/pilot`). Default branch `main`, pilot branch `pilot`. Never
work in that shared checkout or in another session's worktree. Create your own beside it,
`pilot-pr-overview-s<n>`, and run `npm ci` there before the first test.

## Remote

Remote: origin

## Base and PR target

The base is `feat/pr-overview`, cut from `design/pr-overview`, itself on `origin/pilot` (86957ec). A slice is a
pushed branch `slice/pr-overview-s<n>`, integrated into `feat/pr-overview`; the feature PR targets `pilot`.

## Live root

C:\Users\jrylk\.claude\pilot\live untrusted

## PR titles

- A slice: `feat(pr-overview): S<n> <title as in the artefact, lower-case first>`
- A fix round: `fix(pr-overview): <what>`
- The feature PR: `feat(pr-overview): Every PR opens with a plain overview`

## Commit trailer

Every commit ends with these two lines, copied exactly:

```
Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NXgSForDWcHA67cB28cNrm
```

## PR footer

Every PR body ends with these lines, copied exactly:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01NXgSForDWcHA67cB28cNrm
```

## Artefact

`docs/design/pr-overview/architecture.md`, slices in `slices/S<n>.md`. Terms (§4) are fixed; locked decisions (§5)
are not moved by a slice. S2 and S3 read S1's `overviewOf`, `overviewProblems` and `crewRoles` from the integration
branch by name. The run's ADR is `docs/adr/0219-pr-overview.md` (S3); the landing numbers it.

## Tests

Nothing reaches GitHub, the live deck on 4321 or a real remote from a test: a host is a fake object, git a seeded
temp repository (pattern `scripts/test/feature-pr.test.mjs`, `scripts/test/release.test.mjs`).

## Gate command

```
npm ci
npm test
```

Where the default reporter dies with no summary, `npm run test:quiet`. One file: `node --test <file>`.

## Known flaky tests

- `deck/test/idle-wake.test.mjs` "a parked wait wakes".
- Windows CI only: "sed -i on a tracked file is refused".

## Overlap

project-glossary (#133) edits `agents/pilot.md`, `agents/pilot-architect.md` and the prompt pins; S3 merges
`origin/pilot` before it edits them and measures the pins after.

## Diff limit

400 changed lines per slice. Past that, stop and ask `main`.
