---
status: proposed
date: 2026-11-20
tags: [deck, rune, rust, ui, view]
supersedes: []
superseded_by: []
paths: [deck/rune/, deck/view/, deck/server-routes.mjs]
---
# The deck gets a native Rune client that draws one server-computed view over loopback

We decided that the deck's UI is rebuilt as a native Rune window, `deck/rune/`, an HTTP client of the daemon on
loopback that draws every region from one JSON view the daemon computes, `GET /api/view`; the HTML deck stays as the
fallback and the parity reference. The design is `docs/design/rune-deck-ui/architecture.md`.

## Context

The user likes the deck's colours, layout and features, but it feels blocky and carries small bugs, above all slow
and inconsistent state updates (itm_b7272bb6e63c). They asked for it redone in Rune (anomalyco/rune), for this
repository only: Rune is not to become a pilot feature other projects are pushed onto.

## Decision

- **The daemon stays the only writer** (L1): the Rune deck talks HTTP to 127.0.0.1, never reads a store file.
- **One view, computed on the server** (L2): `viewOf(readDeck(), query)` calls the derivations the HTML deck
  already uses and resolves every display string, so a new item kind draws with no Rust change (spec 11).
- **Writes reuse the form routes** (L3) with the bearer and `Origin`; no new write route.
- **The HTML renderers are left as they are** (L4) and stay the parity reference.
- **One file per region on both sides** (L5), stubbed in the first slice, so region slices own disjoint files.
- **Rune pinned by rev** (L6) with its `[patch.crates-io]` block and a committed `Cargo.lock`.
- **Rust tests run against a real scratch daemon** (L7), never a fake server.
- **Loopback only** (spec 9): the client refuses a host other than `127.0.0.1`, `localhost` or `[::1]`, uses no
  proxy and follows no redirect, and reads the secret from its file per request without printing it.

## Consequences

Two UIs exist; a new kind draws in both, eased by L2. Building the Rune deck needs Rust and the C++ Build Tools,
which only this machine has; elsewhere the HTML deck is what opens (A2, A3).
