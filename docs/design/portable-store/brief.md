# Brief: portable-store

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/jrylk/Projects/pilot` (GitHub `HazzardRust/pilot`, public). Never work in that checkout or in another
session's worktree. Create your own beside it, named `pilot-portable-store-s<n>`, and run `npm ci` in it before
the first test run.

## Base and PR target

The base is `feat/portable-store`, cut from `main` (`pilot base`: `base main 69e315c`). The feature PR targets
`main`. A slice is a pushed branch `slice/portable-store-s<n>`, integrated by the co-pilot with `pilot integrate`;
never a PR.

## Remote

Remote: origin

## Gate command

- A slice gate: `npm run test:changed -- --since=<base sha>`, then read its scope line.
- The full suite, only where the slice says so: `npm run test:quiet`.
- `node scripts/check-references.mjs` and `node scripts/check-provenance.mjs agents/ skills/ rules/` as CI runs them.

## Known flaky

Taken from `docs/design/cheap-suite/brief.md` (on `origin/design/cheap-suite`); none were handed to this run.

- `npm test`'s default reporter has died with no summary: use `npm run test:quiet`.
- The suite writes the live `~/.claude/pilot/deck.json`. This run migrates that file: every test and run here uses
  a scratch `PILOT_DECK_DIR` or the temp home of `deck/testUtils.mjs`, never the live store.
- Every child process must pass `windowsHide: true` (`hidden-spawns.test.mjs`, full suite only).
- `pilot checks --wait` returns pending on windows-latest and needs re-arming.
- `deck/items.mjs`, `deck/server-wait.mjs` and `deck/store-runs.mjs` sit at the 800-line facade bar;
  `deck/store-core.mjs` is at 774.
- The machine is shared with other runs' gates: never run the full suite twice in a slice, and time only what the
  slice says to time.

## Commit trailer

Every commit ends with these two lines, copied exactly:

```
Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NXgSForDWcHA67cB28cNrm
```

## PR footer

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01NXgSForDWcHA67cB28cNrm
```

## Live root

C:\Users\jrylk\.claude\pilot\live untrusted

## PR titles

- A slice: `feat(portable-store): S<n> <title as in the artefact, lower-case first>`
- A fix round: `fix(portable-store): <what>`
- The feature PR: `feat(portable-store): The deck's store is portable, with export and import`
