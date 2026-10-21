# Brief: prose-concision

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`), default branch `main`, pilot branch `pilot`. Never
work in that checkout or in another session's worktree: create your own, `pilot-prose-concision-s<n>`, beside it,
and run `npm ci` there before the first test run.

## Base and PR target

Base: `feat/prose-concision`, cut from `design/prose-concision` at Gate 1 (ticket itm_fd48aa7c2506), itself on
`origin/pilot` 2a1df936. Every slice PR is a **draft** against `feat/prose-concision`, never marked ready. Branch:
`slice/prose-concision-s<n>`. The feature PR targets `pilot`.

## Remote

Remote: origin

## Gate command

`npm test` (`node scripts/gate.mjs`), 4-6 minutes: run it in the background, past a 600 s tool timeout.

## Known flaky tests

- `deck/test/daemon-lifecycle.test.mjs:110` "a 500 writes the same one line" (2 !== 1); a rerun passes.

## Commit trailer

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01N5gq1NsTqzrTzohHn4TGwx
```

## PR footer

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
https://claude.ai/code/session_01N5gq1NsTqzrTzohHn4TGwx
```

## PR titles

- Slice: `feat(prose-concision): S<n> <title>`, the title lower-case first, e.g. `feat(prose-concision): S1 every user-facing voice trades grammatical accuracy for conciseness`
- Fix round: `fix(prose-concision): <what>`
- Feature PR: `feat(prose-concision): user-facing prose trades grammatical accuracy for concision`

## Artefact

`docs/design/prose-concision/architecture.md`; slice files `slices/S<n>.md`. ADR number 0160 (0158 is
main-never-red's, 0159 deck-token's); a collision at the base merge is renumbered by the pilot, never by a slice.
Budget pins: `scripts/test/measure-prompt.test.mjs` (pilot ~174, explorer ~186), `scripts/test/qa-preview.test.mjs`
~156; headroom today is 0-4 tokens, so each moves to the measured number with a history line.
