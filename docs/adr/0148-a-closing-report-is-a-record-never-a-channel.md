---
status: proposed
date: 2026-10-14
tags: [deck, reports, replies]
supersedes: []
superseded_by: []
paths: [deck/items.mjs, deck/store-items.mjs, deck/ui/render-cards.mjs, deck/store-runs.mjs, hooks/lib/deck.js, agents/pilot.md]
---
# A closing report is a record, never a channel

We decided that a closing report takes no reply from the user: the store refuses one, whoever sends it, and points at the repository's chat; the report's page draws no reply box; and a reply stored on one is never handed to a pilot.

## Context

The user, on itm_043485a97070 (2026-10-14):

> at one point i had instructions given through a closing report. we need to make sure that closing reports are never considered as pathways to correspondence to a user.

A closing report had a reply box on its thread page, a reply typed there woke the pilot's `pilot wait` and held its Stop gate, and nothing stopped a report from asking the user to act and answer. The report is the run's record; anything that needs the user is its own thread.

## Decision

- **A record kind** (report-record L2): `RECORD_KINDS` in `deck/items.mjs` holds `report` alone, read through `isRecord`. A ticket still takes the comments ticket-making's Add acts on.
- **One refusal in the store** (L1): `addReply` refuses a reply on a record before its repeat check and before any reopen, so the page, a curl, a script and an MCP caller meet the same words: `a closing report is a record and takes no reply (ADR 0148); say it on the chat: /thread/<chat id>`. A closed report stays closed (L6).
- **No reply box** (spec 2): the report's thread page draws no reply form and no Send.
- **Delivery skips records** (L3): a reply already stored on a report reaches no `pilot wait`, Stop gate or inbox line.
- **A report that asks is refused at post** (L4): a body line or step that asks the user anything is a gap, and so is the pilot's own worktrees reply if it asks.
- **A posting rule, not a storage rule** (L5): stored reports are not re-checked or rewritten; their pages lose the box at once because the page reads the kind.

## Rejected

- *Hide the reply box only*: a POST still lands, the incident's own path.
- *Reuse `isStanding`*: it would silence a ticket's comments, which the pilot acts on.
- *Trust the refusal alone and leave delivery as it is*: a reply written by an older daemon or by hand would still reach a pilot.
- *Say it in `agents/pilot.md` only*: prose is skippable; a refusal is not.

**Consequences**: the only reply a closing report carries is the pilot's worktrees reply; the user says anything about a run on the chat or in a thread of its own, and the refusal tells them where.
