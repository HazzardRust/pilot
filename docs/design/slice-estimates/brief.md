# Brief: slice-estimates

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`), default branch `main`. Never work in that checkout
(its local `main` is far behind `origin/main`) or in another session's worktree: create your own, named
`pilot-slice-estimates-s<n>`, beside it.

On Windows a worktree in a deep directory needs `git -c core.longpaths=true worktree add`: 21 tracked fixture paths
are 127 characters long. Run `npm ci` in the new worktree before the first test run; without it about twenty
unrelated tests fail.

## Base and PR target

Base: `feat/slice-estimates`, cut from `origin/main` at bfd7616 (0.7.17) plus the design commit. Every slice PR is
a **draft** against `feat/slice-estimates` and is never marked ready; the pilot merges it. Branch name:
`slice/slice-estimates-s<n>`. PR title: `feat(slice-estimates): S<n> <title as the artefact words it>`.
Write PR bodies with `gh pr create --body-file <file>`; a heredoc body fails in Git Bash.

## Artefact

`docs/design/slice-estimates/architecture.md`. Slice files are `docs/design/slice-estimates/slices/S<n>.md`. The
locked decisions are §5; a slice moves none of them. ADR 0062 is already written on this branch
(`docs/adr/0062-a-tickets-size-is-a-slice-count.md`); a slice amends it only if the code moves what it says. The next
free ADR number is 0063.

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

For S1 and S2 the live gate is the deck started from your worktree on its own port and store:

```
PILOT_DECK_DIR=<scratch>/.deck PILOT_DECK_PORT=<free port> PILOT_DECK_NO_OPEN=1 node bin/pilot.mjs deck --foreground
```

Port 46<nn> with nn = your slice number (S1 → 4601, S2 → 4602, S3 → 4603), so two slices never race on one port;
never 4399, which `deck/test/run.test.mjs:254` expects free. S1 posts fixture tickets and opens the Tickets tab in a
browser to read the row; S2 curls `/api/record?repo=&ticket=` for a planned ticket and reads the plan. S3 is skill and
agent prose with its pins: its gate is the suite and `node scripts/measure-prompt.mjs`, whose figures go in the PR.
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

- `agents/pilot.md` is not edited by any slice: its prompt-share pin (`scripts/test/measure-prompt.test.mjs`) has
  no headroom.
- `deck/tools.mjs` is the tool schema the deck advertises and `scripts/measure-prompt.mjs` imports the real file,
  so a schema edit counts against the prompt pins of every agent whose frontmatter lists that tool. S1 removes a
  property (`estimate`) and describes one (`sliceCount`): measure before and after and put both figures in the PR.
- When a pin fails after your edit, read what rule it pins: change the pin only when your slice changed that rule
  on purpose, and say so in the PR; never loosen a pin to pass.
- `estimate` is also an English word and `minutes` also counts savings (`deck/audit.mjs`) and timeouts
  (`deck/wait.mjs`, `deck/run.mjs`): those are out of scope (§7). Sort grep hits by hand; do not rename by pattern.
- The guard at `deck/store.mjs:662-667` (a report closes a ticket only after its newest gate2 is resolved) stays; only
  its comment changes (L7).
- Scratch-deck API shapes: `POST /api/runs` answers `{run:{id}}`; `/api/tool` answers a refusal as `{error}`, not
  `content[]`. Posting to a scratch deck through `/api/tool` needs an explicit `repo` on every item
  (`deck/client.mjs` adds it only on the stdio path); `deck_status` there needs a prior `POST /api/runs` with `repo`
  and `pid`, and the pid must be a long-lived process (a node keeper, not the shell) or the run expires at once.
