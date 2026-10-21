---
status: accepted
date: 2026-10-01
tags: [rules, install]
supersedes: []
superseded_by: []
paths: [scripts/install-rules.mjs, scripts/shipped-rules.json, scripts/build-rules-ledger.mjs]
---
# The rules install replaces shipped copies and deletes only what the ledger names

`scripts/install-rules.mjs` copies `rules/` into `~/.claude/rules/` and never overwrote a file already there, so a
machine that installed once stayed on that version for good: on the user's machine `orchestration.md` and
`vertical-execution.md` were still the 7df34ba copies on 2026-10-01, nine releases on (crew-voice-rules spec 13).
The fix has to tell a stale shipped copy from a file the user edited, and a file the package stopped shipping
from a file the user wrote there themselves.

So we decided the install carries a ledger, `scripts/shipped-rules.json`, generated from git history by
`scripts/build-rules-ledger.mjs`: for every path the package ever shipped under `rules/`, the sha256 of every
version (append-only since ADR 0174). A target file whose bytes match any entry for its path is replaced with the current one. A target file
whose path the ledger lists as shipped-then-removed, and whose bytes match a shipped version, is deleted. Anything
else under `~/.claude/rules/` — a file the user edited, a file they wrote, a file from another plugin — is never
touched; the install names it in its report (L19, itm_5d3985b83d01). A test pins the ledger against the history.

Rejected:
- Mirror: make the directory identical to `rules/`, deleting anything not shipped. The user pressed it first and
  withdrew it on pushback: Claude Code loads that directory for every project, people put their own rules there,
  and a silent delete on every install has no backup.
- Overwrite on version change only: a file edited by the user would be lost on the next release.
- Prompting before each replacement: the install runs from a one-line prompt and is meant to be re-runnable.

**Consequences**:
- Someone deliberately keeping an old shipped copy gets the current one; the report names the file.
- A pruned file the user had edited stays behind, named, until they remove it.
- The ledger grows by one entry per shipped version of each file and is regenerated, never hand-edited.
