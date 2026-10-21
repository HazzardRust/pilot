# Brief: crew-voice-rules

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`), default branch `main`. Never work in that checkout
or in another session's worktree: create your own, named `pilot-crew-voice-rules-s<n>`, beside it, with
`git -c core.longpaths=true worktree add` (21 tracked fixture paths are 127 characters long). Run `npm ci` in the
new worktree before the first test run; without it four `pass.test.mjs` cases fail with ERR_MODULE_NOT_FOUND and
look like a real red.

## Base and PR target

Base: `feat/crew-voice-rules` (cut from `main` at a7c92e7, version 0.7.13, PR #222 included). Every slice PR is a
**draft** against `feat/crew-voice-rules` and is never marked ready; the pilot merges it. Branch name:
`slice/crew-voice-rules-s<n>`. Write PR bodies with `gh pr create --body-file <file>`; a heredoc body fails in Git
Bash, and so does any heredoc holding a backtick-quoted `'` or a JS template literal — use the Write tool for
those files. Do not edit files with Python in text mode: it turns LF into CRLF, which breaks the frontmatter
parser and inflates the token pins. If you must, open with `newline=''`.

PR #229 (`fix/lesson-thread`, the lesson thread type) is open against `main` and touches `agents/pilot.md` step 6
and `agents/pilot-teacher.md`; it may merge during this run. S2 and S4 edit pilot.md: keep their edits out of the
step 6 "Teach me" paragraph, and expect a rebase.

## Artefact

`docs/design/crew-voice-rules/architecture.md`, approved at Gate 1 on 2026-10-01 (itm_a217ff7600a3, df6f8c8).
Slice files are `docs/design/crew-voice-rules/slices/S<n>.md`. Locked decisions are §5 (L0–L19); a slice moves
none of them. A6 and A8 in §6 are assumed and stand.

## Diff limit

**400 lines per slice**, the one number; a slice file that says otherwise is wrong and this line wins. Generated
files (`scripts/shipped-rules.json`, lockfiles) are outside the count. Past it, stop and ask `main`.

## Gate command

```
npm ci
npm test
node scripts/check-references.mjs
node scripts/check-provenance.mjs agents/ skills/ rules/
```

`check-provenance.mjs` run without directories prints its usage and exits 2: it has checked nothing. There is no
typecheck, lint or build step. One file alone: `node --test <file>`. Pipe `node --test` output to a file, not
through grep: in Git Bash the piped output was empty.

Token pins: `scripts/test/pilot-rules.test.mjs` pins the pilot's share (definition + skills + tool schemas) at
10400 tokens and QA's at 5600; on main the pilot's is 10387.25. The pin counts the deck tool schemas, so a
`deck/tools.mjs` change spends it. A prose slice on pilot.md must replace words, not add them; S2's job is to
make it shorter.

For a slice with a deck surface (S5) the live gate is a scratch deck from your worktree, on its own port and
store, driven and looked at:

```
PILOT_DECK_DIR=<your own scratch dir>/.deck PILOT_DECK_PORT=<free port> PILOT_DECK_NO_OPEN=1 node bin/pilot.mjs deck --foreground
```

Use a scratch dir of your own, not the session scratchpad: it is shared with other agents and their deck stores.
Never the user's deck on port 4321 or its store at `~/.claude/pilot/deck.json`. For the rules slices (S7–S12)
the live gate is `node scripts/install-rules.mjs` against a fixture target directory, never `~/.claude/rules/`
on this machine, and `node scripts/measure-rules.mjs` read.

## Known flaky tests

`deck/test/usage.test.mjs`'s reset-time test and `deck/test/daemon.test.mjs`'s progress-token test have failed
under load and never alone; rerun the one file before you call it a regression. Otherwise none: 2021 of 2021 on
2026-10-01.

## Commit trailer

Every commit ends with these two lines, exactly:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gnsv4HNp2A1imhTaEyfwcW
```

## PR footer

Every PR body ends with:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01Gnsv4HNp2A1imhTaEyfwcW
```

## Reviewer

One fresh `pilot:typescript-reviewer` per slice on the diff; a prose-only slice gets the same reviewer reading
for the spec axis. S5 (user input into the deck) adds `pilot:security-reviewer`.

## Report

A table: files, tests added (red SHA, green SHA), gate result, PR number and head SHA, what you assumed, a
friction row. No narrative.
