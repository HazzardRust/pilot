---
status: proposed
date: 2026-11-19
tags: [gate, tests, deck]
supersedes: []
superseded_by: []
paths: [scripts/gate.mjs, scripts/test/gate-home-store.test.mjs, deck/store-dir.mjs, deck/store-core.mjs, docs/design/home-store-guard/architecture.md]
---
# The gate catches a write to the home deck store

We decided that the gate (`node scripts/gate.mjs`, behind `npm test`, `test:changed`, `test:quiet`, `coverage` and
every command that runs them) stats the home store `~/.claude/pilot/deck.json` before the suite and after the census,
and is red, naming the file, when it changed while no live deck was up.

## Context

During a QA pass the live deck store was stamped by a test or tool run nobody identified. Tests stay off the home store
only by opting into a fake HOME file by file, so a `scripts/` test that imports neither helper runs against the real
one. The live deck daemon is not a gate descendant and writes `deck.json` on every post, so a bare change check is red
on most runs on a machine where the crew posts during a gate.

## Decision

- **L1**: one hook point, `runGate`, armed only by the CLI entry passing `homeStore`. With no `homeStore` it behaves
  as before, so the existing gate tests stay unedited and never stat the real store. Rejected: hooking `integrate.mjs`
  and `sync.mjs` separately, three places to drift.
- **L2**: the change signal is `exists`, `mtimeMs` and `size` from `fs.statSync`. Rejected: a content hash, since the
  live deck changes content just as it changes mtime, so a hash adds no signal and costs a full read.
- **L3**: the home store check probes the live deck (`deckPidNow`) after the suite, and only when the stat changed;
  the census keeps its own probe for leftovers. Rejected: a probe before and after, a node spawn on every clean run.
- **L4**: the write guard (S2) adds no line to `store-core.mjs`: its `store-dir.mjs` import grows a name and
  `storeFile()` becomes `refuseGateHomeWrite(storeFile())`. Rejected: splitting `store-core.mjs`.
- **A1** (assumed, then answered by the user as the default): a stray write is told from the live deck's own by a
  write guard in the deck store plus this stat backstop. The backstop is red with no live deck, and with a deck up, or
  a probe that cannot tell (`deckPidNow()` undefined), it prints
  `home store changed: <path>; live deck <pid|unknown> up` and keeps the suite's status. Rejected: a stat check alone,
  red on most runs here; a fake HOME for the whole suite, which breaks git's global config for fixtures.

## Consequences

A clean gate prints nothing new. A test that writes the home store with raw `fs` while the deck is up only warns; the
write guard of S2 names a write through the deck store. A write between the two stats that restores mtime and size
exactly is not seen. A stat that fails other than by absence throws, so the gate is never green by not looking.
