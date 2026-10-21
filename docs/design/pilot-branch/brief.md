# Brief: pilot-branch

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`), default branch `main`. Never work in that checkout
or in another session's worktree: create your own, named `pilot-pilot-branch-s<n>`, beside it.

On Windows a worktree in a deep directory needs `git -c core.longpaths=true worktree add`: tracked fixture paths
run to 127 characters. Run `npm ci` in the new worktree before the first test run; without it about twenty
unrelated tests fail.

## Base and PR target

Base: `feat/pilot-branch`, cut from `origin/main` (L2), not stacked on #318 to #321. Every slice PR is a **draft**
against `feat/pilot-branch` and is never marked ready; the pilot merges it. Branch name:
`slice/pilot-branch-s<n>`. PR title: `feat(pilot-branch): S<n> <title as the artefact words it>`. Write PR bodies
with `gh pr create --body-file <file>`; a heredoc body fails in Git Bash.

This run builds the pilot branch; it does not run on one. Until it is concluded, `pilot base` and
`pilot integrate` are the installed plugin's, which still know the stack: nothing in this run pushes to a branch
named `pilot` on `HazzardRust/pilot`, and every test of `base`, `sync`, `land` and `integrate` uses a scratch clone
with a local bare origin (L16).

## Artefact

`docs/design/pilot-branch/architecture.md`. Slice files are `docs/design/pilot-branch/slices/S<n>.md`. The locked
decisions are §5 (L1 to L27); a slice moves none of them. New ADRs start at 0083 (L11): 0083 in S5, 0084 in S10,
0085 in S12, 0086 in S6. Numbers 0070 to 0082 belong to the plans in #318 to #321 and are not to be taken.

## Gate command

```
npm ci
npm test
node scripts/check-references.mjs
node scripts/check-provenance.mjs agents/ skills/ rules/
```

`check-provenance.mjs` run without directories prints its usage and exits 2: it has checked nothing.

There is no typecheck, lint or build step. One file alone: `node --test <file>`. A directory does not work on
Windows: use the glob form, `node --test deck/test/*.test.mjs`.

For every slice with a visible surface (S6, S7, S8, S9, S10, S11, S13, S15) the live gate is the deck started from
your worktree on its own port and store, opened in a browser and looked at:

```
PILOT_DECK_DIR=<scratch>/.deck PILOT_DECK_PORT=<free port> PILOT_DECK_NO_OPEN=1 node bin/pilot.mjs deck --foreground
```

Pick a port by slice, 44<nn> with nn = your slice number, so two slices never race on one port. For the CLI
slices (S1 to S4, S14, S15's `pilot budget`) the live gate is the command run in a scratch clone with a local bare
origin, and its output read. Never the user's deck on port 4321, never its store at `~/.claude/pilot/deck.json`,
never the real `~/.claude/settings.json` (S14 and S6 use a scratch config directory), and never this repository's
branches on GitHub beyond your own slice branch. The test suite must never open a window or a browser:
`deck/test/no-open.mjs` sets `PILOT_DECK_NO_OPEN` and `PILOT_DECK_NO_START`. Set `MSYS_NO_PATHCONV=1` before a
curl whose argument starts with `/api`.

## Known flaky tests

`deck/test/usage.test.mjs`'s reset-time test and `deck/test/daemon.test.mjs`'s progress-token test have failed
under load and never alone; rerun the one file before you call it a regression. Otherwise none known.

## Shared constraints

- Two chains share no file and run in parallel: S2 to S5 on `scripts/` and the prose, S6 to S13 on `deck/`.
  `deck/store.mjs`, `deck/server.mjs`, `deck/client.mjs` and `deck/ui/render.mjs` are each owned by several deck
  slices in sequence: touch only the functions your slice file names.
- Several tests read the real `agents/pilot.md` and pin its wording. Only S5 and S12 edit agent prose. When a pin
  fails after your edit, read what rule it pins: change the pin only when your slice changed that rule on purpose,
  and say so in the PR; never loosen a pin to pass.
- `scripts/measure-prompt.mjs` pins the pilot's prompt budget. S5 and S12 report the measured figure before and
  after; S12 removes "Modes" and must not end above the pin.
- The sub-deck's permission mode and allowlist (L24 to L26) live in `deck/subdeck.mjs` and reach `claude` only
  through `pilot run --sub`. No slice writes an allow rule into any `settings.json`; S14 writes ask rules only.
- Small-diff limit: 400 changed lines per slice, tests included; past it, stop and ask `main`.
- `deck/ui/render.mjs`, `deck/store.mjs` and `deck/server.mjs` are each over a thousand lines: read the ranges
  your slice file anchors, not the whole file, and one file per turn.
- Files: use the Edit and Write tools, never a shell heredoc.
- The reviewer is `pilot:typescript-reviewer` for every slice. S1 to S4 (pushes), S6 (the permission flags), S7,
  S10, S13 and S15 (post routes and a session start) and S14 (the user's settings file) also get
  `pilot:security-reviewer`.
- The pilot's own tool schemas come from the installed plugin cache, not this repo: nothing a slice changes
  reaches the live pilot until a release is installed. Test against the scratch deck.

## Closing step, the pilot's (L19)

After this feature is concluded, for each of #318, #319, #320, #321 in order: merge the pilot branch into its
`feat/<slug>`, delete the `Stands on #N.` line from its PR body, leave the PR against `main`. Not an implementer's
step; listed here so nobody plans it into a slice.

## Commit trailer

Copy it exactly, whatever model you run on.

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

## PR footer

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```
