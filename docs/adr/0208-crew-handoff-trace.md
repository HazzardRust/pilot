---
status: proposed
date: 2026-11-21
tags: [hooks, deck, handoff]
supersedes: []
superseded_by: []
paths: [hooks/lib/wrapper-log.js, deck/trace.mjs, deck/server-tools.mjs, bin/pilot.mjs, docs/design/crew-handoff-trace/architecture.md]
---
# A hand-off is traced by what sees each step

We decided that every step of a hand-off writes one trace row, `{at, step, kind, item, ticket, agent, session}`,
to `handoff-trace.jsonl` beside the deck's store, and that each row is written by the code that observes the step,
never by an agent remembering to; and that the deck closes a crew-handoff at the `co-pilot` grant of its ticket.
`pilot trace <itm_id>` reads that file, not the deck, and ends with `done` or `waiting: <next step>, <age>`.

## Context

On 2026-11-19 a co-pilot's crew-handoff stayed open for 1h44m and its ticket sat released with no successor for
1h05m, until the user pressed Handoff failed. Nothing anywhere recorded which step had not happened. The sequence,
rebuilt from the session transcripts and the deck store (times UTC; old pilot session 7cfa40fe, new session
6aa1c273, both in `~/.claude/projects/C--Users-Hazzard-Projects-pilot/`; deck store `~/.claude/pilot/deck.json`):

| Step | Time | Source |
| --- | --- | --- |
| Guard's advisory notice to co-pilot `a4a0177a` (226k) | ≤07:29:01 | Co-pilot's hand-back text only. No guard log line exists: **no record** |
| crew-handoff `itm_7df7fdd3e4a3` posted | 07:29:01 | deck.json item `postedAt`. Not shown to the pilot, and its title is the only place the ticket appears |
| Co-pilot hands back `paused` | 07:29:53 | 7cfa40fe:1512 |
| `deck_ticket release` / `co-pilot` on itm_64084fb89990 | 07:30:04 / 07:30:07 | 7cfa40fe:1529, 1533 |
| Successor `acf7b6eb` spawned | 07:30:25 | 7cfa40fe:1543. The brief is a long prose brief, not the three ids. The item id is absent |
| Item resolved | — | **no record**. Grep of 7cfa40fe for the id: nothing |
| Successor hands back early, one implementer still live | 07:46:20 | 7cfa40fe:1777 |
| Pilot directs the ticket itself and starts no third co-pilot | 07:46:45 | 7cfa40fe:1804. This is off the Yellow rule |
| `deck_ticket release` on itm_64084fb89990 | 08:08:31 | 7cfa40fe:1967. The reply reads `Yellow: empty, next itm_3997fa784e4b`, with no successor named |
| Pilot `handoff` `itm_fa7aaaa382a7` posted | 08:08:47 | deck.json. The body names only handoff-cache |
| New session's SessionStart | 08:08:57 | 6aa1c273:11. Lanes read `co-pilot: empty → next itm_3997fa784e4b`, and no owed line names the crew-handoff |
| New session reads `itm_7df7fdd3e4a3`, then acts on nothing | 08:09:25 | 6aa1c273:103 |
| User presses Handoff failed | 09:13:19 | deck.json `replies[0]` |
| `co-pilot` grant, successor spawned, item resolved | 09:14:01–09:14:44 | 6aa1c273:490, 526; deck.json `resolvedAt` |

**Cause, as recorded.**

- **C1.** Nothing in code joins a crew-handoff to its ticket's grant. The item has no `ticket` field
  (`deck/items.mjs:280`), and closing it is a prose clause the pilot skipped. So the item stayed open through a
  successful re-spawn.
- **C2.** At 08:08 the ticket was released with no successor, and nothing named it as owed one. The successor lane
  line (`deck/lanes.mjs:136`, commit 377439c8, never-stuck-2) would have said
  `co-pilot: empty → successor itm_64084fb89990`. The running deck and hooks were the plugin cache
  (`~/.claude/plugins/cache/pilot/pilot/0.9.9`), written at 2026-11-18 23:53 UTC, 20 minutes before never-stuck-2
  merged into `pilot`. The version stayed 0.9.9, so nothing refreshed the copy.
- **C3.** No owed or nag line covers an open crew-handoff (`deck/owed.mjs:15`). A session that reads one is told
  nothing about it.
- **Not recorded.** Why the successor was made to hand back early, and what became of implementer `ae331a33`'s
  report after the 08:08 hand-off.

## Decision

- **L1 Each step's row is written by the code that observes it**: the deck for `posted`, `granted`, `released`,
  `resolved`, `failed` and `started`; hooks for `stopped`, `spawned`, `handed`, `cleared` and `submitted`. C1 is an
  agent skipping prose; a log that relies on agents has the same hole.
- **L3 The deck closes a crew-handoff at the `co-pilot` grant of its ticket**, not at the spawn. The grant is a deck
  write the deck sees; a spawn that then fails leaves a live grant with no crew, which the 20-minute idle wake
  already catches.
- **A row carries ids, step names, kinds and times only** (spec 7). `step(row)` in `hooks/lib/wrapper-log.js` drops
  every other field, so no body, title or prompt reaches the file; it shares `log`'s one rotation, to `.old` at
  512 KB (spec 8).
- **The file sits beside the deck's store** (`deckDir()`, `~/.claude/pilot/` by default; A1), so a scratch deck
  traces into its own directory and a test run cannot reach the real file.

## Rejected

- *Agents logging steps with a tool call*: the same hole as C1.
- *The spawn hook resolving the item*: a hook writing deck state from a prompt it parsed.
- *Rows on the deck item*: lost on the guard's fail-open path, and they grow the deck store.
- *Extending `wrapper.log` text*: unstructured, clipped at 300 characters.

## Consequences

- `pilot trace <id>` names the missing step and its age; on the 11-19 rows at 09:13 it reads
  `waiting: granted, 1h05m`.
- The trace survives a deck that is down for the rows hooks write, since it is a file and not an API.
- About 3,000 rows per 512 KB file, one `.old` kept; older steps are gone.
