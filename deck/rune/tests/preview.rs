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
