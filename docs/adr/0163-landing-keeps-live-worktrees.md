---
status: proposed
date: 2026-10-18
tags: [landing, worktrees, agents, deck]
supersedes: []
superseded_by: []
paths: [scripts/worktrees.mjs, scripts/land.mjs, deck/procs.mjs, agents/pilot.md, scripts/test/cd-shape-wording.test.mjs, docs/design/landing-keeps-worktrees/architecture.md]
---
# Landing keeps a live agent's worktree, and the crew never chains past a failed cd

We decided that landing and `pilot worktrees prune` keep any run worktree that a concluding ticket or a live process may stand in, that the pilot prunes the run's worktrees once QA's final report arrives, that every crew agent with a shell runs a command whose directory is not its cwd in Bash as `git -C <dir>` or `cd <dir> && { …; }`, and that only the pilot closes a `Blocked:` item.

## Context

`pilot land` removed the QA agent's worktree while that agent was still live under it: the worktree was merged-clean the moment QA's commits sat on the feat branch. The agent's next `cd X; …` chain then ran on in the user's shared checkout and moved their branch. Subagents share the session's `claude` pid, so no pid names a live agent; a process names a worktree only through a path. The deck already refuses a `Moot:` close from anyone but the pilot (`isMoot`), but the pilot's prose did not say so.

## Decision

- **L1** A worktree whose ticket is concluding is kept by a branch rule, not a deck lookup: land runs only at the press, when QA is live by design.
- **L2** Liveness comes from the process table (a deck's `--leash-dir`, a daemon run from the worktree, `pilot --dir <wt> wait`), not from `git worktree lock`.
- **L3** A process the table cannot settle counts as live; an orphaned one does not. A kept tree is printed as `kept live <pid> <path>`.
- **L4** Land reads the process table once and hands it to both the holder check and `landSweep`.
- **L5** The cd shape is written into each of the ten crew agents with a shell (pilot, co-pilot, implementer, QA, fundamentalist, evidence runner, architect, explorer, auditor, teacher), not into `rules/orchestration.md`, so a user without the installed rules still gets it. Vendored reviewers are left as they are.
- **L6** The pilot runs `pilot worktrees prune --run <slug>` from the main checkout when QA's final report arrives, not at `report due`, because QA may still be tearing down at report due.
- **L7** The Moot rule is prose only: a `Blocked:` item is closed by the pilot as `Moot: <why>`, never by the refused agent; the deck's enforcement is unchanged.

## Rejected

- *Reading the ticket's state from the deck at land*: a second source of truth and a store read in land.
- *Agents locking their own worktree*: a dead agent's lock outlives it, and the lock depends on every agent's prose.
- *A second process-table read in land*: about 1 s of PowerShell for nothing.
- *The cd shape in `rules/orchestration.md` only*: a friend without the installed rules gets nothing.
- *Leaving the kept worktrees as a human step*: they would never go, regressing clean landing.
- *A PreToolUse Bash hook refusing `cd <dir>;`* (itm_700c367a594e, the user chose prose only): a node start on every Bash call of every session.

## Consequences

- A worktree someone may stand in survives landing, and the closing report names it with its state.
- The run's worktrees go once nobody stands in them, at QA's final report.
- A model that ignores its prose can still chain past a failed `cd`; the hook stays the answer if that recurs.
- The pilot, explorer and QA prompt pins rose by the sentence's measured cost.
