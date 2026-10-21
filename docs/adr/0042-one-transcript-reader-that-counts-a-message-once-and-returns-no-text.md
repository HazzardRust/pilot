---
status: accepted
date: 2026-09-27
tags: [deck, logging]
supersedes: []
superseded_by: []
paths: [hooks/lib/transcript-tail.js, deck/transcripts.mjs]
---
# One transcript reader, which counts a message once and returns no text

Run analytics and usage telemetry both need what a run's transcripts under `~/.claude/projects` say about tokens, tool calls and time, and the only reader the package had, `hooks/lib/transcript-tail.js`, reads the tail of one file for a hook that must stay dependency-free CommonJS. We decided there is one shared reader, `deck/transcripts.mjs`, owned by the run that lands first (run analytics) and imported by the other. It counts each `message.id` once, keeping the entry with the largest `output_tokens`, because Claude Code writes an assistant message as one entry per content block and the input and cache fields repeat on each: one transcript held 373 entries for 223 messages, so a sum over entries roughly doubles the input. It keys an agent by `agentId` across sessions and takes its role from the earliest meta that carries a description, because an agent resumed after `/clear` writes a second file whose meta is reduced to `general-purpose`. And it never returns prompt or tool text: a caller that needs to place an agent in a slice passes needles in (a slice's branch or worktree from the run record) and gets back the needles that matched. Growing `transcript-tail.js` was rejected because the hook runs on every tool call; counting by entries with a `stop_reason` was rejected because split entries do not always carry one; returning the brief for the caller to search was rejected because transcripts hold secrets and every caller would then have to be careful.

**Consequences**: no output built on the reader can leak transcript content, by construction rather than by care, and the price of that is an interface shaped around needles rather than text. Attribution depends on the pilot's briefs naming a slice's worktree or branch; an agent whose brief names neither lands in `unattributed`, shown and not guessed. The transcript format is Claude Code's and undocumented, so a change to it breaks one module and its fixtures, not two features.
