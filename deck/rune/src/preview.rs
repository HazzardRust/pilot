//! The reply box's live markdown preview (reply-markdown L1-L5): styled byte ranges painted over
//! the draft with `.decorations`, never a change to it. Every line the caret or selection is off
//! renders; a line it touches stays raw while the box is focused.

use std::ops::Range;

use pulldown_cmark::{Event, Options, Parser, Tag, TagEnd};
use rune::{Span, TextEdit};

use crate::theme::{self, space, type_};

/// The styled ranges of `edit.text`'s rendered lines: none on a line the caret or selection
/// touches while `edit.focused`; every line rendered when not focused. Never mutates the draft.
pub fn spans(edit: &TextEdit, dark: bool) -> Vec<Span> {
    let text = edit.text.as_str();
    let k = theme::tokens(dark);
    let quiet = |at: Range<usize>| Span::new(at.start, at.end).color(k.quiet);
    let mut out = Vec::new();
    // A link open in the draft: where it starts, how many spans came before it, and the end of its
    // text so far. Links never nest.
    let mut link: Option<(usize, usize, Option<usize>)> = None;
    let mut link_look = None;
    // rune-kit's own options (`markdown/parser.rs`), so a draft parses as the thread will.
    let opts = Options::ENABLE_STRIKETHROUGH | Options::ENABLE_TABLES | Options::ENABLE_TASKLISTS;
    for (event, at) in Parser::new_ext(text, opts).into_offset_iter() {
        if let Some((_, _, inner)) = &mut link
            && !matches!(event, Event::End(TagEnd::Link))
        {
            *inner = Some(inner.map_or(at.end, |end| end.max(at.end)));
        }
        let (marker, look): (usize, fn(Span) -> Span) = match event {
            Event::Start(Tag::Heading { level, .. }) => {
                heading(text, at, level as u8, dark, &mut out);
                continue;
            }
            Event::Start(Tag::Item) => {
                // The marker (`-`, `*`, `1.`) solid in the body ink at the thread's bullet
                // weight, never dimmed (the user's "Solid dash now", itm_51f1646c9f32); the
                // item's own text untouched.
                let line = &text.as_bytes()[at.clone()];
                let mark = line.iter().take_while(|b| !b.is_ascii_whitespace()).count();
                out.push(
                    Span::new(at.start, at.start + mark)
                        .color(k.text)
                        .weight(type_::BODY.weight),
                );
                continue;
            }
            Event::Start(Tag::Link { .. }) => {
                link = Some((at.start, out.len(), None));
                continue;
            }
            Event::End(TagEnd::Link) => {
                let Some((start, before, inner)) = link.take() else {
                    continue;
                };
                // `[text](url)` or `<url>`: one opening byte, then the text, then the rest quiet. A
                // link is painted only: it carries no press and opens nothing (spec 4). Its spans go
                // in ahead of its children's, so a `**` or a backtick inside it still draws quiet.
                let look = match inner.filter(|&end| end > start + 1 && end <= at.end) {
                    Some(end) => {
                        // The thread's own link look (rune-kit `MarkdownStyle::from_kit`, L5).
                        let (accent, underline) = *link_look.get_or_insert_with(|| {
                            let kit = rune_kit::Kit::neutral(dark);
                            (kit.c.text_accent, kit.alpha(kit.c.text_accent, 0.4))
                        });
                        vec![
                            quiet(start..start + 1),
                            Span::new(start + 1, end).color(accent).underline(underline),
                            quiet(end..at.end),
                        ]
                    }
                    None => vec![quiet(start..at.end)],
                };
                out.splice(before..before, look);
                continue;
            }
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

/// A heading of `level` at `at`: an ATX heading's `#`s and the space after them quiet, a setext
/// heading's underline quiet, the words on its first line in the thread's size for that level
/// (`type_::heading`).
fn heading(text: &str, at: Range<usize>, level: u8, dark: bool, out: &mut Vec<Span>) {
    let look = type_::heading(level);
    let quiet = theme::tokens(dark).quiet;
    // The range may carry the line's `\n`; what is left is the heading's own lines.
    let end = at.start + text[at.clone()].trim_end_matches(['\n', '\r']).len();
    let bytes = &text.as_bytes()[at.start..end];
    let hashes = bytes.iter().take_while(|&&b| b == b'#').count();
    let atx =
        (1..=6).contains(&hashes) && bytes.get(hashes).is_none_or(|&b| b == b' ' || b == b'\t');
    let (open, words_end) = if atx {
        let gap = bytes[hashes..]
            .iter()
            .take_while(|&&b| b == b' ' || b == b'\t')
            .count();
        (at.start + hashes + gap, end)
    } else {
        // Setext: the words, then a line of `=` or `-`.
        let under = bytes
            .iter()
            .rposition(|&b| b == b'\n')
            .map_or(end, |n| at.start + n);
        if under < end {
            out.push(Span::new(under + 1, end).color(quiet));
        }
        (at.start, under)
    };
    if open > at.start {
        out.push(Span::new(at.start, open).color(quiet));
    }
    let close = open + text[open..words_end].trim_end().len();
    if close > open {
        out.push(Span::new(open, close).size(look.size).weight(look.weight));
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
