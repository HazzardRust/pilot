# The reply box renders markdown as you type

Ticket `itm_864c47669387` · slug `reply-markdown` · base `origin/feat/rune-deck-ui` 415914f8 (lands on `pilot`
first) · ADR NNNN (`docs/adr/NNNN-reply-markdown.md`, S1) · surface: true (spec 1, 2, 7-9, 11-12 are looks; the
implementer's live check feeds the walkthrough) · re-cut of Gate 1 itm_f65f56809e26 (2 slices) for tables

## 1. Problem

The user wants the Rune deck's reply box to behave like Obsidian's live preview: markdown renders while they type,
the line the cursor is on stays raw and renders as soon as the cursor moves to another line, and what is sent is
the raw text, unchanged. Added on the ticket: insert a table and type straight into its rendered boxes, never its
pipe syntax, "because i cant be bothered memorising that formmatting".

## 2. Spec

*Agreed by the user on itm_bbf3e33c48d2 ("Agree"), lines 1-7 as proposed; line 3 reworded and lines 8-13 added by
the re-cut, assumed until Gate 1 (the user's table ask on the ticket, folded in on itm_6476f9c2fa0d).*

| # | Behaviour | Evidence | Bar |
| --- | --- | --- | --- |
| 1 | Every line the cursor is not on renders bold, italic, inline code, headings, list markers and links, in the look the thread gives the same markdown once sent. | `preview::spans` test per kind; `--snap` PNG of the box; the user's look | 6 of 6 kinds styled |
| 2 | Every line the caret or the selection touches stays unstyled; moving the caret to another line styles the old one and unstyles the new one in the same frame. | `preview::spans` test moving the caret line 1 → line 2; the user's look | 0 spans on a raw line; the other line's spans all present |
| 3 | What is sent is the typed text, byte for byte, outside tables; with no table inserted it is the draft itself. *re-cut* | `reply::Local::send` test after typing markdown and moving the caret; the S3 pin with a table between two prose parts | 0 bytes differ in prose |
| 4 | A rendered link is never followed: a click places the caret (the line turns raw); nothing opens, nothing posts. *security* | test: a press on a rendered link's text posts no `Action`; read: `Span` carries no link and the crate has no URL opener | 0 actions; 0 openers |
| 5 | With the box not focused, every line renders. *assumed A3* | `preview::spans` test with `focused = false` | 0 lines without their spans |
| 6 | No input lag: a long draft's spans are computed within one frame. *practitioner: editor engineer, who budgets per-keystroke cost* | timing test in the gate's build | 300-line draft < 16 ms |
| 7 | What styles while typing is what styles once sent: the same parser and dialect the thread uses. *practitioner: editor designer, who checks the preview against the output* | read: `pulldown-cmark` 0.13, rune-kit's own; snap of a draft beside the same text sent | 0 kinds styled in one and not the other |
| 8 | A Table button in the reply box inserts an empty grid below the caret's line: a header row and one body row, two columns, the caret in the first header cell. *assumed A5, A6* | `reply::Local::insert_table` test; the user's look | 1 press → 1 grid of 2 × 2 cells |
| 9 | Typing goes straight into the rendered cell boxes; an inserted table never shows its pipe syntax in the box. | test typing into cell (0, 0) through `box_drawn`; `--snap` | 0 `\|` drawn for an inserted table |
| 10 | The reply is sent with the table as GFM table syntax the thread renders as a table; a `\|` typed in a cell is escaped. *practitioner: markdown tool author, who round-trips through the reader* | test: pulldown-cmark with `ENABLE_TABLES` over `Local::text()` reads back every cell; the sent reply in the thread | 0 cells differ, one holding `\|` |
| 11 | Tab and Shift+Tab move between cells; Return moves down a row, adding one under the last; Up from the header and Down from the last row put the caret in the text before or after. | focus-key test per move | 6 of 6 moves land |
| 12 | Controls under the grid add a row, add a column, remove the caret's row, remove its column, and delete the table. *assumed A7* | test per control on the grid's size | 5 of 5 |
| 13 | A cell the caret is not in renders bold, italic and code as a line off the caret does. *assumed A8* | `preview::spans` on a cell's `TextEdit` | 3 of 3 kinds |

## 3. Findings

- `deck/rune/src/regions/reply.rs:405-416` (at 415914f8): the box is `text_input(&local.draft, type_::BODY)`,
  multi-line, no `on_submit` and no `default_button` (Shift+Return makes a line; plain Return is the walkthrough's to
  check). `Local::draft` is read at `:109`, `:163`, `:168`, `:197-198` (press, send, the taken-reply clear); the
  tests set it directly (`tests/reply.rs:23`, `live.rs:125`, `nav.rs:62`, `thread.rs:241`).
- Tables: Rune `el/input.rs:59-75`: a `text_input` is one text element with no child slot, so a grid cannot sit
  inside it. `el/grid.rs` is a terminal screen (painted monospace rows), not a layout of fields. What works: a
  `text_input` per cell in `row()`/`col()` (or `equal_columns(n)`, `el/layout.rs:550`), each routed by
  `.on_edit(impl Fn(&mut S) -> &mut TextEdit)` (`el/text.rs:605`, a closure, so it can index a cell),
  `.single_line()` (`:389`), `.on_submit` (`:615`) for Return, `.on_key` seeing keys before focus navigation
  (`el/focus.rs:84-93`) and `tx.focus(key, ring)` (`el/tx.rs:507`) to place the caret.
- `rune-kit/src/markdown/parser.rs:98`: the thread parses with `ENABLE_TABLES`; `markdown/table.rs:79` draws a table
  with a border and a header fill. A GFM table in the sent text renders as a table in the thread.
- No crate is a live-preview editor for Rune (explorer: iced-markdown-editor is iced only; Ferrite, mdoxide,
  mdeditor are egui apps; egui_commonmark renders only). Hand-built.
- Rune `el/text.rs:65-83`: `.decorations(Vec<Span>)` paints styled byte ranges over a `text_input` "without
  mutating `TextEdit`", offsets in `edit.text` bytes, shifted across an IME preedit.
- `rune-text/src/layout/span.rs:12`: `Span` styles weight, italic, mono, size, colour, background, underline. It
  cannot hide or replace a character: markers stay on screen (A1).
- `rune-kit/examples/rich_editor.rs:81`: the per-frame decoration pattern the ticket named; it is this one.
- `rune-kit/src/markdown/parser.rs:83`: `parse` returns rendered text with spans over *rendered* bytes; the
  source map (`parser/map.rs`) is crate-private, so it cannot place spans on the draft.
- `deck/rune/Cargo.lock:2528`: `pulldown-cmark` 0.13.6 is already built, as rune-kit's markdown parser; its
  `into_offset_iter` gives source byte ranges. Depending on it adds no crate.
- `deck/rune/src/theme.rs:390`: `markdown_style` is the thread's look: headings `type_::HEADER`, code at body size in
  the mono family. `MarkdownStyle`'s fields are private, so the preview takes the same tokens from `theme`.
- `rune-edit/src/lib.rs:80`: `TextEdit { text, anchor, focus, focused }` are public; `range()` gives the ordered
  selection; the runtime keeps `focused` in step (`runtime/input/focus.rs:57`).
- No URL opener anywhere in `deck/rune/src`; a decoration span has no press handler.
- `deck/rune/tests/reply.rs:21,371`: `typed()` and `box_drawn()` harnesses the new tests reuse.

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `preview` (new, `src/preview.rs`) | `spans(edit: &TextEdit, dark: bool) -> Vec<Span>` | the pulldown-cmark walk, the raw-line choice, clipping, the look per kind | in-process |
| `table` (new, `src/table.rs`) | `Table::new(rows, cols)`, `cell_mut(r, c) -> &mut TextEdit`, `add_row`, `add_col`, `remove_row`, `remove_col`, `size()`, `markdown() -> String` | the cell grid, pipe escaping, the delimiter row; the only writer of table syntax | in-process |
| `reply::Local` | `send(&mut self, id) -> Option<Action>` (unchanged), `text(&self) -> String`, `insert_table(&mut self)` | prose parts and tables joined into the one sent string; the split at the caret | in-process |
| `reply::draw` | `draw(v, local, cx) -> El` (unchanged signature) | `.decorations(preview::spans(..))` per prose part and cell; the grid and its controls | in-process |

Deletion test: deleting `preview` puts the parser walk and line logic into `reply::draw`, untestable except through
a runtime, and again into chat if A2 flips. It earns its keep. Deleting `table` spreads escaping and the delimiter
row into `Local::text` and the row/column edits into `draw`'s handlers: it earns its keep. `Local::text` is the one
join `send`, `press` and the taken-reply clear all read; inlining it three times is the drift spec 3 forbids. No
shallow module to fold; no fold slice.

## 4. Ubiquitous language

- **Draft**: everything the box holds: its prose parts and tables. `Local::text()` is its sent form, the only thing
  ever sent; with no table it is `Local::draft.text`.
- **Prose part**: one `TextEdit` of typed text: `Local::draft` first, then the one after each table.
- **Grid**: an inserted table as drawn: one single-line field per cell, never pipe syntax.
- **Line**: a run of a prose part between `\n`s (a logical line, not a wrapped row).
- **Raw line**: a line the caret or selection touches while the box is focused; it gets no span.
- **Rendered line**: any other line; it gets the preview's spans.
- **Marker**: the markdown syntax characters (`**`, `_`, `` ` ``, `#`, `- `, `[`, `](url)`).

## 5. Locked decisions

- **L1** Parse the whole draft with `pulldown-cmark` 0.13's `into_offset_iter`, then drop spans on raw lines and
  clip spans that cross one. Rejected: rune-kit's `parse` (rendered offsets only); a hand-written line lexer (a
  second dialect drifting from the thread's, spec 7); parsing each line alone (breaks a paragraph's emphasis).
- **L2** Rendering is decorations only: `preview::spans` takes `&TextEdit` and returns `Span`s, so it cannot change
  a prose part or a cell (spec 3, compile-time). Table syntax is written by `Table::markdown()` alone, from the
  cells (re-cut). Rejected: rich `TextEdit` marks (`toggle_mark`), which hold formatting beside the string and would
  make the shown and the sent text differ.
- **L3** One seam, `preview::spans(&TextEdit, bool)`; `reply.rs` calls it once. Rejected: inline in `reply::draw`
  (testable only through a runtime).
- **L4** Raw lines are logical lines; with a selection, every line it touches. Rejected: wrapped rows (a long
  paragraph would flicker as the caret crosses rows). A table made by the Table button is always a grid, caret in
  it or not; pipe syntax typed into a prose part stays text (A4).
- **L5** The look comes from `theme` tokens matching `theme::markdown_style`: headings `type_::HEADER`, code mono
  with the `rule` fill, links the link colour underlined, markers `quiet`; a grid's cell borders the `rule` colour
  and its header row the thread table's header fill and weight. No literal colour or size. Rejected: rune-kit's
  `MarkdownStyle` (private fields).
- **L6** Links are inert while composing: a span, no handler (spec 4). Rejected: Ctrl+click opens (a new opener and
  trust surface for typed text).
- **L8** QA runs the native Rune window built from `feat/reply-markdown` against a scratch deck with seeded threads;
  no database, nothing kept (the user, itm_7e0fff09827d). Rejected: the user's live deck (a QA draft could post to a
  real thread).
- **L9** No grilling round (the user, itm_620aace73f0b, "No grilling"): the spec and A1-A3 as answered stand.
  Rejected: a grilling round over the design.
- **L7** Recorded as ADR NNNN (`docs/adr/NNNN-reply-markdown.md`), written by S1; the landing numbers it. S3 adds
  L10-L12 to it.
- **L10** The draft is prose parts and grids in order: `Local::draft: TextEdit` stays the first prose part, and
  `Local::tables: Vec<(Table, TextEdit)>` holds each grid with the prose part after it. `Local::text()` joins them
  and is all `send`, `press` and the taken-reply clear read. Rejected: one `TextEdit` holding the pipe syntax (Rune
  cannot draw a grid inside a field or hide its bytes); a `Vec<Block>` replacing `draft` (every test that sets
  `draft` changes, 7 sites, for no behaviour).
- **L11** `Table::markdown()` writes canonical GFM: `| a | b |`, a `| --- | --- |` delimiter, `|` in a cell as `\|` and
  every other byte as typed, so a cell's markdown means what it means in prose; `Local::text()` puts one blank line between a table and non-empty prose. Rejected: column padding
  to align pipes (bytes nobody reads in the thread); alignment markers (no control sets them).
- **L12** Cells are single-line `text_input`s, one per cell, keyed `cell-<t>-<r>-<c>`; moves are `on_key` and
  `on_submit` on each cell calling `tx.focus`. Rejected: Rune's `grid` (a terminal screen, no fields); one field per
  row with pipes hidden (decorations cannot hide bytes, A1).
- **L13** Questions A4, A5 asked and answered as defaulted; the rest of the re-cut is stashed as A6-A8 (the depth
  answer on record is "No grilling", L9).

## 6. Assumed decisions

- **A1** Markers on rendered lines are drawn in the quiet ink, not hidden. Tradeoff: `**bold**` shows faint stars
  (Typora-like, short of Obsidian). Rejected: near-zero `size` spans to hide them (unproven in Rune, caret steps
  through invisible bytes, `-` still never becomes a dot). Asked: itm_3cadb89e11ae. Answered: "Dim them" (the default).
  Verdict: stands — the user pressed "Dim them" on itm_3cadb89e11ae
- **A2** Reply box only; the chat composer is left as it is. Tradeoff: two composers differ until a one-line
  follow-up. Rejected: chat too (widens the ask). Asked: itm_cf736cb1ad17. Answered: "Reply box only" (the default).
  Verdict: stands — the user pressed "Reply box only" on itm_cf736cb1ad17; no queued ticket claims the chat composer
- **A3** An unfocused box renders every line (spec 5). Tradeoff: the line clicked back into shifts as it turns
  raw. Rejected: keep the last caret line raw. Asked: itm_b5ca8397c90b. Answered: "Render every line" (the default).
  Verdict: stands — the user pressed "Render every line" on itm_b5ca8397c90b
- **A4** Pipe syntax typed or pasted into a prose part stays text; only the Table button makes a grid. Tradeoff: a
  pasted table shows raw pipes in the box (it still renders as a table in the thread). Rejected: converting on caret
  leave (a slice more, and the typed spacing rewritten, so not sent byte for byte). Asked: itm_103d944bd333.
  Answered: "Stays text (default)".
  Verdict: stands — the user pressed "Stays text (default)" on itm_103d944bd333
- **A5** The Table button in the reply's button row is the only way in. Tradeoff: a mouse reach each time. Rejected:
  a keyboard chord as well (one more binding to check against Rune's). Asked: itm_84ac94612962. Answered: "Button
  only (default)".
  Verdict: stands — the user pressed "Button only (default)" on itm_84ac94612962
- **A6** A new table is 2 columns, a header row and one body row, inserted after the caret's line (the prose part
  splits there); the caret goes to the header's first cell. Tradeoff: a wider table takes presses of "+ column".
  Rejected: 3 × 3 (empty cells the user deletes); a size picker (a dialog for one number).
  Verdict: stands — no queued ticket claims the reply box; the size is changed by spec 12's controls
- **A7** Row and column edits are five small buttons under the grid (+ row, + column, − row, − column, delete
  table), acting on the caret's cell, shown only while a cell has the caret. Tradeoff: no keyboard way to delete a
  row. Rejected: a right-click menu (Rune context menus unread); keyboard chords.
  Verdict: stands — the queued side-panes ticket itm_f9162b87414f touches no reply-region file
- **A8** A cell without the caret renders its bold, italic and code through `preview::spans`, as a line off the
  caret does. Tradeoff: one call per cell per frame (bounded by spec 6's budget). Rejected: cells always raw (a cell
  looks unlike the same text in prose).
  Verdict: stands — follows the user's "Render every line" on itm_b5ca8397c90b
- red team (re-cut): walked S3's first behaviour against `reply.rs:405-418`: the box is `col().child(text_input)`, so
  a grid and a second prose field are siblings in that `col`, and `.on_edit` takes a closure, so a cell routes by
  index. Attacked: (1) `send` and `press` read `draft.text` (`:109`, `:168`); missing either sends the prose without
  the table — S3 behaviour 4 pins both. (2) The taken-reply clear compares `posted` to `draft.text` (`:197`); with a
  table it never matched and the box would never empty — S3 behaviour 5. (3) Plain Return in a single-line cell
  calls `on_submit`, otherwise the box's default button (`el/input.rs:53-58`): S4 sets `on_submit` on every cell, so
  Return never sends. (4) A cell key must survive a row removal: keyed by index, the caret re-focuses by `tx.focus`
  after each control, S4 behaviour 3. (5) S2 and S3 both edit `tests/reply.rs` in the old cut: S3's pins go to a
  new `tests/table.rs`, so S2 and S3 share no file and run side by side; S4 needs S3's `table.rs` and grid.
- red team: walked S1's first behaviour against `reply.rs:395` and `el/text.rs:225`: a plain field with
  decorations takes the rich display path, whose byte mapping is identity for a plain draft, so spans land on the
  typed bytes. Attacked: an IME preedit (Rune shifts the ranges), a heading's `size` span changing line height
  under the caret (S2 behaviour 1's look covers it), a multi-byte character at a clip edge (S1 behaviour 3 pins a
  char boundary). Found: per-frame spans re-key layout each frame; spec 6 times only the spans, so S2's Misses
  names the layout cost for QA. Two slices share `preview.rs`, so they are serial, not parallel: no seam half-built.

## 7. Out of scope

Blockquotes, strikethrough, fenced code blocks, images, bare-URL autolinks; the chat composer (A2); hiding
markers (A1); a toolbar beyond the Table button; any change to how a sent message renders in the thread. For
tables: turning typed or pasted pipe syntax into a grid (A4), a keyboard chord to insert (A5), column alignment,
line breaks inside a cell, merged cells, editing a table in a message already sent.

## 8. Slices

Width 2; longest stem 3

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | Walking skeleton: bold, italic and code render off the caret's line, and the draft is sent unchanged | 1, 2, 3, 5, 7 | `deck/rune/Cargo.toml`, `Cargo.lock`, `src/lib.rs`, `src/preview.rs` (new), `src/regions/reply.rs`, `tests/preview.rs` (new), `tests/reply.rs`, `docs/adr/NNNN-reply-markdown.md` (new) | – | `pilot:rust-reviewer`, `pilot:security-reviewer` | [S1](slices/S1.md) |
| S2 | Headings, list markers and inert links render, within a frame | 1, 4, 6 | `deck/rune/src/preview.rs`, `tests/preview.rs`, `tests/reply.rs` | S1 (`preview::spans`, `preview.rs`) | `pilot:rust-reviewer`, `pilot:security-reviewer` | [S2](slices/S2.md) |
| S3 | Table skeleton: the Table button inserts a grid, typing fills its cells, the reply is sent with a GFM table | 3, 8, 9, 10 | `deck/rune/src/table.rs` (new), `src/lib.rs`, `src/regions/reply.rs`, `tests/table.rs` (new), `docs/adr/NNNN-reply-markdown.md` | S1 (`reply.rs`, `lib.rs`, the ADR) | `pilot:rust-reviewer`, `pilot:security-reviewer` | [S3](slices/S3.md) |
| S4 | Moving through cells, adding and removing rows and columns, cells rendering | 11, 12, 13 | `deck/rune/src/table.rs`, `src/regions/reply.rs`, `tests/table.rs` | S3 (`table::Table`, the grid in `reply.rs`, `tests/table.rs`) | `pilot:rust-reviewer`, `pilot:security-reviewer` | [S4](slices/S4.md) |

## 9. Acceptance evidence

On a scratch deck in the Rune window, the user opens a thread and types into the reply box:

1. `**bold** _it_ `code``, Shift+Return, a second line: the first line renders, the second stays raw (spec 1, 2).
2. Arrow up: the first line turns raw, the second renders, in one frame (spec 2).
3. `# Head`, `- item`, `[pilot](https://example.com)` on lines of their own render as heading, quiet marker, link (1).
4. Clicking the link puts the caret there; no browser opens, nothing posts (spec 4).
5. Clicking into the thread: every line renders (spec 5).
6. A 300-line paste types without lag (spec 6); the reply sent reads in the thread exactly as typed and styles as it
   did in the box (spec 3, 7).
7. A new reply: a line of text, then the Table button: a 2 × 2 grid appears under it, the caret in the first header
   cell, no pipes anywhere (spec 8, 9).
8. Type `Name`, Tab, `Size`, Return, `a | b`, Tab, `**2**`: each lands in its box; Return under the last row adds
   one; Down from the last row puts the caret in the text after (spec 9, 11).
9. + column, − row, then delete table on a second table: the grid changes each time (spec 12). Clicking out: `**2**`
   renders bold in its cell (spec 13).
10. Send: the thread shows the line and a table with the same cells, `a | b` in one cell (spec 3, 10).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | | | | – | 1, 2, 3, 5, 7 |
| S2 | planned | | | | S1 | 1, 4, 6 |
| S3 | planned | | | | S1 | 3, 8, 9, 10 |
| S4 | planned | | | | S3 | 11, 12, 13 |
| Reply box renders markdown as you type | planned | `feat/reply-markdown` | #137 | `C:\Users\Hazzard\Projects\pilot-feat-reply-markdown` | S1-S4 | 1-13 |
