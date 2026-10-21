# Brief: merge-first

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`), default branch `main`. Never work in that checkout
(its local `main` is far behind `origin/main`) or in another session's worktree: create your own, named
`pilot-merge-first-s<n>`, beside it.

On Windows a worktree in a deep directory needs `git -c core.longpaths=true worktree add`: 21 tracked fixture paths
are 127 characters long. Run `npm ci` in the new worktree before the first test run; without it about twenty
unrelated tests fail.

## Base and PR target

Base: `feat/merge-first`, cut from `origin/main` at bfd7616 (0.7.17) plus the design commit. This feature lands before slice-estimates (A5; planned, draft PR #289), which rebases onto it: do not adopt its `sliceCount` rename here, tickets still carry `estimate`. Every slice PR is
a **draft** against `feat/merge-first` and is never marked ready; the pilot merges it. Branch name:
`slice/merge-first-s<n>`. PR title: `feat(merge-first): S<n> <title as the artefact words it>`.
Write PR bodies with `gh pr create --body-file <file>`; a heredoc body fails in Git Bash.

## Artefact

`docs/design/merge-first/architecture.md`. Slice files are `docs/design/merge-first/slices/S<n>.md`. The
locked decisions are §5; a slice moves none of them. ADRs 0063 (`docs/adr/0063-the-architect-merges-first-in-a-thread-it-owns.md`) and 0064
(`docs/adr/0064-a-gate-passes-only-on-the-sign-off-press.md`) are already written on this branch; a slice amends one
only if the code moves what it says. 0062 is taken by slice-estimates; the next free ADR number is 0065.

## Gate command

```
npm ci
npm test
node scripts/check-references.mjs
node scripts/check-provenance.mjs agents/ skills/ rules/
```

`check-provenance.mjs` run without directories prints its usage and exits 2: it has checked nothing.

There is no typecheck, lint or build step. One file alone: `node --test <file>`. A directory does not work on
Windows (`node --test scripts/test` fails as one opaque result): use the glob form, `node --test deck/test/*.test.mjs`.

For S1, S3 and S4 the live gate is the deck started from your worktree on its own port and store:

```
PILOT_DECK_DIR=<scratch>/.deck PILOT_DECK_PORT=<free port> PILOT_DECK_NO_OPEN=1 node bin/pilot.mjs deck --foreground
```

Port 47<nn> with nn = your slice number (S1 → 4701 … S5 → 4705), so two slices never race on one port;
never 4399, which `deck/test/run.test.mjs:254` expects free. S1 runs `node bin/pilot.mjs tickets` and a real `node bin/pilot.mjs wait --as architect --item <id>` against it and reads
what they print; S3 posts a `gate1` before and after a merge thread resolves and reads the refusal; S4 types an
approval on a scratch `gate1`, reads the refused `deck_resolve`, then presses Sign off in a browser. S2 and S5 are
agent prose and pins: their gate is the suite and `node scripts/measure-prompt.mjs`, whose figures go in the PR; S2
also runs a real architect against the scratch deck if it can spawn one, and says so in its report if it cannot.
Never the user's deck on port 4321, and never its store at `~/.claude/pilot/deck.json` (read or write). Never press
Start or End on a tab. The test suite must never open a window or a browser: `deck/test/no-open.mjs` sets
`PILOT_DECK_NO_OPEN` and `PILOT_DECK_NO_START`. Set `MSYS_NO_PATHCONV=1` before a curl whose argument starts with
`/api`.

## Known flaky tests

`deck/test/usage.test.mjs`'s reset-time test (it reads the real clock), `deck/test/run.test.mjs`'s watcher test and
`deck/test/daemon.test.mjs`'s progress-token test have failed under load and never alone; rerun the one file before
you call it a regression.

## Commit trailer

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FDtma9B6qDLLGVFXRiyAKj
```

## PR footer

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01FDtma9B6qDLLGVFXRiyAKj
```

## Shared constraints

- `agents/pilot.md`: its prompt-share pin (`scripts/test/measure-prompt.test.mjs`, 10336.75) has no headroom. S2 and
  S5 both edit it and each must leave its measured share at or below what it found; S2 lowers the pin by what the
  merge sentence frees, S5 rewords within the new figure. Measure before you write prose, not after.
- `deck/tools.mjs` is the tool schema the deck advertises and `scripts/measure-prompt.mjs` imports the real file,
  so the four deck tools added to the architect frontmatter (L11) count against the architect share.
- When a pin fails after your edit, read what rule it pins: change the pin only when your slice changed that rule
  on purpose, and say so in the PR; never loosen a pin to pass.
- S3: before adding the refusal, confirm no path posts a `gate1` without an architect having run (a run-split ticket
  starts at step 4); if one exists, stop and ask `main`.
- Reworded `rules/*.md` reach `~/.claude/rules` only through the shipped-hash ledger of the install: S5 owns
  `scripts/shipped-rules.json`.
- Scratch-deck API shapes: `POST /api/runs` answers `{run:{id}}`; `/api/tool` answers a refusal as `{error}`, not
  `content[]`. Posting to a scratch deck through `/api/tool` needs an explicit `repo` on every item
  (`deck/client.mjs` adds it only on the stdio path); `deck_status` there needs a prior `POST /api/runs` with `repo`
  and `pid`, and the pid must be a long-lived process (a node keeper, not the shell) or the run expires at once.
