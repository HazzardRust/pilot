//! The reply box's live markdown preview (reply-markdown L1-L5): styled byte ranges painted over
//! the draft with `.decorations`, never a change to it. Every line the caret or selection is off
//! renders; a line it touches stays raw while the box is focused.

use std::ops::Range;

use pulldown_cmark::{Event, Options, Parser, Tag};
use rune::{Span, TextEdit};

use crate::theme::{self, space};

/// The styled ranges of `edit.text`'s rendered lines: none on a line the caret or selection
/// touches while `edit.focused`; every line rendered when not focused. Never mutates the draft.
pub fn spans(edit: &TextEdit, dark: bool) -> Vec<Span> {
    let text = edit.text.as_str();
    let k = theme::tokens(dark);
    let quiet = |at: Range<usize>| Span::new(at.start, at.end).color(k.quiet);
    let mut out = Vec::new();
    // rune-kit's own options (`markdown/parser.rs`), so a draft parses as the thread will.
    let opts = Options::ENABLE_STRIKETHROUGH | Options::ENABLE_TABLES | Options::ENABLE_TASKLISTS;
    for (event, at) in Parser::new_ext(text, opts).into_offset_iter() {
        let (marker, look): (usize, fn(Span) -> Span) = match event {
            Event::Start(Tag::Strong) => (2, Span::bold),
            Event::Start(Tag::Emphasis) => (1, Span::italic),
            Event::Code(_) => {
                let ticks = text[at.clone()].bytes().take_while(|&b| b == b'`').count();
                let (open, close) = (at.start + ticks, at.end - ticks);
                out.push(quiet(at.start..open));
                out.push(Span::new(open, close).mono().bg(k.rule, space::s0));
                out.push(quiet(close..at.end));
                continue;
            }
            _ => continue,
        };
        // Each delimiter run is `marker` bytes at either end of the element's range.
        let (open, close) = (at.start + marker, at.end - marker);
        out.push(quiet(at.start..open));
        out.push(look(Span::new(open, close)));
        out.push(quiet(close..at.end));
    }
    match raw(edit) {
        Some(raw) => out.into_iter().flat_map(|s| clip(s, &raw)).collect(),
        None => out,
    }
}

/// The bytes left unstyled: the lines the caret or selection touches, with the `\n`s either side,
/// so a span crossing them keeps only what lies on rendered lines. None while unfocused.
fn raw(edit: &TextEdit) -> Option<Range<usize>> {
    if !edit.focused {
        return None;
    }
    // Bytes, not `str` slices: a caret off a char boundary must not panic the frame.
    let text = edit.text.as_bytes();
    let (lo, hi) = edit.range();
    let (lo, hi) = (lo.min(text.len()), hi.min(text.len()));
    let start = text[..lo].iter().rposition(|&b| b == b'\n').unwrap_or(0);
    let end = text[hi..]
        .iter()
        .position(|&b| b == b'\n')
        .map_or(text.len(), |n| hi + n + 1);
    Some(start..end)
}

/// `span` with `raw` cut out of it: none, one or two pieces. `raw`'s ends sit on `\n` or the
/// text's ends, so every piece ends on a char boundary.
fn clip(span: Span, raw: &Range<usize>) -> impl Iterator<Item = Span> {
    let (start, end) = (span.start as usize, span.end as usize);
    let piece = |a: usize, b: usize| {
        (a < b).then(|| Span {
            start: a as u32,
            end: b as u32,
            ..span.clone()
        })
    };
    let before = piece(start, end.min(raw.start));
    let after = piece(start.max(raw.end), end);
    before.into_iter().chain(after)
}
