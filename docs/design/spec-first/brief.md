# spec-first: the implementer's brief

## Repository

C:/Users/Hazzard/Projects/pilot (GitHub HazzardRust/pilot). Never work in the shared checkout; it is on `main`.

## Base and PR target

Base `feat/spec-first`, cut from `pilot` at a3b7d463 plus this design. Slices integrate into
`feat/spec-first`; the feature PR targets `pilot`.

## Remote

Remote: origin

## Gate command

`npm run test:changed -- --since=origin/feat/spec-first` (the selection), run with `run_in_background`:
the full gate runs over 5 minutes (317 s). The full suite runs once, at `pilot land`. Prompt slices
also run `node scripts/measure-prompt.mjs` and `node scripts/check-references.mjs`.

## Known flaky tests

None named.

## Commit trailer

```
Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NXgSFpzgnD51HokpbABUPw
```

## PR footer

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01NXgSFpzgnD51HokpbABUPw
```

## PR titles

- Slice: `feat(spec-first): S<n> <title>`, the title lower-case first
- Fix round: `fix(spec-first): <what>`
- Feature: `feat(spec-first): the crew builds from the spec, not test-first`

## Overlap

handoff-books, blocked-steps and never-stuck edit the same definitions and land first. Read your
agent's pin and headroom off `measure-prompt` on your own rebased base, never off the artefact.
