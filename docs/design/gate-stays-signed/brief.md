# Brief: gate-stays-signed

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`), default branch `main`, pilot branch `pilot`. Never
work in that checkout or in another session's worktree: create your own, named `pilot-gate-stays-signed-s<n>`,
beside it. Run `npm ci` in the new worktree before the first test run.

## Base and PR target

Base: `feat/gate-stays-signed`, cut from `design/gate-stays-signed` at Gate 1 (ticket itm_c7e30555448b, the gate1 on the artefact commit that follows, itself on
`origin/pilot` 023185b9). Every slice PR is a **draft** against `feat/gate-stays-signed`, never marked ready; the pilot
merges it. Branch: `slice/gate-stays-signed-s<n>`. Write PR bodies with `gh pr create --body-file <file>`. Slices run in
order, S1 then S2 (S2 stands on S1's `chosenOf`).

## PR titles

- Slice: `feat(gate-stays-signed): S<n> <title as the artefact words it>`, the first word after `S<n>` lower-case.
- Fix round: `fix(gate-stays-signed): <what>`
- Feature PR: `feat(gate-stays-signed): a signed gate stays signed`

## Commit trailer

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014NzGDsFAKbgZCKm3yKrMDh
```

## PR footer

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_014NzGDsFAKbgZCKm3yKrMDh
```

## Artefact

`docs/design/gate-stays-signed/architecture.md`; slice files `docs/design/gate-stays-signed/slices/S<n>.md`.
Locked decisions §5 (L1 to L5) move in no slice. ADR `docs/adr/0114-a-gate-reads-its-newest-press.md` is written;
no slice adds another.

## Where things live

`deck/ui/render.mjs` is a facade of re-exports; the HTML is in its `render-*.mjs` siblings (ADR 0113). S2's
`renderReplyForm` and `renderChoices` are in `deck/ui/render-parts.mjs`. `:line` anchors in the artefact are from
`pilot` at 023185b9; find by name if one has moved.

## Gate command

```
npm ci
npm test
node scripts/adr-index.mjs --check
node scripts/check-references.mjs
```

No typecheck, lint or build step. One file: `node --test <file>`; on Windows use the glob form,
`node --test deck/test/*.test.mjs`, not a directory. `npm run test:quiet` is the dot reporter.

## Known flaky tests

- `deck/test/usage.test.mjs` "in 2 hrs"
- `deck/test/run.test.mjs` "a session that ends while the wrapper waits for the marker stops the wait" (timing; passes alone)

## Constraints

- Prompt budget pins (`scripts/test/measure-prompt.test.mjs`, `qa-preview.test.mjs`) are the user's and never move.
- `deck/test/gate-resolve.test.mjs`, `press-refused.test.mjs`, `red-grilling.test.mjs`, `card-history.test.mjs` and
  `lesson.test.mjs` stay green and unchanged (spec 5).
- A typed "Sign off" and a pressed one stay byte-identical (`replyFrom`); no new stored field on an item (L1).
- Live verification, every slice: a scratch deck started with `pilot deck --scratch --port <spare>` (set
  `PILOT_DECK_NO_START=1`), pressed in a real browser; never the deck on 4321, never `~/.claude/pilot`. To seed a gate,
  write through the store module with `PILOT_DECK_DIR` pointing at the scratch deck's directory, because `deck_post`
  refuses a gate without its preconditions.
- Small-diff limit: 200 changed lines per slice; past it, stop and ask `main`.

## Report

A table: slice, branch, PR, head SHA, tests added (failed before, pass after), gate output line, live evidence.
