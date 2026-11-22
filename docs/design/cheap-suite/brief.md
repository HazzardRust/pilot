# Brief: cheap-suite

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/jrylk/Projects/pilot` (GitHub `HazzardRust/pilot`, public). Never work in that checkout or in another
session's worktree: it is far behind and may hold another session's work. Create your own beside it, named
`pilot-cheap-suite-s<n>`, and run `npm ci` in it before the first test run.

## Base and PR target

The base is `feat/cheap-suite`, cut from `main` (`pilot base`: `base main da9a644`). The feature PR targets `main`.
A slice is a pushed branch `slice/cheap-suite-s<n>`, integrated by the co-pilot with `pilot integrate`; never a PR.

## Remote

Remote: origin

## Gate command

- A slice gate: `npm run test:changed -- --since=<base sha>`, then read its scope line.
- The full suite, only where the slice says so: `npm run test:quiet`.
- `node scripts/check-references.mjs` and `node scripts/check-provenance.mjs agents/ skills/ rules/` as CI runs them.
- A slice touching `deck/rune/`: `cargo test --manifest-path deck/rune/Cargo.toml`.

## Known flaky

- `npm test`'s default reporter has died with no summary: use `npm run test:quiet`.
- The suite writes the live `~/.claude/pilot/deck.json`.
- Every child process must pass `windowsHide: true` (`hidden-spawns.test.mjs`, full suite only).
- `pilot checks --wait` returns pending on windows-latest and needs re-arming.
- `deck/items.mjs` and `deck/server-wait.mjs` sit at the 800-line facade bar.
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

- A slice: `feat(cheap-suite): S<n> <title as in the artefact, lower-case first>`
- A fix round: `fix(cheap-suite): <what>`
- The feature PR: `feat(cheap-suite): The test suite is cheap enough to never time a landing out`
