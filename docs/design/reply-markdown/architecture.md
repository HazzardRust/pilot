# The reply box renders markdown as you type

Ticket `itm_864c47669387` · slug `reply-markdown` · base `origin/feat/rune-deck-ui` d075ad91 · ADR NNNN
(`docs/adr/NNNN-reply-markdown.md`, S1) · surface: true (spec 1, 2, 7 are looks; the implementer's live check feeds
the walkthrough)

## 1. Problem

The user wants the Rune deck's reply box to behave like Obsidian's live preview: markdown renders while they type,
the line the cursor is on stays raw and renders as soon as the cursor moves to another line, and what is sent is
the raw text, unchanged.

## 2. Spec

*Agreed by the user on itm_bbf3e33c48d2 ("Agree"), lines 1-7 as proposed.*

| # | Behaviour | Evidence | Bar |
| --- | --- | --- | --- |
| 1 | Every line the cursor is not on renders bold, italic, inline code, headings, list markers and links, in the look the thread gives the same markdown once sent. | `preview::spans` test per kind; `--snap` PNG of the box; the user's look | 6 of 6 kinds styled |
| 2 | Every line the caret or the selection touches stays unstyled; moving the caret to another line styles the old one and unstyles the new one in the same frame. | `preview::spans` test moving the caret line 1 → line 2; the user's look | 0 spans on a raw line; the other line's spans all present |
| 3 | What is sent is the typed text, byte for byte. | `reply::Local::send` test after typing markdown and moving the caret | 0 bytes differ between typed and posted |
| 4 | A rendered link is never followed: a click places the caret (the line turns raw); nothing opens, nothing posts. *security* | test: a press on a rendered link's text posts no `Action`; read: `Span` carries no link and the crate has no URL opener | 0 actions; 0 openers |
| 5 | With the box not focused, every line renders. *assumed A3* | `preview::spans` test with `focused = false` | 0 lines without their spans |
| 6 | No input lag: a long draft's spans are computed within one frame. *practitioner: editor engineer, who budgets per-keystroke cost* | timing test in the gate's build | 300-line draft < 16 ms |
| 7 | What styles while typing is what styles once sent: the same parser and dialect the thread uses. *practitioner: editor designer, who checks the preview against the output* | read: `pulldown-cmark` 0.13, rune-kit's own; snap of a draft beside the same text sent | 0 kinds styled in one and not the other |

## 3. Findings

- `deck/rune/src/regions/reply.rs:395`: the box is `text_input(&local.draft, type_::BODY)`, multi-line, no
  `on_submit` and no `default_button` (Shift+Return makes a line; plain Return is the walkthrough's to check).
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
| `reply::Local` | `send(&mut self, id) -> Option<Action>` (unchanged) | spec 3's pin crosses it | in-process |
| `reply::draw` | `draw(v, local, cx) -> El` (unchanged signature) | gains one `.decorations(preview::spans(..))` | in-process |

Deletion test: deleting `preview` puts the parser walk and line logic into `reply::draw`, untestable except through
a runtime, and again into chat if A2 flips. It earns its keep. No shallow module to fold; no fold slice.

## 4. Ubiquitous language

- **Draft**: the raw text in `reply::Local::draft.text`; the only thing ever sent.
- **Line**: a run of the draft between `\n`s (a logical line, not a wrapped row).
- **Raw line**: a line the caret or selection touches while the box is focused; it gets no span.
- **Rendered line**: any other line; it gets the preview's spans.
- **Marker**: the markdown syntax characters (`**`, `_`, `` ` ``, `#`, `- `, `[`, `](url)`).

## 5. Locked decisions

- **L1** Parse the whole draft with `pulldown-cmark` 0.13's `into_offset_iter`, then drop spans on raw lines and
  clip spans that cross one. Rejected: rune-kit's `parse` (rendered offsets only); a hand-written line lexer (a
  second dialect drifting from the thread's, spec 7); parsing each line alone (breaks a paragraph's emphasis).
- **L2** Rendering is decorations only: `preview::spans` takes `&TextEdit` and returns `Span`s, so it cannot change
  the draft (spec 3, compile-time). Rejected: rich `TextEdit` marks (`toggle_mark`), which hold formatting beside
  the string and would make the shown and the sent text differ.
- **L3** One seam, `preview::spans(&TextEdit, bool)`; `reply.rs` calls it once. Rejected: inline in `reply::draw`
  (testable only through a runtime).
- **L4** Raw lines are logical lines; with a selection, every line it touches. Rejected: wrapped rows (a long
  paragraph would flicker as the caret crosses rows).
- **L5** The look comes from `theme` tokens matching `theme::markdown_style`: headings `type_::HEADER`, code mono
  with the `rule` fill, links the link colour underlined, markers `quiet`. No literal colour or size. Rejected:
  rune-kit's `MarkdownStyle` (private fields).
- **L6** Links are inert while composing: a span, no handler (spec 4). Rejected: Ctrl+click opens (a new opener and
  trust surface for typed text).
- **L8** QA runs the native Rune window built from `feat/reply-markdown` against a scratch deck with seeded threads;
  no database, nothing kept (the user, itm_7e0fff09827d). Rejected: the user's live deck (a QA draft could post to a
  real thread).
- **L7** Recorded as ADR NNNN (`docs/adr/NNNN-reply-markdown.md`), written by S1; the landing numbers it.

## 6. Assumed decisions

- **A1** Markers on rendered lines are drawn in the quiet ink, not hidden. Tradeoff: `**bold**` shows faint stars
  (Typora-like, short of Obsidian). Rejected: near-zero `size` spans to hide them (unproven in Rune, caret steps
  through invisible bytes, `-` still never becomes a dot). Asked: itm_3cadb89e11ae. Answered: "Dim them" (the default).
- **A2** Reply box only; the chat composer is left as it is. Tradeoff: two composers differ until a one-line
  follow-up. Rejected: chat too (widens the ask). Asked: itm_cf736cb1ad17. Answered: "Reply box only" (the default).
- **A3** An unfocused box renders every line (spec 5). Tradeoff: the line clicked back into shifts as it turns
  raw. Rejected: keep the last caret line raw. Asked: itm_b5ca8397c90b. Answered: "Render every line" (the default).
- red team: walked S1's first behaviour against `reply.rs:395` and `el/text.rs:225`: a plain field with
  decorations takes the rich display path, whose byte mapping is identity for a plain draft, so spans land on the
  typed bytes. Attacked: an IME preedit (Rune shifts the ranges), a heading's `size` span changing line height
  under the caret (S2 behaviour 1's look covers it), a multi-byte character at a clip edge (S1 behaviour 3 pins a
  char boundary). Found: per-frame spans re-key layout each frame; spec 6 times only the spans, so S2's Misses
  names the layout cost for QA. Two slices share `preview.rs`, so they are serial, not parallel: no seam half-built.

## 7. Out of scope

Blockquotes, strikethrough, tables, fenced code blocks, images, bare-URL autolinks; the chat composer (A2); hiding
markers (A1); toolbar buttons; any change to how a sent message renders in the thread.

## 8. Slices

Width 1; longest stem 2

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | Walking skeleton: bold, italic and code render off the caret's line, and the draft is sent unchanged | 1, 2, 3, 5, 7 | `deck/rune/Cargo.toml`, `Cargo.lock`, `src/lib.rs`, `src/preview.rs` (new), `src/regions/reply.rs`, `tests/preview.rs` (new), `tests/reply.rs`, `docs/adr/NNNN-reply-markdown.md` (new) | – | `pilot:rust-reviewer`, `pilot:security-reviewer` | [S1](slices/S1.md) |
| S2 | Headings, list markers and inert links render, within a frame | 1, 4, 6 | `deck/rune/src/preview.rs`, `tests/preview.rs`, `tests/reply.rs` | S1 (`preview::spans`, `preview.rs`) | `pilot:rust-reviewer`, `pilot:security-reviewer` | [S2](slices/S2.md) |

## 9. Acceptance evidence

On a scratch deck in the Rune window, the user opens a thread and types into the reply box:

1. `**bold** _it_ `code``, Shift+Return, a second line: the first line renders, the second stays raw (spec 1, 2).
2. Arrow up: the first line turns raw, the second renders, in one frame (spec 2).
3. `# Head`, `- item`, `[pilot](https://example.com)` on lines of their own render as heading, quiet marker, link (1).
4. Clicking the link puts the caret there; no browser opens, nothing posts (spec 4).
5. Clicking into the thread: every line renders (spec 5).
6. A 300-line paste types without lag (spec 6); the reply sent reads in the thread exactly as typed and styles as it
   did in the box (spec 3, 7).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | | | | – | 1, 2, 3, 5, 7 |
| S2 | planned | | | | S1 | 1, 4, 6 |
| Reply box renders markdown as you type | planned | `feat/reply-markdown` | | | S1, S2 | 1-7 |
