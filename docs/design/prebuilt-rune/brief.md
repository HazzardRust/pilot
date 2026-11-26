# Brief: prebuilt-rune

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/jrylk/Projects/pilot` (GitHub `HazzardRust/pilot`, public). Never work in that checkout or in another
session's worktree. Create your own beside it, named `pilot-prebuilt-rune-s<n>`, and run `npm ci` in it before
the first test run.

## Base and PR target

The base is `feat/prebuilt-rune`, carrying `origin/main` at 6701cc7 (`pilot base`: `base main 6701cc72`) merged
into the first plan (re-cut 2026-11-26). The feature PR (#150, draft) targets `main`, ADR 0200's computed base
since `feat/ui-design-workflow` (#140) merged. Gate 2 lands on the pilot branch, `hazzardrust-pilot` once
user-pilot-branch (#157) lands, `pilot` before. A slice is a pushed branch `slice/prebuilt-rune-s<n>`, integrated
by the co-pilot with `pilot integrate`; never a PR.

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
- The gate1 lineage and verdict tests fail under load (ticket itm_ad02d595d1c2, fix planned): rerun that file alone
  before calling it a regression.
- A `--since` gate whose diff touches `deck/` also runs the Rune `cargo fmt --check` and `cargo test`
  (`scripts/gate.mjs:301-312`); S1-S3 all do, so each slice gate is heavy.

## Machine

HeatGuard hibernates this laptop at 95 C sustained for 2 minutes: one heavy gate at a time across the run (a
`cargo` build or test, the full suite), never two slices' gates at once.

## Human steps

- S4's push of `.github/workflows/rune-release.yml` needs the `workflow` scope: held since 2026-11-26 (`gh auth
  status`: gist, read:org, repo, workflow; itm_daa1ea49125f). S4 stops and asks `main` if the push is refused
  anyway; the design branch carries no workflow file.
- After landing: on HazzardLaptop, `pilot deck` after the first real release (spec 9, A10).

## Network

No test reaches the internet: the download goes through the injected `get`. The PR run's build is the default
evidence; only if A9 allows it, S4 pushes a `rune-scratch-<sha7>` tag and QA downloads that prerelease, and the
scratch release and tag are deleted (`gh release delete rune-scratch-<sha7> --cleanup-tag --yes`) once QA has used them.

## Commit trailer

Every commit ends with these two lines, copied exactly:

```
Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NXgSFqofX9JXraJQMnd6vc
```

## PR footer

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01NXgSFqofX9JXraJQMnd6vc
```

## Live root

C:\Users\jrylk\.claude\pilot\live untrusted

## PR titles

- A slice: `feat(prebuilt-rune): S<n> <title as in the artefact, lower-case first>`
- A fix round: `fix(prebuilt-rune): <what>`
- The feature PR: `feat(prebuilt-rune): A plugin install gets a prebuilt Rune deck`
