---
status: accepted
date: 2026-10-13
tags: [hooks, deck, permissions]
supersedes: []
superseded_by: []
paths: [hooks/permission-denied.js, hooks/lib/blocked.js, hooks/hooks.json, docs/design/gate-no-stall/architecture.md]
---
# A blocked step is a blocking item

We decided that a call auto mode denies in any pilot lane (the pilot session or a `pilot:` crew agent) during a live run becomes one `blocking` question on the live ticket, posted by a `PermissionDenied` hook through `hooks/lib/blocked.js`, and that the same command denied again posts nothing.

## Context

On 2026-10-12 `gh pr ready 576` after a signed Gate 2 was denied three times; the third denial escalated to a terminal prompt the deck cannot show, and the run froze. The deck is where the user is during a run, and a denial that only shows in the terminal is a denial nobody sees.

## Decision

- `PermissionDenied` is the only signal Claude Code gives within the hook turn, so it carries the post (L1); a denied call stays denied, never `retry`.
- The item's shape, the live-ticket lookup and the repeat claim live in one module, `hooks/lib/blocked.js`, used by this hook and by `permission-refuse.js` (L2).
- A repeat is claimed by a file under `os.tmpdir()/pilot-blocked/`, keyed by a hash of session id and command, as the context alert claims its advisories (L3).
- The item is a `question`, `blocking: true`, on the live ticket, options `I ran it` / `Skip it`, recommended `Skip it`; with no live ticket it is posted unblocking without `ticket`; with no live run or a silent deck, nothing is posted and the hook fails open (L4).
- Every pilot lane posts, crew agents included, which delivers part of itm_c310da07c9c6 spec 5 by mechanism (L9).

## Rejected

- *The Stop hook scanning the transcript*: a turn late, after the prompt has already stalled the run.
- *Asking the deck for open items before posting*: a second 1.5 s request inside a 5 s hook.
- *The pilot session only*: two hooks for one job, and the crew's denials stayed invisible.
