---
status: proposed
date: 2026-11-25
tags: [start, classifier, auto-mode, security]
supersedes: []
superseded_by: []
paths: [deck/run-env.mjs, deck/session.mjs]
---
# Pilot sessions tell the auto-mode classifier about the pilot's environment

We decided that every Start writes an `autoMode.environment` block into the start settings: `"$defaults"` first, then constant pilot lines that describe the pilot's git worktrees and their git-ignored build output. It adds context only, never a rule, and `PILOT_CLASSIFIER_ENV=off` omits it.

## Context

In auto mode the classifier trusts only the working directory and the current repository's remotes. A pilot session works across sibling git worktrees of one repository (`<repo>-feat-<slug>`, `<repo>-design-<slug>`) and rebuilds their build output, so routine actions there were blocked or got no verdict. Claude Code reads `autoMode` from user, managed and `--settings` files only, and a Start already opens every pilot session with `--settings ~/.claude/pilot/start-settings.json`, one file per home rewritten by each Start (`startArgs`).

## Decision

- **L1** The block goes only in the start settings, never in user or project settings. The user's `~/.claude/settings.json` stays theirs; project files are ignored for `autoMode` anyway.
- **L2** `"$defaults"` is the first entry, so the default environment, its trust line included, stays in effect even when the user's own block omits it.
- **L3** A pilot worktree is a git worktree of the same repository, not any directory whose name matches `<repo>-*`: a stranger's clone beside the repository matches the name but is not trusted. The line asks for that to be shown in the transcript before the directory is trusted.
- **L4** The pilot lines are English prose in the defaults' style, each with a bolded label (`**Trusted repo (pilot)**`, `**Build output (pilot)**`), and a constant (`CLASSIFIER_ENVIRONMENT`): no path, repository name, branch or other string read from disk or a repository enters classifier prose. The classifier resolves `<repo>` from the working directory (A1).
- The block carries `environment` only: no `allow`, `soft_deny`, `hard_deny` or `classifyAllShell` (A2). The off switch is the Start's environment variable `PILOT_CLASSIFIER_ENV=off` (`CLASSIFIER_SWITCH`, A3).

## Rejected

- *An installer step writing `~/.claude/settings.json`*: it reaches plain sessions, needs consent, and `claude auto-mode reset` deletes it.
- *Pilot lines without `"$defaults"`*: a session whose user block also omits the defaults would have no default context.
- *Trust by the `<repo>-*` name alone*: matches a stranger's clone.
- *A per-repo settings file carrying the sanitised path*: a second file family, and a path read from disk in classifier prose.
- *A narrow `allow` rule for build-output deletes*: a real loosening, since an allow overrides a soft_deny.
- *A stored setting behind a `pilot classifier` command as the off switch*: more surface than an environment variable.

## Consequences

- Every pilot session, its subagents included, runs with the defaults plus the pilot lines after whatever the user's own block says; `claude --settings <start-settings.json> auto-mode config` lists them last.
- The deck's Start reads the off switch from the deck's own environment, so turning it off there needs the deck restarted after `setx`.
- **Misses**: whether the classifier allows more with this context is the classifier's judgement; if context alone does not unblock a build-output delete in a pilot worktree, it stays blocked until a follow-up decides on a rule.
