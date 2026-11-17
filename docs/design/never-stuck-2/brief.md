# Brief: never-stuck-2 (Run B of never-stuck)

The facts every implementer of this run shares. Read this first, then your slice file under
`docs/design/never-stuck/slices/`.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Default branch `main`, pilot branch `pilot`. Never
work in that shared checkout (it is on `main`) or in another session's worktree. Create your own beside it,
`pilot-never-stuck-2-s<n>`, and run `npm ci` there before the first test.

## Remote

Remote: origin

## Base and PR target

The base is `feat/never-stuck-2`, cut from `origin/pilot` only once Run A (`feat/never-stuck`, S1-S6) has landed
there (artefact §6 A5, §8). Slice branch: `slice/never-stuck-2-s<n>`, pushed; the pilot integrates it into
`feat/never-stuck-2` as one commit. The feature PR targets `pilot`; the deck opens it as a draft.

## PR titles

- A slice: `feat(never-stuck-2): S<n> <title as in the artefact, lower-case first>`
- A fix round: `fix(never-stuck-2): <what>`
- The feature PR: `feat(never-stuck-2): A run never stops silently across a hand-off`

## Commit trailer

Every commit ends with these two lines, copied exactly:

```
Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NXgSFpzgnD51HokpbABUPw
```

## PR footer

Every PR body ends with these lines, copied exactly:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01NXgSFpzgnD51HokpbABUPw
```

## Artefact

`docs/design/never-stuck/architecture.md` (Run B: S7-S19, spec 1, 2, 4, 5, 7-12, 16-27). Terms (§4) are fixed;
locked decisions §5 are not moved by a slice. A later slice reads an earlier slice's seam from the integration
branch by name. The run's ADR is `docs/adr/NNNN-never-stuck.md` (Run A's S6); the landing numbers it.

## Tests

Nothing reaches GitHub, the live deck on 4321 or a real remote from a test. A repository test makes a real temp git
repository with a bare remote (pattern `deck/test/gate1-lineage.test.mjs`) and removes it in teardown. A timer test
uses `t.mock.timers` (pattern `deck/test/orphan.test.mjs`). A process test uses a stub child script. Slice files in
the old `## Tests` shape stay valid for this run (spec-first L5).

## Gate command

```
npm ci
npm test
```

`npm test` runs `node scripts/gate.mjs`, 5-9 minutes: run it in the background. One file: `node --test <file>`.
Prompt pins: `node scripts/measure-prompt.mjs`.

## Known flaky tests

None recorded.

## Live verification

A scratch deck only: `pilot deck --scratch`, then `pilot deck --stop <pid>` (§5 L11, §6 A8). A browser look for
S12's card and line 27's held card; a real `pilot wait` against the scratch deck for S13; `pilot handoff` against
it with a co-pilot granted for S19; `pilot live-root` on this machine for S17.

## Overlaps

handoff-books edits `hooks/context-size-guard.js` and `agents/pilot.md` (pilot's prompt share 11842.75 of 11871).
spec-first rewrites slice-file shape and every crew definition. blocked-steps edits five agent definitions. The
prose slices start only once those are on `origin/pilot`. Merge `origin/pilot` in; never rebase a pushed branch.

## Diff limit

400 changed lines per slice. Past that, stop and ask `main`.
