# Brief: handoff-mod

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Default branch `main`, pilot branch `pilot`. Never
work in that checkout or another session's worktree; create your own beside it, `pilot-handoff-mod-s<n>`. Run
`npm ci` in the new worktree before the first test run.

## Base and PR target

The base is `feat/handoff-mod`, cut at Gate 1 from `origin/pilot` (bc75cc5b at the L15-L16 re-cut). Every slice PR is a
**draft** against `feat/handoff-mod`, never marked ready. Branch name: `slice/handoff-mod-s<n>`.

## Remote

Remote: origin

## PR titles

- A slice: `feat(handoff-mod): S<n> <title as in the artefact, lower-case first>`
- A fix round: `fix(handoff-mod): <what>`
- The feature PR: `feat(handoff-mod): the hand-off runs from a mod, and pilot run is gone`

## Commit trailer

```
Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NXgSFodNbTKqoJ71EpWMS5
```

## PR footer

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01NXgSFodNbTKqoJ71EpWMS5
```

## Gate command

```
npm ci
npm test
```

`npm test` once on Windows (about 9 minutes). One file: `node --test <file>`. GitHub Actions on this account is
refused for billing, so a red or unstarted check is not evidence. The referee is `npm test` once on Windows and
`node scripts/gate.mjs` five times in WSL on a fresh clone at the commit under test, finished before any gate2 is
posted. Only S11 edits `agents/*.md`; the pilot prompt own-share pin is 11871 (bc75cc5b) and is never raised (ADR 0180). No test asserts a phrase in
prose; a test that greps code for an absence is a structural lint and carries `// lint: <rule>` (ADR 0180).

## Known flaky tests

None recorded.

## Mods

Claude Code 2.1.325 is installed. A mod is `hooks/hooks.json` `"modules"` → a module exporting `register(on)`; it
may import its own files by relative path and `claude-code` only (no `node:*`). `claude plugin validate .` checks it;
`--debug-file <log>` shows each `$` call. Probes live outside the repository.

## Tests and live verification

Nothing reaches GitHub, the live deck on 4321, or a real remote from a test; deck tests use a stub server on a free
port and a scratch home (`deck/test/run.test.mjs`'s helpers). Live checks use a scratch deck (`pilot deck
--scratch`, stopped after) and read `~/.claude/pilot/wrapper.log`.

## Diff limit

400 changed lines per slice (S7 excepted by A3). Past that, stop and ask `main`.
