# Brief: project-glossary

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Default branch `main`, pilot branch `pilot`. Never
work in that shared checkout or in another session's worktree. Create your own beside it, `pilot-project-glossary-s<n>`,
and run `npm ci` there before the first test.

## Remote

Remote: origin

## Base and PR target

The base is `feat/project-glossary`, cut at Gate 1 from `origin/pilot` (d282a698 at design time). Branches:
`slice/project-glossary-s<n>`, pushed for the pilot to integrate; no slice PR. The feature PR's target is `pilot`.

## PR titles

- A slice: `feat(project-glossary): S<n> <title>`, the title lower-case first, e.g. `feat(project-glossary): S1 walking skeleton: GLOSSARY.md passes glossary.mjs check in the gate`
- A fix round: `fix(project-glossary): <what>`
- The feature PR: `feat(project-glossary): One project glossary the crew maintains`

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

`docs/design/project-glossary/architecture.md`, slices in `slices/S1.md` to `slices/S7.md`. The run's ADR is
`docs/adr/0209-project-glossary.md` (S3, L1, L11).

## Gate command

```
npm ci
npm test
```

`npm test` runs `node scripts/gate.mjs`, which picks up every `scripts/test/*.test.mjs`. One file: `node --test <file>`.

## Known flaky tests

From `docs/design/ci-gate/brief.md` on `origin/pilot`; ci-green fixed both on `pilot`, so a failure now is real:

- `deck/test/idle-wake.test.mjs` "a parked wait wakes".
- Windows-CI only: "sed -i on a tracked file is refused".

## Overlaps

ci-gate landed on `pilot` (d282a698) with a `### CI checks` glossary group: S1 rewrites its path entry with the
other 6. rune-deck-ui (implementing) and nothing-hidden (queued) touch none of this run's files at design time; if
one lands first on a file you own, rebase on `pilot`, never edit around its hunks. `GLOSSARY.md` and
`GLOSSARY-LOG.md` are edited by every later run: S6's `append` keeps log edits to one row each.

## Diff limit

400 changed lines per slice. Past that, stop and ask `main`.
