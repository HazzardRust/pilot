---
status: proposed
date: 2026-11-19
tags: [agents, auto-mode, tests, deck]
supersedes: []
superseded_by: []
paths: [hooks/lib/deck-secret.js, hooks/test/deck-dir-guard.test.js, agents/pilot-evidence-runner.md, docs/design/crew-refusals/architecture.md]
---
# Crew commands auto mode refuses: change the habit, not the permission

We decided that a crew command auto mode refuses is fixed by removing the risky action it carried, never by a
permission, an allowlist or a rewording, and that the deck store refuses the user's real store inside a test run, so
no shell ever needs to redirect its home.

## Context

One implementing run handed the user three blocked steps in an evening, each a crew habit: the evidence runner's
coverage cell exporting `HOME`, `USERPROFILE` and `PILOT_DECK_DIR` (refused 3 of 3 times), a reviewer rewriting a
writer's worktree to prove a red (4 times), and a pattern or bundled kill (3 times). The exports existed only to keep
an escaped mutant out of `~/.claude/pilot`; `deck/testUtils.mjs` already redirects the home and unsets
`PILOT_DECK_DIR` in every file that imports it, so for those files the exports changed nothing.

## Decision

- **L1 Habits change, permissions do not.** No change edits a permission setting, an allowlist, an auto-approving
  hook or `CLAUDE.md`, and none obfuscates, splits or rewords a command so the same action passes unjudged.
  Rejected: allow rules, which hand the classifier's judgement to a list.
- **L2 The `deckDir` guard is a refusal inside the code, not a way past the classifier.** With `NODE_TEST_CONTEXT`
  set, `deckDir()` throws, naming the path, when it would resolve `<os.userInfo().homedir>/.claude/pilot`, which no
  environment variable moves; a temp `PILOT_DECK_DIR` or a redirected home still resolves. The runner's cells lose
  all three variables. Rejected: a `PILOT_DECK_DIR=…` prefix per command, which `testUtils.mjs` deletes and which
  would only reword the refused command.
- **A1 The guard lives in the store, the exports go** (the user's choice on `itm_6da59f1daeb7`). Tradeoff: a
  test-only branch in a state module, which the mutation rule never mutates; other `~/.claude/pilot` files rest on
  that rule and `testUtils`' suite home, as before. Rejected: a scratch home set by `scripts/gate.mjs` (Stryker runs
  `node --test` directly and would miss it); a throwaway worktree (isolates the repository, not the store).
- **A2 A reviewer proves a red in a throwaway worktree** it creates detached and removes, never in a writer's
  worktree (`itm_cdddd4d75a58`). Tradeoff: about a minute per proof.
- **A3 The implementer and QA gain `TaskStop`**, which reaches only what the agent itself started in the background, so a stop is by id and never
  by name or pattern (`itm_d649b66f4053`). Tradeoff: two agents' tools widen.

## Consequences

A test file that forgets to isolate itself throws on its first store call instead of writing to a live deck. The
evidence runner's six checks carry no environment override. Whether auto mode now allows them is read by QA's run in
a scratch repository, not assumed here.
