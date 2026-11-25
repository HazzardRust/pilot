# steps-in-previews brief

## Repository

C:/Users/jrylk/Projects/pilot (`HazzardRust/pilot`). The shared checkout is hundreds of commits behind; never work in it.

## Base

`feat/steps-in-previews`, cut from the design tip (`design/steps-in-previews`, itself from `origin/pilot`). PR target: `pilot`.

## Remote

Remote: origin

## Gate

`npm run test:quiet` (the full suite with the quiet reporter; it skips 28 tests), plus each slice's own verification line.

## Known flaky

- `npm test`'s default reporter has died with no summary: use `npm run test:quiet`.
- The suite writes the live `~/.claude/pilot/deck.json`.
- Every child process must pass `windowsHide: true` (`hidden-spawns.test.mjs`, full suite only).
- `hooks/test/inbox.test.js` can go red on "deck is not answering" on a loaded machine (66/66 alone).
- Full-suite gates stall under load on this shared machine.

## Live check

A scratch deck, never the user's deck on 4321: `deck/scratch.mjs` (`startScratch`), with `PILOT_DECK_PORT` and
`PILOT_DECK_DIR` set to it. A thread is seeded by POSTing `deck_post` to its `/api/tool`; a steps thread, which
`deck_post` refuses, by `deck/rune/tests/deck/support/seed-steps.mjs` (S2) or `postSteps` with `PILOT_DECK_DIR` set.
The Rune window: `pilot-deck --open "screen=thread&id=<id>" --theme dark|light --script <json> --snap <png>`.

## Commit trailer

```
Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NXgSFrR7Ee9f1oe7sWUsEs
```

## PR footer

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01NXgSFrR7Ee9f1oe7sWUsEs
```

## Live root

C:\Users\jrylk\.claude\pilot\live untrusted

## PR titles

- Slice: `feat(steps-in-previews): S<n> <title>`, the title lower-case first.
- Fix round: `fix(steps-in-previews): <what>`
- Feature: `feat(steps-in-previews): human steps threads show in the deck's thread previews`
