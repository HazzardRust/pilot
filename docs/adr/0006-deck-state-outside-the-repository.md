---
status: accepted
date: 2026-09-13
tags: [deck]
supersedes: []
superseded_by: []
paths: []
---
# Deck state lives in `~/.claude/pilot/`, never in the target repository

Queue state (items, threads, run registrations) is per-machine and disposable; the architecture artefact is per-repository and durable. Keeping the queue under the user's Claude directory means the package never has to edit a friend's `.gitignore`, and the status table is rendered from deck state rather than hand-maintained in the artefact, so there is one writer per store.
