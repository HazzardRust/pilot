---
status: accepted
date: 2026-10-08
tags: [rules, hooks]
supersedes: []
superseded_by: []
paths: []
---
# The rules copy repairs itself at session start

ADR 0055 taught the install to bring an earlier rules copy up to date, but nothing ran the install again
after an upgrade, so `~/.claude/rules` stayed on whatever version was installed first until someone
remembered (audit-fixes F13). The status line already repairs itself at SessionStart
(`install-settings.mjs --repair`); the rules had no such step.

So we decided a second SessionStart entry, `start:any:rules-repair`, runs
`scripts/install-rules.mjs --repair` (audit-fixes L4, L14, Q2):

- **The same function, on a trigger.** `--repair` is `installRules` with ADR 0055's ledger unchanged: a
  file is ours only when its sha256 equals a version shipped at that path; it is replaced, or deleted at
  a retired path, inside the resolved target and never through a link. Nothing new decides what is ours.
- **Silent unless there is news.** One `systemMessage` line when a file was updated, added or deleted, or
  could not be; nothing otherwise.
- **An edited rule is named once.** The set of edited rules is remembered in
  `~/.claude/pilot-inbox/rules-edited.json`; it is named again only when it gains a file not named before.
- **Only from the plugin cache.** Without `--target`, a plugin root outside `~/.claude/plugins/cache`
  (a worktree, a `--plugin-dir` checkout) changes nothing, as for the status line's repair (S11): an
  unreleased copy written into the home would read as an edit forever after.

Rejected:
- A SessionStart warning naming the install command: nothing is written, but the drift stays until
  someone acts, which is how F13 arose (the user, `itm_e6cbe453a1b2`).
- Naming an edited rule every session: noise in every spawn's context.
- A backup before each replacement: every replaced or deleted file is reproducible from git history.

**Consequences**:
- The user's home changes without a prompt on the first session after an upgrade; the message says what.
- An edit kept on purpose is named once, then never again unless another file is edited.
