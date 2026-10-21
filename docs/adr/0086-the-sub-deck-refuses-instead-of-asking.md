---
status: amended
date: 2026-10-05
tags: [runs]
supersedes: [0039]
superseded_by: [0088]
paths: [docs/design/pilot-branch/architecture.md]
---
# The sub-deck refuses instead of asking

The sub-deck is a pilot session that carries yellow work while the user is at the main deck, so nobody is watching its window. A permission prompt there stalls the run with nothing on the deck saying so. ADR 0039 ruled out a session nobody watches and the auto and bypass modes with it, and `pilot run` has passed no permission flag since. The user ruled on the sub-deck: "refuse instead of ask for sure" (itm_542c0a47443b), with a wide allowlist by tool family (itm_ef5cc942c0c8) that lives only in the sub-deck's own session (itm_38f6a32408ad). So we decided `pilot run --sub` starts `claude` with `--permission-mode dontAsk` and the allowlist in `--settings`, and amended ADR 0039 for this one session.

- **A call that would prompt is refused at once.** The sub-deck does what it can without the refused step, records the refusal in the run record as a blocked step with its command, and the user resolves the blocked steps in the red phase. It is still a visible window, never headless, never auto or bypass.
- **The allowlist is one constant, `SUBDECK_ALLOW` in `deck/subdeck.mjs`.** It holds `Edit`, `Write`, `Read`, `Agent`, the deck's MCP tools, and `Bash` rules for `git`, `gh pr`, `npm`, `npx`, `node` and `pilot`. A bare tool name matches everywhere, so the slice worktrees beside the sub-deck, made mid-run, are covered. `Read` is outside L25 as the user approved it (A16, assumed): reads outside the working directory prompt, so without it no slice worktree could be read.
- **It reaches only that session.** It is passed with `--settings` under `permissions.allow`, which the Claude Code docs say also apply to the subagents it spawns. No `settings.json` is written. A plain `pilot run` gets no permission flag.

Rejected:
- The user's own settings, with the prompt waiting in the window: the run stalls and the deck does not show it.
- Auto or bypass mode, and a headless session: ADR 0039 removed them.
- Writing the allowlist into `~/.claude/settings.json`: every session in every project would run those commands unasked.
- `--allowedTools`: the docs do not say its rules reach subagents.
- `--add-dir` on the worktrees' parent directory: it grants every project beside the repository, not just the slice worktrees.

**Consequences**:
- A slice that needs a refused command comes back incomplete, and the blocked step names that command.
- The user's ask rules are hard denials in this session.
- `npx` can fetch and run a package nobody chose, `node *` (`node -e`) and `npm *` (lifecycle scripts) run any code, and `git *` covers push forms the ask rules miss. The list is a convention for agents, not a sandbox.

Recorded in `docs/design/pilot-branch/architecture.md` (§2 spec 7; §5 L24, L25, L26).
