# Brief: tickets-add-button

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/socce/Projects/pilot` (GitHub `HazzardRust/pilot`), default branch `main`, pilot branch `pilot`. Never
work in that checkout or in another session's worktree: create your own, named `pilot-tickets-add-button-s<n>`,
beside it. Run `npm ci` in the new worktree before the first test run.

## Base and PR target

Base: `feat/tickets-add-button`, cut from `design/tickets-add-button` at Gate 1 (ticket itm_28891dcb8357), itself on
`origin/pilot` e7c389e4. Every slice PR is a **draft** against `feat/tickets-add-button`, never marked ready; the
pilot merges it. Branch: `slice/tickets-add-button-s<n>`. Write PR bodies with `gh pr create --body-file <file>`.
One slice.

## PR titles

- Slice: `feat(tickets-add-button): S<n> <title as the artefact words it>`, the first word after `S<n>` lower-case.
- Fix round: `fix(tickets-add-button): <what>`
- Feature PR: `feat(tickets-add-button): the Tickets panel's Add button sits on the title row`

## Commit trailer

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

## PR footer

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

## Artefact

`docs/design/tickets-add-button/architecture.md`; slice file `docs/design/tickets-add-button/slices/S1.md`.
Locked decisions §5 (L1 to L7) move in no slice; A2 and A3 in §6 stand as assumed. No ADR: a CSS layout change
is not a structural decision.

## Where things live

`deck/ui/deck.css`: `.panel::before` (~990) draws the title; the dead `.panel > form.make-tickets` gap rule (~1075).
`deck/render-rail.mjs` ~510 renders `<div class="tickets-state">` with the Add form first. Pins:
`deck/test/tabs.test.mjs:905` (`.panel::before`), `deck/test/deck-state.test.mjs:144` (region starts with
`<div class="tickets-state"`), `deck/test/make-tickets.test.mjs` and `deck/test/standing.test.mjs:150-155` (Add opens
the thread). `:line` anchors are from `pilot` at e7c389e4; find by name if moved.

## Tools

`gh` is at `C:/Program Files/GitHub CLI/gh.exe`; a shell started before it was installed does not have it on PATH,
so call it by the full path when `gh` is not found.

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
- `hooks/test/inbox.test.js:471` "a session takes its place on the deck without being told anything" (ECONNRESET under load, once in 10)

## Constraints

- Live verification is required: the slice has a surface. Start a scratch deck (`pilot deck --scratch --port <spare>`,
  set `PILOT_DECK_NO_START=1`; never the deck on 4321, never `~/.claude/pilot`), open a repository tab's Tickets panel
  and look at it at 12rem and at default width, with tickets and with none; drive your own headless Chrome over CDP if
  the DevTools MCP browser is held. Attach the screenshots to the PR.
- Markup unchanged (L1); scoped to `#tickets > .panel` (L2).
- Small-diff limit: 150 changed lines (code plus tests); past it, stop and ask `main`.

## Report

A table: slice, branch, PR, head SHA, tests added (failed before, pass after), gate output line, live evidence, friction.
