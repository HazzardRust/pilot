# Brief: held-handoff

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`), default branch `main`, pilot branch `pilot`.
Never work in that checkout or in another session's worktree. Create your own worktree beside it, named
`pilot-held-handoff-s<n>`, with `git -c core.longpaths=true worktree add`, and run `npm ci` in it before
the first test run.

## Base and PR target

Base: `feat/held-handoff`, cut from `design/held-handoff` at Gate 1, which sits on `origin/pilot` at
`fe4969ee`. Every slice PR is a draft against `feat/held-handoff` and is never marked ready. Branch:
`slice/held-handoff-s<n>`. Write PR bodies with `gh pr create --body-file <file>`.

## Remote

Remote: origin

## Artefact

`docs/design/held-handoff/architecture.md`, with slice files at `docs/design/held-handoff/slices/S<n>.md`.
The locked decisions are §5 (L1-L8) and the settled assumed decision is §6 A1; no slice moves any of
them. The ADR this feature amends is `docs/adr/0089`, in S3, and no slice adds a new ADR. "hold" is the
item field `hold: { ticket, at, rearmedAt? }`. It is not the stop gate's "held" marker
(`hooks/test/held-handoff.test.js`).

## Gate command

```
npm ci
npm test
node scripts/check-references.mjs
node scripts/check-provenance.mjs agents/ skills/ rules/
```

## Known flaky tests

- `deck/test/daemon-lifecycle.test.mjs` "a 500 writes the same one line, then its stack, and the deck serves on"

## Small-diff limit

150 changed lines per slice. Past that, stop and ask `main`.

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

- Slice: `feat(held-handoff): S<n> <title>`, the title lower-case first
- Fix round: `fix(held-handoff): <what>`
- Feature: `feat(held-handoff): a held hand-off is bounded, visible, and the press re-arms it`
