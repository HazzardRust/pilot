# Brief: ticket-states

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`), default branch `main`. Never work in that checkout
or in another session's worktree: create your own, named `pilot-ticket-states-s<n>`, beside it.

On Windows a worktree in a deep directory needs `git -c core.longpaths=true worktree add`: 21 tracked fixture paths
are 127 characters long. Run `npm ci` in the new worktree before the first test run; without it about twenty
unrelated tests fail.

## Base and PR target

Base: `feat/ticket-states`, fast-forwarded to `main` at 1a7a45a (run 1, PR #260, merged; run 2 continues on the same branch). Every slice PR is a **draft** against
`feat/ticket-states` and is never marked ready; the pilot merges it. Branch name: `slice/ticket-states-s<n>`. PR title:
`feat(ticket-states): S<n> <title as the artefact words it>`. Write PR bodies with `gh pr create --body-file <file>`;
a heredoc body fails in Git Bash.

## Artefact

`docs/design/ticket-states/architecture.md`, approved at Gate 1 on 2026-10-01. Slice files are
`docs/design/ticket-states/slices/S<n>.md`. The locked decisions are §5 (L1–L22), all walked with the user; a slice
moves none of them. §6 (A1–A6, B1–B6) are answered and stand. Two runs in sequence (L18): run 1 is S1–S8, run 2 is
S9–S16. ADR 0060 is already written on this branch (`docs/adr/0060-the-phase-is-the-live-ticket-s-state.md`); S4
amends it rather than creating it. The next free ADR number is 0061.

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

For every slice with a visible surface (S1, S2, S3, S4, S6, S7, S9, S12, S14) the live gate is the deck started
from your worktree on its own port and store, opened in a browser and looked at:

```
PILOT_DECK_DIR=<scratch>/.deck PILOT_DECK_PORT=<free port> PILOT_DECK_NO_OPEN=1 node bin/pilot.mjs deck --foreground
```

Pick a port by slice, 44<nn> with nn = your slice number (S1 → 4401, S12 → 4412), so two slices never race on one
port. A Windows recipe that seeds such a deck is in `C:/Users/Hazzard/Projects/pilot-qa-seed/deck-polish/`. Never
the user's deck on port 4321, and never its store at `~/.claude/pilot/deck.json`. Never press Start or End on a
tab. The test suite must never open a window or a browser: `deck/test/no-open.mjs` sets `PILOT_DECK_NO_OPEN` and
`PILOT_DECK_NO_START`. S5 exercises the SessionStart lane: run `hooks/session-handoff.js` against the scratch deck
with `PILOT_DECK_PORT` set, never against the live one. Set `MSYS_NO_PATHCONV=1` before a curl whose argument
starts with `/api`.

## Known flaky tests

`deck/test/usage.test.mjs`'s reset-time test and `deck/test/daemon.test.mjs`'s progress-token test have failed
under load and never alone; rerun the one file before you call it a regression. Otherwise none known: the suite was
green on `main` at b09e0c5.

## Shared constraints

- Several tests read the real `agents/pilot.md` and pin its wording: `deck/test/skeleton.test.mjs`,
  `deck/test/audit-offer.test.mjs`, `deck/test/parallel.test.mjs`, `deck/test/record-report.test.mjs`,
  `hooks/test/session-handoff.test.js`, `scripts/test/handoff-wording.test.mjs`, `scripts/test/pilot-rules.test.mjs`,
  `scripts/test/pilot-agents.test.mjs`, `scripts/test/general-purpose.test.mjs`, `scripts/test/small-ticket.test.mjs`.
  Only S10 and S16 edit agent prose (S11 the skill). When a pin fails after your edit, read what rule it pins:
  change the pin only when your slice changed that rule on purpose, and say so in the PR; never loosen a pin to
  pass. A deck slice whose change breaks a test that pins agent prose (S2 retires small tickets, which
  `scripts/test/small-ticket.test.mjs` pins across pilot/implementer/qa) deletes that test only if its slice file
  says so; otherwise it stops and asks `main`.
- `deck/tools.mjs` is the tool schema the deck advertises, and `scripts/measure-prompt.mjs` imports the real file,
- After S18 the pilot's share sits at its pin (10336.75; pilot-qa 5751 of 5752). `scripts/test/pilot-rules.test.mjs` also pins pilot.md sentences: a `deck/tools.mjs` edit that adds a token must pay for it in the same schema, and S16's removal of the full-auto prose from `agents/pilot.md` lowers the pin by what it frees.
- Scratch-deck API shapes: `POST /api/runs` answers `{run:{id}}`; `/api/tool` answers a refusal as `{error}`, not `content[]`; a ticket reaches yellow only through a signed `gate1` (a `gate2` on a green ticket is refused), so seed a yellow ticket straight into the scratch `deck.json` when the walk starts there.
  so a `deck_post`/`deck_ticket`/`deck_status` schema edit counts against two prompt-budget pins: the pilot's
  (`scripts/test/measure-prompt.test.mjs`) and pilot-qa's (`scripts/test/qa-preview.test.mjs`). A slice that adds
  to the schema says so in its PR with both measured figures; a slice that removes from it (S2 deletes
  start/small/regular) lowers the pin by what it freed rather than leaving the headroom to be spent.
- An edit under `rules/` fails `scripts/test/install.test.mjs` until the ledger is regenerated: run `node scripts/build-rules-ledger.mjs` and commit `scripts/shipped-rules.json` with it. Posting to a scratch deck through `/api/tool` needs an explicit `repo` on every item (`deck/client.mjs` adds it only on the stdio path); `deck_status` there needs a prior `POST /api/runs` with `repo` and `pid`, and the pid must be a long-lived process (a node keeper, not the shell) or the run expires at once. Full auto is gone from the deck since S12: the tab carries a mode control (attended / autonomous), `/api/record` reports `mode`, and a wait carries a `mode` field when it changed.
- Small-diff limit: 400 changed lines per slice, tests included; past it, stop and ask `main`.
- `deck/ui/render.mjs`, `deck/store.mjs` and `deck/server.mjs` are each over a thousand lines: read the ranges your
  slice file anchors, not the whole file, and one file per turn. The page inlines its stylesheet, so a regex on
  `data-phase` or a label matches CSS first; anchor on the element.
- Files: use the Edit and Write tools, never a shell heredoc. A heredoc in Git Bash mangles backslash sequences
  (backslash-n, a doubled backslash, a backslash before a quote) and fails to parse on some of them.
- The reviewer is `pilot:typescript-reviewer` for every slice; S4, S5, S8, S9, S12, S14 and S15 also get
  `pilot:security-reviewer` (each adds or changes a post route, a hook input or the SessionStart lane).
- The pilot's own tool schemas come from the installed plugin cache, not this repo: nothing a slice changes in
  `deck/tools.mjs` reaches the live pilot until a release is installed. Test against the scratch deck with curl.

## Commit trailer

Copy it exactly, whatever model you run on: it names the session that directed the run, not the model that typed the commit. S14's commits carry a different line by mistake; do not repeat it.

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013ssLFiDrWmATj8z7t4NEg3
```

## PR footer

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_013ssLFiDrWmATj8z7t4NEg3
```
