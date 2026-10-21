# FA Fix round: the scripts and the prose

Feature `pilot-branch` · added after the principles review and QA (2026-10-05) · traces to spec 2, 4, 5, 13 · source: the pilot's verdicts in `run.json` `findings` · moves no locked decision

Every item was judged by the pilot against the code at `60642438`. Line numbers are from that commit.

## Files owned

`scripts/pilot-branch.mjs`, `scripts/integrate.mjs`, `scripts/sync.mjs`, `scripts/land.mjs`, `scripts/install-settings.mjs`, `bin/pilot.mjs`, `agents/pilot.md`, `docs/INSTALL.md` (one row, F6), their tests under `scripts/test/`. Nothing under `deck/`: FB owns it and runs at the same time.

## Changes

| # | Where | Change |
|---|---|---|
| F4 | `scripts/integrate.mjs:131-134` | With HEAD on `pilot`, `assertPushable` passes and `pushHead` (`:199-201`) pushes a slice onto `pilot`. Refuse by name before anything is merged: `land` is the only way onto `pilot`. |
| F5 | `scripts/pilot-branch.mjs:23-29` | `defaultBranch` reads the local `refs/remotes/origin/HEAD`, which stays `origin/main` after the remote's default is renamed, so the renamed branch passes the guard. Read the remote's HEAD (`git ls-remote --symref origin HEAD`); when the remote cannot be asked, fail closed with the existing "no default branch known" error, never fall back to the local ref. Test: a bare origin whose HEAD is moved to `trunk` after the clone; a push to `trunk` is refused. |
| F6 | `scripts/install-settings.mjs:419-423` | Add the bare `Bash(gh pr merge)` ask rule (A15) and its assertion; `docs/INSTALL.md`'s row says eight rules. |
| F8 | `agents/pilot.md:193` | "run `pilot sync`, then `pilot base`" fails on a repository with no `pilot` branch (`sync.mjs:50-52` refuses). Swap the order. Check that nothing downstream uses the sha `base` printed as the cut point after `sync` moved the tip (the architect cuts from `origin/pilot`); say what you found. |
| F9 | `sync.mjs:27,34,50-52,75-85`; `land.mjs:24,34,123-130`; `integrate.mjs:29,35,58-62,103-109` | Scripts-side copies only: the test-summary parse, `holds`, `ghIn`, `OUTPUT_BYTES`, the origin/pilot check, `step`, the `--test` parse. Export each once (from `pilot-branch.mjs` or `integrate.mjs`) and delete the copies. With it: `sync` prints `? pass` when the test output has no count line; print what is known and no `?`. The copies in `deck/tickets.mjs` and `deck/subdeck.mjs` stay. |
| QA | `scripts/land.mjs` | A red test run prints `NOT landed: base NOT taken: exit 1; not pushed`. Say the tests were red, as `integrate` does. |
| F12 | `agents/pilot.md:149-161`, `171`, `613-614` | The closing-report step reads "Merge none, then #N" when `land` prints `merge first: none` or `unknown`: word it for both. "Pivot" names the sub-deck as where the ticket goes. Only the sub-deck calls `need` now: fold **Needed** into **As sub-deck**. Net zero or a removal. |
| F13 | `agents/pilot.md:609-617` | L23 has the closing report's human steps recommend branch protection on the default branch; only `docs/INSTALL.md:139` does. Add the clause if F12's savings pay for it under the pin; if they do not, add nothing and say so, and the pilot records it under L23. |
| F11 | tests | The missing assertions on these files: a failed `sync` stops `land` (L20; `land.mjs:60`); the `merge first: none` and `unknown` output (`land.mjs:124-143`); the `pilot land`, `pilot sync` and `pilot budget` wiring in `bin/pilot.mjs` (`:128-135`, `:170-172`), a misspelt flag included; `sync.mjs:50-52` and `:93`; `pilot-branch.mjs:32` and `:48` (`a:b:c` and a bad-source refspec). |

## Not in this brief, decided

`land.mjs:70-74`'s guard at the push stays (L4: every push passes the guard). `scripts/pilot-branch.mjs` is not moved.

## Done

- **Verification**: `npm test`; `node scripts/check-references.mjs`; `node scripts/check-provenance.mjs agents/ skills/ rules/`; `node scripts/measure-prompt.mjs --json` before and after (the pin in `scripts/test/measure-prompt.test.mjs` is lowered to what you measure, never raised); in a scratch clone with a local bare origin: `integrate` on `pilot` refused, the renamed-default push refused, a red `land`'s line read.
- **Prohibited**: no behaviour change beyond the rows above; no edit under `deck/`; no rule dropped from the prompt to make room.
- **Done when**: the gate is green, each row has a test that failed before it, and the scratch runs are in the PR body.
