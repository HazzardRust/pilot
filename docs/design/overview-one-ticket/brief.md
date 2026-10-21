# Brief: overview-one-ticket

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`), default branch `main`. Never work in that checkout
or in another session's worktree: create your own, named `pilot-overview-one-ticket-s<n>`, beside it.

On Windows a worktree in a deep directory needs `git -c core.longpaths=true worktree add`: tracked fixture paths
run to 127 characters. Run `npm ci` in the new worktree before the first test run; without it about twenty
unrelated tests fail.

## Base and PR target

Base: `feat/overview-one-ticket`, cut from `main` at bfd7616. Every slice PR is a **draft** against
`feat/overview-one-ticket` and is never marked ready; the pilot merges it. Branch name:
`slice/overview-one-ticket-s<n>`. PR title: `feat(overview-one-ticket): S<n> <title as the artefact words it>`.
Write PR bodies with `gh pr create --body-file <file>`; a heredoc body fails in Git Bash.

## Artefact

`docs/design/overview-one-ticket/architecture.md`. Slice files are `docs/design/overview-one-ticket/slices/S<n>.md`.
The locked decisions are §5 (L1–L17; L16 and L17 moved spec 1, 8 and 20 after Gate 1, on the user's word); a slice moves none of them. §6 (A2, A3) are assumed and told to the user.
One run, five slices: S1 and S4 side by side, S2 after both, S3 after S2, S5 after S4. The ADRs this feature
writes are 0065 (S1, extended by S2) and 0066 (S4): 0062 to 0064 are taken on unmerged branches.

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

For every slice with a visible surface (S1, S2, S3, S4) the live gate is the deck started from your worktree on
its own port and store, opened in a browser and looked at:

```
PILOT_DECK_DIR=<scratch>/.deck PILOT_DECK_PORT=<free port> PILOT_DECK_NO_OPEN=1 node bin/pilot.mjs deck --foreground
```

Pick a port by slice, 45<nn> with nn = your slice number (S1 → 4501), so two slices never race on one port. Seed
it as the artefact's §9 says. Never the user's deck on port 4321, and never its store at
`~/.claude/pilot/deck.json`. Never press Start or End on a tab. The test suite must never open a window or a
browser: `deck/test/no-open.mjs` sets `PILOT_DECK_NO_OPEN` and `PILOT_DECK_NO_START`. Set `MSYS_NO_PATHCONV=1`
before a curl whose argument starts with `/api`.

Scratch-deck API shapes: `POST /api/runs` answers `{run:{id}}`; `/api/tool` answers a refusal as `{error}`, not
`content[]`, and needs an explicit `repo` on every item (JSON-escape Windows paths); a ticket reaches yellow only
through a signed `gate1`, so seed a yellow or red ticket straight into the scratch `deck.json` when the walk starts
there.

## Known flaky tests

`deck/test/usage.test.mjs`'s reset-time test and `deck/test/daemon.test.mjs`'s progress-token test have failed
under load and never alone; rerun the one file before you call it a regression.

## Shared constraints

- Small-diff limit: 400 changed lines per slice, tests included; past it, stop and ask `main`.
- `deck/ui/render.mjs`, `deck/store.mjs` and `deck/server.mjs` are each over a thousand lines: read the ranges your
  slice file anchors, not the whole file, and one file per turn. The page inlines its stylesheet, so a regex on
  `data-phase` or a label matches CSS first; anchor on the element.
- Files: use the Edit and Write tools, never a shell heredoc.
- `deck/tools.mjs` is the tool schema the deck advertises, and `scripts/measure-prompt.mjs` imports the real file,
  so S4's `deck_ticket` enum edit counts against two prompt-budget pins: the pilot's
  (`scripts/test/measure-prompt.test.mjs`, at zero headroom) and pilot-qa's (`scripts/test/qa-preview.test.mjs`).
  A token added must be paid for in the same schema; say both measured figures in the PR. Never loosen a pin to pass.
- Several tests read the real `agents/pilot.md` and pin its wording. Only S5 edits agent prose. When a pin fails
  after your edit, read what rule it pins: change the pin only when your slice changed that rule on purpose, and
  say so in the PR.
- PR #290 (`feat/merge-first`) is open and unmerged. It edits `agents/pilot.md`, the pilot's prompt-size pin, and
  `deck/server.mjs` beside the `deck_ticket` handler; its `resolveItem` refuses an unsigned gate, which is why
  `pivot` closes the gate2 inside the store write (L8). Do not rebase onto it; if it merges mid-run the pilot
  sends the new base.
- The reviewer is `pilot:typescript-reviewer` for every slice; S4 also gets `pilot:security-reviewer` (new
  `deck_ticket` actions that write ticket state and close a gate).
- The pilot's own tool schemas come from the installed plugin cache, not this repo: nothing a slice changes in
  `deck/tools.mjs` reaches the live pilot until a release is installed. Test against the scratch deck with curl.

## Commit trailer

Copy it exactly, whatever model you run on: it names the session that directed the run, not the model that typed
the commit.

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FDtma9B6qDLLGVFXRiyAKj
```

## PR footer

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01FDtma9B6qDLLGVFXRiyAKj
```
