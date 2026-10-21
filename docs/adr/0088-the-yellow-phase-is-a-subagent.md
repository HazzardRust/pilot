---
status: accepted
date: 2026-10-06
tags: [crew, runs]
supersedes: [0084, 0085, 0086]
superseded_by: []
paths: []
---
# The yellow phase is a subagent of the main session

A yellow ticket is implemented by the `pilot-co-pilot`, a subagent the main session spawns for the yellow head, one per ticket (yellow-agent L2, L14), and never by a second Claude session. The sub-deck was that second session: `pilot run --sub` opened a detached worktree `<repo>-subdeck` at `origin/pilot`, started `claude` there under `--permission-mode dontAsk` with an allowlist passed by `--settings`, refreshed the worktree before each `/clear`, and typed `/exit` when its chain handed it nothing. The first real `pilot run --sub` on a signed gate1 was turned off within the day (deck itm_8e6896cb4c7b, 0.7.20), and a second session costs a second context, a second terminal, a second worktree to keep clean and a process the daemon can start. So we decided the yellow phase is a subagent, and the launcher is removed rather than kept behind a flag.

- **`pilot run --sub` is refused by name**, `pilot run: unknown option --sub` and exit 1, not read as a plain `pilot run`. A flag kept as a no-op alias would start a main session where the user asked for a sub-deck, which is the one thing they did not want. `pilot run` takes no option at all, so any other is refused the same way.
- **`deck/subdeck.mjs` is deleted**: `SUBDECK_ALLOW`, `subdeckArgs` and `openSubdeck` have no caller. The co-pilot's grant is the user's own settings (L17); nothing writes or passes an allowlist.
- **`startSession(repo)` has no `sub` option**, and with it go the sub latch and its 409s. The daemon starts a session only on Start (ADR 0050, L6).
- **The wrapper loses the sub-deck's parts**: `SUBDECK_PROMPT`, the live sub-deck check, the refresh before `/clear`, and the `/exit` with its grace. `RESUME_PROMPT` and `CLAUDE_ARGS` are unchanged.
- **The daemon's, the store's and the page's sub-deck parts go in their own slices** (yellow-agent S9 to S11), each with its own tests.

## Supersedes

- ADR 0084, "A gate1 sign-off starts the sub-deck": a sign-off starts nothing; the main session spawns the co-pilot.
- The sub-deck half of ADR 0085, "The sub-deck replaces implementation mode": the co-pilot replaces implementation mode instead.
- ADR 0086's mechanism, "The sub-deck refuses instead of asking": the wrapper's `dontAsk` flag and the passed allowlist are gone; what remains is `permissionMode: dontAsk` in the co-pilot's frontmatter, for a main session not in auto mode, and A1's hook, which refuses a crew agent's prompt (L17). Its rule, refuse and record rather than wait on the user, survives in the co-pilot.

The old ADRs are left as written; this one records the reversal (L12).

## Considered options

- **Keep `--sub` as an alias of `pilot run`.** Rejected: a stale shortcut or habit would start a main session silently.
- **Keep the launcher behind a constant, as `SUBDECK_ON_SIGN` did.** Rejected: dead code with a process start in it (L6).
