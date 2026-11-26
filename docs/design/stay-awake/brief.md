# Brief: stay-awake

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/jrylk/Projects/pilot` (GitHub `HazzardRust/pilot`). Default branch `main`, pilot branch `pilot`. Never
work in that shared checkout or in another session's worktree. Create your own beside it,
`pilot-stay-awake-s<n>`, and run `npm ci` there before the first test.

## Remote

Remote: origin

## Base and PR target

The base is `feat/stay-awake`, cut at Gate 1 from the design tip on `origin/pilot` (86957ec). Branches:
`slice/stay-awake-s<n>`, pushed for the pilot to integrate; no slice PR. The PR target is `pilot`.

## Live root

C:\Users\jrylk\.claude\pilot\live untrusted

## PR titles

- A slice: `feat(stay-awake): S<n> <title>`, the title lower-case first, e.g. `feat(stay-awake): S1 the user's deck holds a Windows keep-awake request while an agent runs`
- A fix round: `fix(stay-awake): <what>`
- The feature PR: `feat(stay-awake): the machine stays awake while any agent runs`

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

`docs/design/stay-awake/architecture.md`, slices in `slices/S1.md` to `slices/S3.md`. The run's ADR is
`docs/adr/0215-stay-awake.md` (S1); the landing numbers it.

## Gate command

```
npm ci
npm test
```

`npm test` runs `node scripts/gate.mjs`. One file: `node --test <file>`. Run the full `npm test` once, on the
slice's final state. The repo has no typecheck, lint or build script.

- `deck/test/facades.test.mjs` caps deck source files at 800 lines; `deck/doctor.mjs` is at 582.
- `scripts/test/platform-reads.test.mjs` allows `process.platform` only in `hooks/lib/platform.js`: use `hostPlatform()`.
- `SPAWN_CEILING` (`scripts/gate.mjs`) is raised only by the rule in that file's comment; print the gate's spawn count.
- The census fails a gate that leaves a pilot-owned process running: a test that starts a real holder stops it.
- macOS and Linux CI run on `gate.yml` only for schedule, dispatch, a public PR or the `all-os` label.

## Known flaky tests

Copied from `docs/design/crew-handoff-trace/brief.md` on origin/pilot:

- `deck/test/idle-wake.test.mjs` "a parked wait wakes": red after 10:20 UTC until ci-green lands.
- Windows-CI only: "sed -i on a tracked file is refused".

## Diff limit

400 changed lines per slice. Past that, stop and ask `main`.
