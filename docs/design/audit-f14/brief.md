# Brief: audit-f14

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Default branch `main`, pilot branch `pilot`. Never
work in that shared checkout or in another session's worktree. Create your own beside it, `pilot-audit-f14-s1`,
and run `npm ci` there before the first test.

## Remote

Remote: origin

## Base and PR target

The base is `feat/audit-f14`, cut at Gate 1 from `origin/pilot` (fa28b73b at design time). Branches:
`slice/audit-f14-s<n>`, pushed for the pilot to integrate; no slice PR. The PR target is `pilot`: this run's own
record base is `pilot`, so it is a legacy run (architecture.md A3) and lands with the release PR. The code it builds
changes the shape only for the runs after it.

## PR titles

- A slice: `feat(audit-f14): S<n> <title>`, the title lower-case first, e.g. `feat(audit-f14): S1 six dead exports become private`, `feat(audit-f14): S2 a run is cut from main and its gate1 is accepted`
- A fix round: `fix(audit-f14): <what>`
- The feature PR: `feat(audit-f14): Dead exports go private, and each feature is its own PR to main`

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

https://claude.ai/code/session_01NXgSFppeY5pzVQLciH5swh
```

## Artefact

`docs/design/audit-f14/architecture.md`, slices in `slices/S1.md` to `slices/S9.md`. The run's ADR is `docs/adr/0200-stacked-feature-prs.md` (S9, L10).

## Gate command

```
npm ci
npm test
```

`npm test` runs `node scripts/gate.mjs`, 6-8 minutes, 10 skipped is normal. One file: `node --test <file>`.
`deck/test/facades.test.mjs` caps source files at 800 lines.

## Known flaky tests

None recorded.

## Live verification

The slice's run behaviours in its worktree. CLI surfaces: `node bin/pilot.mjs base`, `node bin/pilot.mjs restack`. The PR
on GitHub is QA's (architecture.md §9); slices use a stub host and temp repositories, never the real origin.

## Diff limit

400 changed lines per slice. Past that, stop and ask `main`.
