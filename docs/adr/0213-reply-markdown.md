---
status: proposed
date: 2026-11-24
tags: [deck, rune, reply, markdown]
supersedes: []
superseded_by: []
paths: [deck/rune/src/preview.rs, deck/rune/src/regions/reply.rs, deck/rune/src/table.rs, deck/rune/Cargo.toml, docs/design/reply-markdown/architecture.md]
---
# The reply box previews markdown by decoration, off the caret's line

We decided that the Rune deck's reply box renders its markdown as you type, Obsidian-style: every line the caret
or selection is off shows bold, italic, code, headings, lists and links in the thread's look, and the line being
edited stays raw. The preview is decorations painted over the field, computed each frame from the draft by
`preview::spans(&TextEdit, dark)`; the draft itself is never changed, so what is sent is what was typed.

## Context

The reply box was a plain multi-line `text_input`: markdown typed there showed as stars and backticks until it was
sent and the thread rendered it. Rune paints styled byte ranges over a field with `.decorations(Vec<Span>)` without
touching its `TextEdit`, and a `Span` can change weight, slant, family, size, colour, fill and underline but cannot
hide a character. rune-kit's markdown parser reports spans over its *rendered* text only; its source map is private.

## Decision

- **L1** Parse the whole draft with `pulldown-cmark` 0.13's `into_offset_iter`, the crate and options the thread's
  renderer uses, then drop spans on raw lines and clip spans that cross one. Rejected: rune-kit's `parse` (rendered
  offsets only); a hand-written line lexer (a second dialect drifting from the thread's); parsing each line alone
  (breaks a paragraph's emphasis).
- **L2** Rendering is decorations only: `preview::spans` takes `&TextEdit` and returns `Span`s, so it cannot change
  the draft, and the sent text is the typed text by construction. Rejected: rich `TextEdit` marks, which hold
  formatting beside the string and would make the shown and the sent text differ.
- **L3** One seam, `preview::spans(&TextEdit, bool)`, called once by `regions::reply`. Rejected: inline in
  `reply::draw` (testable only through a runtime).
- **L4** Raw lines are logical lines (runs between `\n`); with a selection, every line it touches. An unfocused box
  renders every line. Rejected: wrapped rows (a long paragraph would flicker as the caret crosses rows).
- **L5** The look comes from `theme` tokens matching `theme::markdown_style`: code mono on the `rule` fill, markers
  in the `quiet` ink, headings `type_::HEADER`, links the link colour underlined. No literal colour or size.
  Rejected: rune-kit's `MarkdownStyle` (private fields).
- **L6** Links are inert while composing: a span, no press handler, no opener. Rejected: Ctrl+click opens (a new
  opener and trust surface for typed text).
- **L10** The draft is prose parts and grids in order: `Local::draft` stays the first prose part, and
  `Local::tables: Vec<(Table, TextEdit)>` holds each grid with the prose part after it. `Local::text()` joins them
  and is all `send`, `press` and the taken-reply clear read. The Table button inserts a 2 × 2 grid after the caret's
  line, splitting that prose part, and the caret goes to the first header cell. Rejected: one `TextEdit` holding
  the pipe syntax (Rune cannot draw a grid inside a field or hide its bytes); a `Vec<Block>` replacing `draft`
  (every test that sets `draft` changes, for no behaviour).
- **L11** `Table::markdown()` writes canonical GFM: `| a | b |`, a `| --- | --- |` delimiter, `|` in a cell as `\|`
  and every other byte as typed, so a cell's markdown means what it means in prose; `Local::text()` puts one blank
  line between a table and non-empty prose. Rejected: column padding to align pipes (bytes nobody reads in the
  thread); alignment markers (no control sets them).
- **L12** Cells are single-line `text_input`s, one per cell, keyed `cell-<t>-<r>-<c>`, each with an `on_submit` of
  its own so Return in a cell never presses Reply. Rejected: Rune's `grid` (a terminal screen, no fields); one
  field per row with pipes hidden (decorations cannot hide bytes).

## Consequences

- Markers stay on screen in the quiet ink (`**bold**` shows faint stars), since a span cannot hide bytes.
- Spans are recomputed per frame, so the field's layout is re-keyed as the caret moves between lines; the cost is
  bounded by the spec's 16 ms budget for a 300-line draft.
- The chat composer is unchanged; giving it the same preview is one `.decorations` call.
