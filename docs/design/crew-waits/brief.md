# Brief: crew-waits

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`), default branch `main`. Never work in that checkout
or in another session's worktree: create your own, named `pilot-crew-waits-s<n>`, beside it.

On Windows a worktree in a deep directory needs `git -c core.longpaths=true worktree add`: 21 tracked fixture paths
are 127 characters long. Run `npm ci` in the new worktree before the first test run; without it about twenty
unrelated tests fail.

## Base and PR target

Base: `feat/crew-waits`, cut from `feat/ticket-states` at 84860f5 (PR #270, 0.7.17, open and not yet merged into
`main`; L2). Every slice PR is a **draft** against `feat/crew-waits` and is never marked ready; the pilot merges
it. Branch name: `slice/crew-waits-s<n>`. PR title: `feat(crew-waits): S<n> <title as the artefact words it>`.
Write PR bodies with `gh pr create --body-file <file>`; a heredoc body fails in Git Bash.

## Artefact

`docs/design/crew-waits/architecture.md`. Slice files are `docs/design/crew-waits/slices/S<n>.md`. The locked
decisions are §5; a slice moves none of them. ADR 0061 is already written on this branch
(`docs/adr/0061-a-wait-takes-what-it-prints.md`); S1 amends it only if the code moves what it says. The next free
ADR number is 0062.

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

Port 45<nn> with nn = your slice number (S1 → 4501, S2 → 4502), so two slices never race on one port. S1 runs real
`node bin/pilot.mjs wait --as <kind>` processes against it with `PILOT_DECK_PORT` set and reads what they print; S2
opens a thread page in a browser and looks at the mark. S3, S4 and S5 are agent prose and pins: their gate is the
suite and `node scripts/measure-prompt.mjs`, whose figures go in the PR. Never the user's deck on port 4321, and
never its store at `~/.claude/pilot/deck.json`. Never press Start or End on a tab. The test suite must never open a
window or a browser: `deck/test/no-open.mjs` sets `PILOT_DECK_NO_OPEN` and `PILOT_DECK_NO_START`. Set
`MSYS_NO_PATHCONV=1` before a curl whose argument starts with `/api`.

## Known flaky tests

`deck/test/usage.test.mjs`'s reset-time test and `deck/test/daemon.test.mjs`'s progress-token test have failed
under load and never alone; rerun the one file before you call it a regression. Otherwise none known: QA reported
2225 of 2225 on `feat/ticket-states` at 9430618.

## Shared constraints

- Prompt budgets (spec 11, L8): the pilot's own share is pinned at 10336.75 and measured 10318 at the base;
  pilot-qa's is pinned at 5752 and measured 5751. Neither pin is raised or lowered. The only budget for new prose
  is the 160 tokens freed in each by taking `deck_wait` out of the frontmatter (L5). The pins live in
  `scripts/test/measure-prompt.test.mjs` and `scripts/test/qa-preview.test.mjs`; `node scripts/measure-prompt.mjs`
  prints the figures. Measure before you write prose, not after.
- `deck/tools.mjs` is the tool schema the deck advertises and `scripts/measure-prompt.mjs` imports the real file,
  so a schema edit counts against both pins for every tool an agent's frontmatter lists.
- Several tests read the real `agents/pilot.md` and pin its wording: `deck/test/skeleton.test.mjs`,
  `deck/test/audit-offer.test.mjs`, `deck/test/parallel.test.mjs`, `deck/test/record-report.test.mjs`,
  `hooks/test/session-handoff.test.js`, `scripts/test/handoff-wording.test.mjs`, `scripts/test/pilot-rules.test.mjs`,
  `scripts/test/pilot-agents.test.mjs`, `scripts/test/general-purpose.test.mjs`. When a pin fails after your edit,
  read what rule it pins: change the pin only when your slice changed that rule on purpose, and say so in the PR;
  never loosen a pin to pass.
- Scratch-deck API shapes: `POST /api/runs` answers `{run:{id}}`; `/api/tool` answers a refusal as `{error}`, not
  `content[]`. Posting to a scratch deck through `/api/tool` needs an explicit `repo` on every item
  (`deck/client.mjs` adds it only on the stdio path); `deck_status` there needs a prior `POST /api/runs` with `repo`
  and `pid`, and the pid must be a long-lived process (a node keeper, not the shell) or the run expires at once.
- An edit under `rules/` fails `scripts/test/install.test.mjs` until the ledger is regenerated: run
  `node scripts/build-rules-ledger.mjs` and commit `scripts/shipped-rules.json` with it.
- Small-diff limit: 400 changed lines per slice, tests included; past it, stop and ask `main`.
- `deck/ui/render.mjs`, `deck/store.mjs` and `deck/server.mjs` are each over a thousand lines: read the ranges your
  slice file anchors, not the whole file, and one file per turn. The page inlines its stylesheet, so a regex on a
  label matches CSS first; anchor on the element.
- Files: use the Edit and Write tools, never a shell heredoc. A heredoc in Git Bash mangles backslash sequences
  and fails to parse on some of them.
- The reviewer is `pilot:typescript-reviewer` for every slice; S1 also gets `pilot:security-reviewer` (it changes
  what a caller of `deck_wait` may claim and take).
- The pilot's own tool schemas come from the installed plugin cache, not this repo: nothing a slice changes
  reaches the live pilot until a release is installed. Test against the scratch deck.

## Commit trailer

Copy it exactly, whatever model you run on: it names the session that directed the run, not the model that typed
the commit.

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014oG56kw5hbkjcKnFkbE8EJ
```

## PR footer

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_014oG56kw5hbkjcKnFkbE8EJ
```
