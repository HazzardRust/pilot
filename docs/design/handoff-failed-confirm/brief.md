# Brief: handoff-failed-confirm

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`), default branch `main`, pilot branch `pilot`. Never
work in that checkout or in another session's worktree: create your own, named `pilot-handoff-failed-confirm-s<n>`,
beside it. Run `npm ci` in the new worktree before the first test run.

## Base and PR target

Base: `feat/handoff-failed-confirm`, cut from `design/handoff-failed-confirm` at Gate 1 (itm_83bf853b002e, 4687d59c,
itself on `origin/pilot` 2654786). Every slice PR is a **draft** against `feat/handoff-failed-confirm`, never marked
ready; the pilot merges it. Branch: `slice/handoff-failed-confirm-s<n>`. Write PR bodies with
`gh pr create --body-file <file>`. Slices run in order, S1 to S6 (L6): each owns `deck/ui/render.mjs`.

## PR titles

- Slice: `feat(handoff-failed-confirm): S<n> <title as the artefact words it>`, the first word after `S<n>` lower-case.
- Fix round: `fix(handoff-failed-confirm): <what>`
- Feature PR: `feat(handoff-failed-confirm): confirm in place, and no press reloads`

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

`docs/design/handoff-failed-confirm/architecture.md`; slice files `docs/design/handoff-failed-confirm/slices/S<n>.md`.
Locked decisions §5 (L1 to L10) move in no slice. No new ADR (L7): S5 amends the consequences of
`docs/adr/0016-the-page-updates-in-place-and-never-reloads.md` only.

## render.mjs after the split (seam note, co-pilot, 2026-10-10)

Merging `pilot` into `feat/handoff-failed-confirm` (bd9917b3) brought in audit-f1-f7 S18 (PR #461): `deck/ui/render.mjs` is
now a facade of re-exports, and the HTML is written in its `render-*.mjs` siblings. Where a slice file says
`deck/ui/render.mjs`, it owns whichever sibling holds the named function or form. Its `:line` anchors are from before the
split, so find by name. Where each one lives at bd9917b3:

- `deck/ui/render-parts.mjs`: `ASK_FIRST`, `renderChoiceRow`, `renderChoices`, `renderWalkthroughChoices`, `renderCloseConfirm`, Reopen, `renderDismissForm` (thread-page Dismiss), Close
- `deck/ui/render-cards.mjs`: `renderDismiss` (dismiss a run), the choices and `/reply` of a handoff card
- `deck/ui/render-rail.mjs`: Continue, Switch and Switch cancel, Create on a Tickets row, `renderClosedNotice`
- `deck/ui/render-strip.mjs`: Add deck, Weekly alerts, Create, Remove deck, `renderSessionForm` (Start/End)
- `deck/ui/render-pages.mjs`: the page shells

The slices still form one lane and run S1 to S6 in order. Other `:line` anchors (js, css, server) may also have moved,
so find those by name too.

## Seams S1 left (co-pilot, 2026-10-10)

- On Tickets, the `[data-confirm-row]` is the row's `.controls` span, not the `li`: tests outside the slices pin the `li`'s
  attributes, and `.tickets-list li:has(> [data-confirming])` blanks the rest of the row. S1.md's Interface reads "a Tickets
  li"; the contract (row, trigger, `.step.sure`) is unchanged. Put the row attribute on a child where tests pin the parent.
- L4 holds because `confirm.mjs`'s submit and Escape listeners are **capturing**: `page.mjs` installs `reply.mjs` first.
  A new trigger relies on that capture; never move those listeners to bubbling.
- Revert resets nothing (no `form.reset()`), so a reply typed beside a trigger survives.
- Every sandbox test of a thread-page confirm loads `escape.mjs` too, in `page.mjs`'s order, as
  `deck/test/handoff-confirm.test.mjs` does; its small element tree there is the one to reuse, not a second copy.

## Seams S2 left (co-pilot, 2026-10-10)

- Several triggers in one visual row: each gets its own `<div data-confirm-row>` with one `.step.sure`, nested in the
  shared container (`.choices`). `confirm.mjs` confirms the first `.step.sure` in a row, so options that share a row would
  all post the first one's value. Idle nested rows are `display: contents`; the siblings hide while one confirms.
- A row locked as already sent disables its Confirm with its trigger (`landing-guard.test.mjs`).
- The sandbox is `deck/test/confirm-sandbox.mjs`; import it. Cut the markup to the form with `formIn` first: a whole page
  takes about a minute to parse, and one form about 20 ms.
- Each trigger adds a second submit button to its form, so test helpers that count buttons by regex (`name="choice"`
  and the like) need to skip the Confirm. Run the full suite to find them; slice files do not list them.
- To seed a gate on a scratch deck, write through the store module with `PILOT_DECK_DIR` pointing at the scratch deck's
  directory, because `deck_post` refuses a gate without its preconditions.

## Seams S3 left (co-pilot, 2026-10-10)

- Page modules are installed in `deck/ui/js/page.mjs`, not `deck.mjs`. Where a slice file says "`deck.mjs` installs" a
  module, it means the install list in `page.mjs`, and `deck/test/live.test.mjs` names those modules.
- `dismiss.mjs` is gone. `form.confirm` with its `.cancel` now belongs to Create alone (A1). Remove, Start and End are
  seam triggers.
- Every Confirm button reads **Confirm** (artefact §2), and the sentences carry the meaning.
- The sandbox's `press` follows a button's `form` attribute, so a button that posts a separate form is pressed through it.

## Seams S4 left (co-pilot, 2026-10-10)

- `deck/ui/js/inplace.mjs` is installed in `page.mjs`, right after `reply.mjs`, and listens in the bubbling phase. It skips a
  submit that is already `defaultPrevented`. It blurs the submitter before the fetch and reads a 303 under
  `redirect: 'manual'` as taken. On a refusal or a dropped fetch it posts the form for real (the `resend` rule from `reply.mjs`).
- Test fakes carry only some DOM methods. Read attributes with `getAttribute(...) === null`, not `hasAttribute`.
- `confirm-sandbox.mjs` exports `aDocument`; use it for a fetch that answers.
- Known gaps S5 closes, because S5 opts in the first forms where a double post or a stray field costs something:
  1. Fields: `inplace.mjs` sends every `input[name]` and `textarea[name]`, including disabled ones and unchecked
     checkboxes and radios, and skips `select`. Send what a browser's native post sends, for every form S5 opts in.
  2. Double press: a second submit while the first fetch is in flight sends twice. Ignore a submit from a form whose fetch
     is still in flight.

## Seams S5 left (co-pilot, 2026-10-10)

- **Refusals.** `landRefusal` (`deck/server-wait.mjs`) rethrows a `DeckRefusal` as a 400 when `sec-fetch-dest === 'empty'`
  (a page's fetch). A navigation, Node fetch and curl still get the 303 to `?sessionRefused=`, and `inplace.mjs` then posts
  for real so the reason lands. Before S6 opts a route in, check how each of Create, Add deck and Remove deck answers a
  refusal: a `move` fetch follows redirects, so it must land where the reason is shown.
- **Redraws.** A press in place is redrawn only if its route calls `announceChange()`. S5 added it to `/alerts`,
  `/start-session` and `/end-session`. Check S6's routes for it too.
- **inplace.mjs.** It now sends what a native post sends, and ignores a submit while its form's fetch is in flight.
- **Typed reply.** It goes through `reply.mjs`'s own path, which has its own in-flight guard (`sending`). The opt-in is
  `data-in-place` on the thread's reply form.
- **Live checks.** `pilot deck --scratch` has no switch for Start: set `PILOT_DECK_NO_START=1`, or Start opens a real
  `pilot run` window. Never run `pilot deck` with an unknown flag: it reaches the deck on 4321.

## Gate command

```
npm ci
npm test
node scripts/adr-index.mjs --check
node scripts/check-references.mjs
```

No typecheck, lint or build step. One file: `node --test <file>`; on Windows use the glob form,
`node --test deck/test/*.test.mjs`, not a directory. `npm run test:quiet` is the dot reporter once audit-f1-f7 lands.

## Known flaky tests

- `deck/test/usage.test.mjs` "in 2 hrs"
- `deck/test/run.test.mjs` "a session that ends while the wrapper waits for the marker stops the wait" (timing; passes alone)

## Constraints

- Prompt budget pins (`scripts/test/measure-prompt.test.mjs`, `qa-preview.test.mjs`) are the user's and never move.
- `deck/ui/js/*` is the browser allowlist: a new script there is named in the slice that adds it (S4 adds `inplace.mjs`), nothing else goes there.
- No `confirm()` dialog, ever (`confirm.mjs` header). With no script, every press still posts as it does today.
- Live verification, every slice: a scratch deck started with `pilot deck --scratch` on a free port, pressed in a real browser; never the deck on 4321, never `~/.claude/pilot`. Stores under `os.tmpdir()`.
- Small-diff limit: 200 changed lines per slice; past it, stop and ask `main`.

## Report

A table: slice, branch, PR, head SHA, tests added (failed before, pass after), gate output line, live evidence.
