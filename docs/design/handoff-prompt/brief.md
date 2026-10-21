# Brief: handoff-prompt

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/projects/pilot` (GitHub `HazzardRust/pilot`). Default branch `main`, pilot branch `pilot`. Never
work in that checkout or another session's worktree; create your own beside it, `pilot-handoff-prompt-s<n>`. Run
`npm ci` in the new worktree before the first test run.

## Base and PR target

The base is `feat/handoff-prompt`, cut at Gate 1 from `origin/pilot` (c8365943 at design time). Every slice PR is a
**draft** against `feat/handoff-prompt`, never marked ready. Branch name: `slice/handoff-prompt-s<n>`.

## Remote

Remote: origin

## PR titles

- A slice: `feat(handoff-prompt): S<n> <title as in the artefact, lower-case first>`
- A fix round: `fix(handoff-prompt): <what>`
- The feature PR: `feat(handoff-prompt): The hand-off's first prompt is submitted, every time`

## Commit trailer

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PLSy3oNjHdFSiMkkcniEyc
```

## PR footer

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01PLSy3oNjHdFSiMkkcniEyc
```

## Gate command

```
npm ci
npm test
node scripts/check-references.mjs
node scripts/check-provenance.mjs agents/ skills/ rules/
```

One file: `node --test <file>`. No typecheck, lint or build step. No slice edits `agents/*.md` or `rules/*.md`; if one
must, re-measure `scripts/measure-prompt.mjs` and the rules pin (near-zero headroom) and say so in the PR.

## Known flaky tests

`deck/test/scratch-stop.test.mjs`: the symlink-registry test can fail EEXIST on a shared %TEMP% path; passes on rerun.

## Tests and live verification

Nothing reaches GitHub, the live deck on 4321, or a real remote from a test; deck tests use a stub server on a free
port and a scratch home (`deck/test/run.test.mjs` `scratchHome`, `deckHolding`). Live checks run `pilot run` against
a scratch deck (`pilot deck --scratch`, stopped after) and read `~/.claude/pilot/wrapper.log`.

## Diff limit

300 changed lines per slice. Past that, stop and ask `main`.
