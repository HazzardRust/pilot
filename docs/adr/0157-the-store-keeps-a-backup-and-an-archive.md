---
status: accepted
date: 2026-10-17
tags: [deck, store, durability]
supersedes: []
superseded_by: []
paths: [deck/store-recovery.mjs, deck/store-core.mjs, deck/test/store-recovery.test.mjs, docs/design/store-durability/architecture.md]
---
# The store keeps a backup and an archive

We decided every deck.json write first keeps the store it replaces as `deck.json.bak`, a read that finds the store corrupt recovers from that backup on its own and says so, and closed items older than 30 days move to month files the daemon writes before the live store.

## Context

The deck keeps everything in one file, `~/.claude/pilot/deck.json`. A bad write had no backup to fall back to: a corrupt store has happened (`deck.json.corrupt-2026-09-14`, 10 bytes, moved aside by hand), and until then the deck refused every request. The store also grows without bound, 5.7 MB and 1495 items on 2026-10-17, 87 of them open. Ticket `itm_06d54e3b798b`; the design is `docs/design/store-durability/architecture.md`.

## Decision

- **L1** The backup is a hard link of the current deck.json renamed onto `.bak`, taken only when the file's size and mtime (and inode) match what this process last parsed; a copy where linking fails.
- **L2** Recovery and restore set the old file aside under a dated name, `-2`, `-3` on a clash, never overwriting or deleting one.
- **L3** A version the deck does not read is never recovered from `.bak`; it keeps the existing refusal.
- **L4** The archive pass runs from the daemon's `main`, at start and then on a 24-hour unref'd timer, never from `writeDeck`.
- **L5** Archive files are written first and the live store second; a pass drops a duplicate by id.

The user answered each assumed decision on 2026-10-17, every one as its default:

| # | Decision |
|---|---|
| A1 | Closed items are archived after 30 days. |
| A2 | A reply to an archived thread is refused, naming a new thread. |
| A3 | The archive pass runs at daemon start and daily, keeping open items, items showing a notice and tickets a live item names. |
| A4 | Recovery from `.bak` is automatic and logged. |
| A5 | `pilot store restore` refuses while a daemon serves. |
| A6 | The rename retry lives in the shared atomic-write helper, so every caller gains it. |
| A7 | One backup generation; every file sits beside deck.json. |
| A8 | One archive file per month of close. |
| A9 | History and the reports tab list live items only. |

## Rejected

- *Copying the 5.7 MB store on every write*: a hard link costs nothing until the write replaces the file.
- *Rotating unconditionally*: a corrupt file could then become the backup.
- *Overwriting or deleting the corrupt file*: the bytes are the only evidence of what broke, and a restore would not be reversible.
- *Treating a newer version as corruption*: it would roll a newer store back silently.
- *Archiving on every write*: it would move the test fixtures dated September and run inside every post.
- *Refusing until the user restores by hand* (A4), *seven daily backups* (A7), *one growing archive file* (A8).

## Consequences

- A truncated deck.json costs the user at most the one write it lost; the bad bytes stay beside it as `deck.json.corrupt-<date>` and deck.log names both files.
- A file changed behind the deck's back is never backed up, so `.bak` may be older than the store an external edit replaced.
- A backup that cannot be taken is logged and the write goes ahead, keeping the older backup.
