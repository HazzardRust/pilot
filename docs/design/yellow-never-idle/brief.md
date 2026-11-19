# Brief: yellow-never-idle

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Default branch `main`, pilot branch `pilot`. Never
work in that shared checkout (it is on `main`) or in another session's worktree. Create your own beside it,
`pilot-yellow-never-idle-s<n>`, and run `npm ci` there before the first test.

## Remote

Remote: origin

## Base and PR target

The base is `feat/yellow-never-idle`, cut from `design/yellow-never-idle`, itself cut from `origin/feat/never-stuck-2`
(0dede3d9, never-stuck Run 2, concluding `itm_4be94a7ae00a`). A slice is a pushed branch
`slice/yellow-never-idle-s<n>`, integrated by the co-pilot into `feat/yellow-never-idle`; the feature PR targets
`feat/never-stuck-2` while that base stands, else `pilot`, as `pilot base` names it.

## PR titles

- A slice: `feat(yellow-never-idle): S<n> <title as in the artefact, lower-case first>`
- A fix round: `fix(yellow-never-idle): <what>`
- The feature PR: `feat(yellow-never-idle): A built ticket waiting on the user can never stay yellow`

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

`docs/design/yellow-never-idle/architecture.md`, slices in `slices/S<n>.md`. Terms (§4) are fixed; locked decisions
§5 are not moved by a slice. S3 reads S2's `idleYellowOf` and `crewSeenAt` from the integration branch by name. The
run's ADR is `docs/adr/NNNN-yellow-never-idle.md` (S1); the landing numbers it.

## Tests

Nothing reaches GitHub, the live deck on 4321 or a real remote from a test. A deck test takes its own store
(`deck/testUtils.mjs`); a hook test runs against `deckOnAPort` (pattern `hooks/test/stop-gate-yellow-lane.test.js`).
A timer test uses `t.mock.timers` (pattern `deck/test/orphan.test.mjs`).

## Gate command

```
npm ci
npm test
```

`npm test` runs `node scripts/gate.mjs`. One file: `node --test <file>`.

## Known flaky tests

None recorded.

## Live verification

A scratch deck only: `pilot deck --scratch`, then `pilot deck --stop <pid>`, with a temp git repository. QA posts a
walkthrough on a yellow ticket there, runs `node hooks/stop-gate.js` with a Stop payload, and parks a real
`pilot wait` against it.

## Diff limit

400 changed lines per slice. Past that, stop and ask `main`.
