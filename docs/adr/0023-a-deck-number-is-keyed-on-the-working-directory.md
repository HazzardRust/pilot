---
# Superseded in part by deck-polish L10: the status line no longer shows `deck <n>`.
status: amended
date: 2026-09-21
tags: [deck]
supersedes: []
superseded_by: []
paths: [deck/runs.mjs]
---
# A deck's number is keyed on the working directory, minted once, never reused

A run row's id is a fresh `run_<hex>` at every registration (`deck/runs.mjs`), so a number attached to it would change every time the user restarted Claude Code in the same directory, which is the opposite of the canonical identity they asked for; a tab, on the other hand, is already keyed on the repository path alone, and items carry that path and never a run id. We decided that the store gains a monotonic `deckSeq` and a `decks` map from working-directory path to number, that a path is numbered the first time it registers and keeps that number across restarts and dismissals, and that a number is never handed out twice. Rejected: numbering the run row (unstable by construction); a free list that reuses a dismissed deck's number (makes "D4" ambiguous across time, which is the one thing the number is for); reading the git branch at registration to name the deck (a `git` call in the daemon's path, when the pilot can name the worktree for its branch and hand the feature name through `deck_status`).

**Consequences**: moving or renaming a worktree makes a new deck with a new number, which is correct because it is a different deck; the count only goes up, so a long-lived machine reads D40 where a free list would read D3; the number is drawn beside the status line's `deck N` waiting count, never instead of it.
