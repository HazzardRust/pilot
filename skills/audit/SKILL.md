---
name: audit
description: One read-only housekeeping audit of the current repository for agents - what makes an agent slow, expensive or error-prone here - measured in a scratch worktree, never guessed, and posted to the deck as one ranked, evidenced list the user picks fixes from. Use when the user says "audit this repo for agents" or runs /pilot:audit. Changes nothing in the repository.
---

# Audit

The audit is on demand: the user asked for it, and it changes nothing in the
repository. The `pilot:pilot-auditor` agent measures, posts the audit item,
owns its thread and posts the tickets the user picks (ADR 0058); this skill
proves the repository was left as it was found and saves what came back.

## Before

1. The repository is `git rev-parse --show-toplevel` from the session's
   directory. Not a git repository: say so and stop.
2. Snapshot its git state into `<scratchpad>/audit-before.txt`, outside the
   repository, with each command run there in this order:
   `git status --porcelain`, `git branch -a`, `git stash list`,
   `git worktree list`.
3. Note whether a piloted run is live in this repository (the deck's status
   table shows one) and, if so, its current slice's name exactly as that
   table spells it; the auditor then runs its explorers one at a time.

## Run the auditor

Spawn one `pilot:pilot-auditor`, in the background. Its brief: the
repository path, your scratchpad directory, whether a run is live and, if
so, the slice name noted above, and the report path
`<scratchpad>/audit-<stamp>.json`. Note the time you spawned it, and wait for
its message `measured: <report path>`. Between measuring and that message, the
auditor spawns `pilot:pilot-fundamentalist` to argue each row down and writes its
verdicts into the report, so the item lists the kept rows, then the cut ones
with their reasons, still pickable. If it ends without that message, tell the user
what it reported, and post nothing.

## Hand over

1. Snapshot again into `<scratchpad>/audit-after.txt` with the same four
   commands and compare. They must be identical. If they are not, the audit
   broke its rule: the lines that differ go to the auditor, which puts them
   at the top of the item body, and nothing is changed to hide them.
2. Set the report's `minutes` to the wall time since you spawned the
   auditor. Its `tokens` stays null: the auditor is still at work, so the
   cost line reads `tokens not measured`.
3. Run `node "${CLAUDE_PLUGIN_ROOT}/bin/pilot.mjs" audit save <report.json>`.
   It prints three paths: the JSON, the Markdown table and the `.deck.md`
   body. On exit 1 it names each refused row on stderr; send those to the
   auditor once to fix, and if it still refuses, tell the user what it said.
4. Send the auditor, with `SendMessage`, `{ deck: <.deck.md path>, report:
   <json path>, differs: [the lines that differ, or none] }`. From here the
   thread is the auditor's: it posts the item, answers the replies, posts
   the picked tickets, the picks grouped by surface, one ticket each, and
   resolves the item. A `rederived` row is picked like any other: its
   `spec` is the ticket line, the mechanism its `fix` names. When its report arrives, relay the
   item and ticket ids to the user.
