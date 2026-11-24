---
status: proposed
date: 2026-11-24
tags: [deck, rune, reply, markdown]
supersedes: []
superseded_by: []
paths: [deck/rune/src/preview.rs, deck/rune/src/regions/reply.rs, deck/rune/Cargo.toml, docs/design/reply-markdown/architecture.md]
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

## Consequences

- Markers stay on screen in the quiet ink (`**bold**` shows faint stars), since a span cannot hide bytes.
- Spans are recomputed per frame, so the field's layout is re-keyed as the caret moves between lines; the cost is
  bounded by the spec's 16 ms budget for a 300-line draft.
- The chat composer is unchanged; giving it the same preview is one `.decorations` call.
