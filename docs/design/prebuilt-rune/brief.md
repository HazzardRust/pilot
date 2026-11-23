# Brief: prebuilt-rune

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/jrylk/Projects/pilot` (GitHub `HazzardRust/pilot`, public). Never work in that checkout or in another
session's worktree. Create your own beside it, named `pilot-prebuilt-rune-s<n>`, and run `npm ci` in it before
the first test run.

## Base and PR target

The base is `feat/prebuilt-rune`, cut from `feat/ui-design-workflow` (`pilot base`: `base feat/ui-design-workflow
fee2e59 (concluding itm_132a653de1fc)`). The feature PR targets `feat/ui-design-workflow` until that lands, then
the branch `pilot base` names. A slice is a pushed branch `slice/prebuilt-rune-s<n>`, integrated by the co-pilot
with `pilot integrate`; never a PR.

## Remote

Remote: origin

## Gate command

- A slice gate: `npm run test:changed -- --since=<base sha>`, then read its scope line.
- The full suite, only where the slice says so: `npm run test:quiet`.
- `node scripts/check-references.mjs` and `node scripts/check-provenance.mjs agents/ skills/ rules/` as CI runs them.

## Diff limit

400 changed lines per slice; past it, stop and ask `main`.

## Known flaky

Taken from `docs/design/portable-store/brief.md` (on `origin/design/portable-store`).

- `npm test`'s default reporter has died with no summary: use `npm run test:quiet`.
- The suite writes the live `~/.claude/pilot/deck.json`: every test and run uses a scratch `PILOT_DECK_DIR` or the
  temp home of `deck/testUtils.mjs`, never the live store.
- Every child process must pass `windowsHide: true` (`hidden-spawns.test.mjs`, full suite only).
- `pilot checks --wait` returns pending on windows-latest and needs re-arming.
- `deck/items.mjs`, `deck/server-wait.mjs` and `deck/store-runs.mjs` sit at the 800-line facade bar;
  `deck/store-core.mjs` is at 774.
- The machine is shared with other runs' gates: never run the full suite twice in a slice, and time only what the
  slice says to time.

## Network

No test reaches the internet: the download goes through the injected `get`. The only real network use in the run
is S4's `rune-scratch-<sha7>` tag push and QA's download of that prerelease; the scratch release and tag are deleted
(`gh release delete rune-scratch-<sha7> --cleanup-tag --yes`) once QA has used them.

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

- A slice: `feat(prebuilt-rune): S<n> <title as in the artefact, lower-case first>`
- A fix round: `fix(prebuilt-rune): <what>`
- The feature PR: `feat(prebuilt-rune): A plugin install gets a prebuilt Rune deck`
