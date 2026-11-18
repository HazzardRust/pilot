# blocked-steps: shared brief

The facts every implementer of this run shares. The design is `architecture.md`; each slice is `slices/S<n>.md`.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`).

## Base and PR target

Base `feat/blocked-steps`, cut from `pilot`. A slice PR targets `feat/blocked-steps` and stays a draft; the feature PR targets `pilot`.

## Remote

Remote: origin

## Gate command

`npm test` (runs `node scripts/gate.mjs`), once, on the final state of the slice.

The referee is the PR's Gate workflow on GitHub Actions. `.github/workflows/gate.yml:26` skips a draft PR into `feat/**`, so a slice PR gets no CI run: the slice's own `npm test` result is its gate evidence. The feature PR into `pilot` runs the workflow, drafts included.

## Known flaky tests

None recorded.

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

## PR titles

- Slice: `feat(blocked-steps): S<n> <title>`, the title lower-case first (e.g. `feat(blocked-steps): S1 walking skeleton: a no-verdict whose reissue runs leaves no thread`).
- Fix round: `fix(blocked-steps): <what>`.
- Feature: `feat(blocked-steps): fewer blocked steps for the user`.

## Ordering notes

- S9 starts only once handoff-mod (`itm_97c9e8fdf1d2`) is on `pilot` (A7); re-read `hooks/context-size-guard.js` on that tip before cutting.
- Every fold (S5-S8) is a verbatim move with re-exports, at most 200 changed lines.
