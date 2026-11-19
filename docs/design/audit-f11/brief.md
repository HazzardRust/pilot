# Brief: audit-f11

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Default branch `main`, pilot branch `pilot`. Never
work in that shared checkout or in another session's worktree. Create your own beside it, `pilot-audit-f11-s1`,
and run `npm ci` there before the first test.

## Remote

Remote: origin

## Base and PR target

The base is `feat/audit-f11`, cut at Gate 1 from `origin/pilot` (655a49d8 at design time). Branch:
`slice/audit-f11-s1`, pushed for the pilot to integrate; no slice PR.

## PR titles

- A slice: `feat(audit-f11): S1 fixture git prints no CRLF warning`
- A fix round: `fix(audit-f11): <what>`
- The feature PR: `feat(audit-f11): Fixture git stops printing CRLF warnings`

## Commit trailer

Every commit ends with these two lines, copied exactly:

```
Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NXgSFppeY5pzVQLciH5swh
```

## PR footer

Every PR body ends with these lines, copied exactly:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01NXgSFodNbTKqoJ71EpWMS5
```

## Artefact

`docs/design/audit-f11/architecture.md`, slice in `slices/S1.md`. The run's ADR is `docs/adr/NNNN-audit-f11.md`;
the landing numbers it.

## Gate command

```
npm ci
npm test
```

`npm test` runs `node scripts/gate.mjs`. One file: `node --test <file>`.

## Known flaky tests

None recorded.

## Live verification

A CLI run of the gate in a scratch clone on this Windows machine, architecture.md §9 steps 1-4.

## Diff limit

100 changed lines. Past that, stop and ask `main`.
