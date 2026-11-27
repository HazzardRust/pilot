---
status: proposed
date: 2026-11-25
tags: [deck, rune, ui, scroll]
supersedes: []
superseded_by: []
paths: [deck/rune/src/app.rs, deck/rune/src/layout.rs, deck/rune/src/regions/]
---
# Rune's side panes follow the HTML deck, and its centre is one viewport

We decided that the Rune deck's side panes read as the HTML deck's, drawn from data their view modules resolve, and that the centre column scrolls as one viewport per screen and thread under a fixed tabs header.

## Context

The Rune deck (ADR 0206) landed with side panes that read differently from the HTML deck's, and with a centre column that did not scroll at all: "i cant scroll to the bottom of a thread, i cant scroll at all". `app::center` was a plain column, and `layout::strips` gave it no `min_h(0)`, so Rune sized it to its content and the window clipped the rest. Rune needs a bounded height and `min_h(0)` on every flex column between it and a viewport.

## Decision

- **L2** The HTML deck (`deck/ui/`) is the reference and is not edited; the Rune panes move to it.
- **L3** The data a pane needs comes from its view module (`deck/view/<region>.mjs`), every string resolved there (ADR 0206 L2); Rust draws.
- **L4** The centre is one viewport, keyed `app::CENTRE` plus the screen and the thread id. A thread's viewport sticks to its bottom, so a thread opens at its newest message and follows new ones while the reader is there; every other screen opens at its top. The key changing per thread is what makes a newly opened thread start fresh, and staying the same across a live refetch is what keeps a reader scrolled up in place. The tabs header stays above it, fixed.
- **L5** One slice per pane, each owning its region file, view module and tests; the empty texts land last, since one table pins them all.
- The keys: with nothing focused, Page Up and Page Down page the centre, Home and End go to its ends, and Up and Down move it 40 px. Left and Escape still leave a thread and Alt+arrows walk the history. A focused control leaves the page keys to Rune's own routing; a text field in the centre keeps every key, and the page keys it passes on are dropped rather than paging the centre (spec 8a).
- The bar is Rune's overlay bar, shown while scrolling and draggable then (A3, the user's pick).

## Rejected

- A viewport per region of the centre: the reply box and the history would scroll apart from the thread.
- The header scrolling away with the content, and Space as a page key (it types).
- Aligning both decks to a third look (L2).
- Rust deriving tab names or groups from raw ids (L3).
- One empty-text edit per pane slice: four parallel slices editing one shared table (L5).

## Consequences

- Up and Down no longer reach anything else while nothing is focused.
- A thread opens at its bottom, unlike the HTML thread page, which opens at its top; a long ask's first lines need a scroll up.
- A new text field in the centre joins `app::FIELDS`, or its Page Up and Page Down page the centre.
