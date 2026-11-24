//! reply-markdown S1: the reply box's live preview, `preview::spans` (spec 1, 2, 5). A line the
//! caret or selection is off renders bold, italic and code with quiet markers; a line it touches
//! stays raw; an unfocused box renders every line.

use std::ops::Range;

use pilot_deck::preview;
use pilot_deck::theme;
use rune::{Span, TextEdit};

const DARK: bool = false;

/// `text` in a focused box, the selection running from `anchor` to `focus`.
fn edit(text: &str, anchor: usize, focus: usize) -> TextEdit {
    let mut e = TextEdit::new(text);
    e.focused = true;
    e.anchor = anchor;
    e.focus = focus;
    e
}

fn quiet() -> rune::Color {
    theme::tokens(DARK).quiet
}

/// Whether one span covers exactly `at` and looks as `look` says.
fn has(spans: &[Span], at: Range<usize>, look: impl Fn(&Span) -> bool) -> bool {
    spans
        .iter()
        .any(|s| s.start as usize == at.start && s.end as usize == at.end && look(s))
}

/// The spans that paint any byte of `bytes`.
fn within(spans: &[Span], bytes: Range<usize>) -> usize {
    spans
        .iter()
        .filter(|s| (s.start as usize) < bytes.end && (s.end as usize) > bytes.start)
        .count()
}

#[test]
fn a_line_off_the_caret_renders_bold_italic_and_code() {
    // 0..5 `**b**`, 6..9 `_i_`, 10..13 `` `c` ``, 13 `\n`, 14 `x`: the caret on line 2.
    let text = "**b** _i_ `c`\nx";
    let spans = preview::spans(&edit(text, 14, 14), DARK);

    assert!(
        has(&spans, 2..3, |s| s.weight.is_some()),
        "bold over b: {spans:?}"
    );
    assert!(has(&spans, 7..8, |s| s.italic), "italic over i: {spans:?}");
    assert!(
        has(&spans, 11..12, |s| s.mono
            && s.bg == Some(theme::tokens(DARK).rule)),
        "mono with the rule fill over c: {spans:?}"
    );
    for marker in [0..2, 3..5, 6..7, 8..9, 10..11, 12..13] {
        assert!(
            has(&spans, marker.clone(), |s| s.color == Some(quiet())),
            "quiet marker {marker:?}: {spans:?}"
        );
    }
}

#[test]
fn the_carets_line_stays_raw_and_renders_once_the_caret_leaves() {
    // Line 1 is 0..5, line 2 is 6..11.
    let text = "**a**\n**b**";

    let on_line_1 = preview::spans(&edit(text, 1, 1), DARK);
    assert_eq!(within(&on_line_1, 0..5), 0, "line 1 raw: {on_line_1:?}");
    assert!(
        has(&on_line_1, 8..9, |s| s.weight.is_some()),
        "{on_line_1:?}"
    );

    let on_line_2 = preview::spans(&edit(text, 8, 8), DARK);
    assert!(
        has(&on_line_2, 2..3, |s| s.weight.is_some()),
        "{on_line_2:?}"
    );
    for marker in [0..2, 3..5] {
        assert!(has(&on_line_2, marker, |s| s.color == Some(quiet())));
    }
    assert_eq!(within(&on_line_2, 6..11), 0, "line 2 raw: {on_line_2:?}");
}

#[test]
fn a_selection_keeps_every_line_it_touches_raw() {
    // Lines 0..5, 6..9 and 10..13; the selection runs back from line 2 into line 1.
    let text = "**a**\n_b_\n`c`";
    let spans = preview::spans(&edit(text, 7, 1), DARK);

    assert_eq!(within(&spans, 0..10), 0, "lines 1-2 raw: {spans:?}");
    assert!(
        has(&spans, 11..12, |s| s.mono),
        "line 3 rendered: {spans:?}"
    );
}

#[test]
fn a_span_crossing_a_raw_line_clips_at_a_char_boundary() {
    // One paragraph's emphasis over three lines: 0..5 `_éé`, 6..8 `ab`, 9..14 `éé_`.
    let text = "_éé\nab\néé_";
    let spans = preview::spans(&edit(text, 7, 7), DARK);

    assert!(!spans.is_empty(), "lines 1 and 3 still render: {spans:?}");
    assert_eq!(within(&spans, 5..9), 0, "line 2 raw: {spans:?}");
    assert!(has(&spans, 1..5, |s| s.italic), "{spans:?}");
    assert!(has(&spans, 9..13, |s| s.italic), "{spans:?}");
    for s in &spans {
        assert!(text.is_char_boundary(s.start as usize), "{s:?}");
        assert!(text.is_char_boundary(s.end as usize), "{s:?}");
    }
}

#[test]
fn nested_emphasis_and_an_empty_or_overrun_draft_render_without_a_panic() {
    // `***a***` is emphasis around strong: the a both italic and bold, six quiet stars.
    let spans = preview::spans(&edit("***a***\nx", 9, 9), DARK);
    assert!(has(&spans, 3..4, |s| s.weight.is_some()), "{spans:?}");
    assert!(has(&spans, 1..6, |s| s.italic), "{spans:?}");
    for marker in [0..1, 1..3, 4..6, 6..7] {
        assert!(has(&spans, marker, |s| s.color == Some(quiet())));
    }

    assert!(preview::spans(&edit("", 0, 0), DARK).is_empty());
    // A caret past the end of the text clamps to it rather than slicing out of range.
    assert!(preview::spans(&edit("**a**", 40, 99), DARK).is_empty());
}

#[test]
fn headings_render_in_the_header_type() {
    // 0..1 `#`, 1 ` `, 2..3 `H`, 3 `\n`, 4 `x`: the caret on line 2.
    let spans = preview::spans(&edit("# H\nx", 4, 4), DARK);
    let header = theme::type_::HEADER;

    assert!(
        has(&spans, 2..3, |s| s.size == Some(header.size)
            && s.weight == Some(header.weight)),
        "the header type over H: {spans:?}"
    );
    assert!(
        has(&spans, 0..2, |s| s.color == Some(quiet())),
        "quiet #: {spans:?}"
    );
}

/// The walkthrough of 2026-11-24: "some markdown rendering is missing, such as for dotpoints"; the
/// user chose a solid dash (itm_51f1646c9f32). A list marker off the caret is drawn in the body ink
/// at the thread's bullet weight, never dimmed.
#[test]
fn list_markers_render_solid() {
    // 0 `-`, 2 `a`, 4..6 `1.`, 7 `b`, 9 `x`: the caret on line 3.
    let spans = preview::spans(&edit("- a\n1. b\nx", 9, 9), DARK);
    let ink = theme::tokens(DARK).text;
    let weight = theme::type_::BODY.weight;

    for marker in [0..1, 4..6] {
        assert!(
            has(&spans, marker.clone(), |s| s.color == Some(ink)
                && s.weight == Some(weight)),
            "solid marker {marker:?}: {spans:?}"
        );
        assert!(
            !spans.iter().any(|s| (s.start as usize) < marker.end
                && (s.end as usize) > marker.start
                && s.color == Some(quiet())),
            "marker {marker:?} dimmed: {spans:?}"
        );
    }
    assert_eq!(within(&spans, 2..3), 0, "a unstyled: {spans:?}");
    assert_eq!(within(&spans, 7..8), 0, "b unstyled: {spans:?}");
}

/// The look a byte draws in: Rune flattens decorations with the later span winning.
fn colour_at(spans: &[Span], byte: usize) -> Option<rune::Color> {
    spans
        .iter()
        .rev()
        .find(|s| (s.start as usize) <= byte && byte < s.end as usize && s.color.is_some())
        .and_then(|s| s.color)
}

#[test]
fn markers_inside_a_link_stay_quiet() {
    // 0 `[`, 1..3 `**`, 3 `b`, 4..6 `**`, 6..10 `](u)`, 10 `\n`, 11 `x`.
    let spans = preview::spans(&edit("[**b**](u)\nx", 11, 11), DARK);
    for byte in [1, 2, 4, 5] {
        assert_eq!(
            colour_at(&spans, byte),
            Some(quiet()),
            "byte {byte}: {spans:?}"
        );
    }
    assert_ne!(
        colour_at(&spans, 3),
        Some(quiet()),
        "b in the link colour: {spans:?}"
    );
}

#[test]
fn odd_headings_lists_and_links_render_without_a_panic_at_any_caret() {
    let drafts = [
        "Title é\r\n===\r\nnext",
        "a\nb\n---\nc",
        "# closing ##\n#hashtag\n####### seven",
        "  - é nested\n    + deeper\n* [ ] todo\n10) ten",
        "<https://e.x> [r][r] [] [](u) [`c`](u)\n\n[r]: https://e.x",
        "> # quoted\n> - item [l](u)",
        "-\n#\n[",
    ];
    for text in drafts {
        for caret in 0..=text.len() + 1 {
            for s in preview::spans(&edit(text, caret, caret), DARK) {
                assert!(
                    s.start <= s.end && s.end as usize <= text.len(),
                    "{text:?} {s:?}"
                );
                assert!(text.is_char_boundary(s.start as usize), "{text:?} {s:?}");
                assert!(text.is_char_boundary(s.end as usize), "{text:?} {s:?}");
            }
        }
        let mut unfocused = edit(text, 0, 0);
        unfocused.focused = false;
        preview::spans(&unfocused, DARK);
    }
}

#[test]
fn a_long_draft_is_styled_within_a_frame() {
    let line = |i: usize| match i % 6 {
        0 => format!("# Heading {i}"),
        1 => format!("- item **{i}** with _some_ words"),
        2 => format!("{i}. step with `code` in it"),
        3 => format!("see [the link {i}](https://example.com/{i}) here"),
        4 => format!("plain prose on line {i}, long enough to wrap in the box"),
        _ => String::new(),
    };
    let text: String = (0..300).map(line).collect::<Vec<_>>().join("\n");
    let caret = text.len() / 2;
    let e = edit(&text, caret, caret);
    let header = theme::type_::HEADER;

    let mut best = std::time::Duration::MAX;
    let mut spans = Vec::new();
    for _ in 0..5 {
        let start = std::time::Instant::now();
        spans = preview::spans(&e, DARK);
        best = best.min(start.elapsed());
    }

    // 50 of each kind; the caret's line, one of the 300, stays raw, so at most one is missing.
    let headings = spans.iter().filter(|s| s.size == Some(header.size)).count();
    let links = spans.iter().filter(|s| s.underline.is_some()).count();
    assert!(headings >= 49, "the headings render: {headings}");
    assert!(links >= 49, "the links render: {links}");
    eprintln!("300 lines styled in {best:?}");
    assert!(
        best < std::time::Duration::from_millis(16),
        "300 lines took {best:?}, past a 60 Hz frame"
    );
}

#[test]
fn an_unfocused_box_renders_every_line() {
    let text = "**a**\n**b**";
    let mut e = edit(text, 1, 1);
    e.focused = false;
    let spans = preview::spans(&e, DARK);

    assert!(
        has(&spans, 2..3, |s| s.weight.is_some()),
        "line 1: {spans:?}"
    );
    assert!(
        has(&spans, 8..9, |s| s.weight.is_some()),
        "line 2: {spans:?}"
    );
}
