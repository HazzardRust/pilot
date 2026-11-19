# Brief: handoff-cache

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Default branch `main`, pilot branch `pilot`. Never
work in that shared checkout or in another session's worktree. Create your own beside it, `pilot-handoff-cache-s1`,
and run `npm ci` there before the first test.

## Remote

Remote: origin

## Base and PR target

The base is `feat/handoff-cache`, cut at Gate 1 from `origin/pilot` (fa28b73b at design time). Branches:
`slice/handoff-cache-s<n>`, pushed for the pilot to integrate; no slice PR. The PR target is `pilot`.

## PR titles

- A slice: `feat(handoff-cache): S<n> <title>`, the title lower-case first, e.g. `feat(handoff-cache): S1 the first turn after a hand-off prints beside a cold start's`, `feat(handoff-cache): S10 pilot update updates from the terminal`
- A fix round: `fix(handoff-cache): <what>`
- The feature PR: `feat(handoff-cache): The hand-off keeps the cache, and plain claude stays plain`

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

`docs/design/handoff-cache/architecture.md`, slices in `slices/S1.md` to `slices/S11.md`. The run's ADR is
`docs/adr/NNNN-handoff-cache.md` (S11).

## Gate command

```
npm ci
npm test
```

`npm test` runs `node scripts/gate.mjs`, 6-8 minutes, 10 skipped is normal. One file: `node --test <file>`.
`deck/test/facades.test.mjs` caps source files at 800 lines.

## Known flaky tests

None recorded.

## Probes

Probe slices (S2, S4, S5) and the build slices' reruns start scratch headless sessions with `claude -p --plugin-dir
<probe> --model sonnet` in a temp repository, never the user's live session and never the real `~/.claude` config
(architecture.md §5 L3, §6 A5, §9). Claude Code is 2.1.328; record the version in every probe file. The mods docs
page 404s: `docs/design/handoff-mod/architecture.md` §3 and the binary's strings are the reference.

## Live verification

The slice's run behaviours in its worktree; CLI surfaces `node scripts/audit-session-start.mjs <repo> --first-turn`
and `node bin/pilot.mjs update`, against a temp config dir. The hand-off with a live crew agent is QA's (§9).

## Diff limit

400 changed lines per slice. Past that, stop and ask `main`.
