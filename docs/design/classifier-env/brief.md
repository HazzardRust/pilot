# Brief: classifier-env

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/jrylk/Projects/pilot` (GitHub `HazzardRust/pilot`). Default branch `main`. Never work in that shared
checkout (it is far behind) or in another session's worktree. Create your own beside it,
`pilot-classifier-env-s<n>`, and run `npm ci` there before the first test.

## Remote

Remote: origin

## Base and PR target

The base is `feat/classifier-env`, cut at Gate 1 from `design/classifier-env` (itself from `origin/main` at
`ffc8384`). Branches: `slice/classifier-env-s<n>`, pushed for the pilot to integrate; no slice PR. The feature PR's
target is `main`, as `pilot base` prints.

## PR titles

- A slice: `feat(classifier-env): S<n> <title>`, the title lower-case first, e.g. `feat(classifier-env): S1 walking skeleton: a Start writes the pilot lines into start-settings.json, with an off switch`
- A fix round: `fix(classifier-env): <what>`
- The feature PR: `feat(classifier-env): Pilot sessions tell the auto-mode classifier about the pilot's environment`

## Commit trailer

Every commit ends with these two lines, copied exactly:

```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NXgSFrR7Ee9f1oe7sWUsEs
```

## PR footer

Every PR body ends with these lines, copied exactly:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01NXgSFrR7Ee9f1oe7sWUsEs
```

## Live root

C:\Users\jrylk\.claude\pilot\live untrusted

## Artefact

`docs/design/classifier-env/architecture.md`, slices in `slices/S1.md` to `slices/S3.md`. The run's ADR is
`docs/adr/NNNN-classifier-env.md` (S1); the landing numbers it.

## Environment

Claude Code 2.1.331 on Windows 11. Tests use a scratch home and pass `env` explicitly: never write the real
`~/.claude/pilot/start-settings.json` or read the real `~/.claude/settings.json` in a test. S1's `run` behaviour
uses a scratch settings file with `claude --settings <file> auto-mode config`.

## Gate command

```
npm ci
npm test
```

`npm test` runs `node scripts/gate.mjs`. One file: `node --test <file>`.

## Known flaky tests

None recorded. The live deck on 4321 stalls when two full suites run at once: run one `npm test` at a time.

## Diff limit

400 changed lines per slice. Past that, stop and ask `main`.
