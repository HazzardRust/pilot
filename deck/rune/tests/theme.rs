//! rune-deck-ui S4: the Rune deck wears deck.css's colours and type, springs and one spacing scale.

use std::fs;
use std::hint::black_box;
use std::path::Path;

use pilot_deck::theme::{self, Tokens, motion, space};
use rune::Color;

fn root() -> &'static Path {
    Path::new(env!("CARGO_MANIFEST_DIR"))
}

fn deck_css() -> String {
    fs::read_to_string(root().join("../ui/deck.css")).expect("deck/ui/deck.css")
}

/// The expression on the first line holding `anchor`, from `prop:` to the closing `;`.
fn css_expr(css: &str, anchor: &str, prop: &str) -> String {
    let line = css
        .lines()
        .find(|line| line.contains(anchor))
        .unwrap_or_else(|| panic!("deck.css has no line with {anchor}"));
    let from = line
        .find(prop)
        .unwrap_or_else(|| panic!("no {prop} in {line}"))
        + prop.len();
    let rest = &line[from..];
    let end = rest.find(";").unwrap_or(rest.len());
    rest[..end].trim().to_string()
}

fn hex3(s: &str) -> [f32; 3] {
    let h = s.trim().trim_start_matches('#');
    if h.len() == 3 {
        let byte = |i: usize| f32::from(u8::from_str_radix(&h[i..=i], 16).expect("hex digit") * 17);
        return [byte(0), byte(1), byte(2)];
    }
    let byte = |i: usize| f32::from(u8::from_str_radix(&h[i..i + 2], 16).expect("hex digits"));
    [byte(0), byte(2), byte(4)]
}

/// An `#rrggbb` token inside `expr`, the last one.
fn last_hex(expr: &str) -> [f32; 3] {
    let at = expr.rfind('#').expect("a hex colour");
    hex3(&expr[at..at + 7])
}

fn rgb(c: Color) -> [f32; 3] {
    let hex = c.hex();
    hex3(&hex[..7])
}

fn close(got: Color, want: [f32; 3], what: &str) {
    let got = rgb(got);
    assert!(
        got.iter().zip(want).all(|(g, w)| (g - w).abs() <= 1.0),
        "{what}: {got:?} is not {want:?}"
    );
}

/// `color-mix(in srgb, currentColor P%, #hex)` over a page whose text is `text`.
fn mix(expr: &str, text: f32) -> [f32; 3] {
    let p: f32 = expr
        .split("currentColor ")
        .nth(1)
        .and_then(|s| s.split('%').next())
        .and_then(|s| s.trim().parse().ok())
        .unwrap_or_else(|| panic!("no currentColor percent in {expr}"));
    let hue = last_hex(expr);
    hue.map(|c| (p / 100.0 * text + (1.0 - p / 100.0) * c).round())
}

/// `light-dark(#a, #b)`: the first for a light page, the second for a dark one.
fn light_dark(expr: &str, dark: bool) -> [f32; 3] {
    let inner = expr.split("light-dark(").nth(1).expect("a light-dark pair");
    let mut pair = inner.trim_end_matches(')').split(',');
    let (light, night) = (pair.next().unwrap(), pair.next().unwrap());
    hex3(if dark { night } else { light })
}

#[test]
fn every_colour_is_deck_css() {
    let css = deck_css();
    for dark in [false, true] {
        let t: Tokens = theme::tokens(dark);
        let text = if dark { 255.0 } else { 0.0 };
        let by = |name: &str| mix(&css_expr(&css, &format!("--by-{name}:"), ":"), text);
        let st = |name: &str| mix(&css_expr(&css, &format!("--state-{name}:"), ":"), text);
        for (name, got) in [
            ("pilot", t.by.pilot),
            ("architect", t.by.architect),
            ("implementer", t.by.implementer),
            ("fundamentalist", t.by.fundamentalist),
            ("qa", t.by.qa),
            ("teacher", t.by.teacher),
            ("explorer", t.by.explorer),
            ("auditor", t.by.auditor),
        ] {
            close(got, by(name), &format!("by.{name} dark={dark}"));
        }
        close(t.state.waiting, st("waiting"), "state.waiting");
        close(t.state.pilot, st("pilot"), "state.pilot");
        close(
            t.state.unacknowledged,
            st("unacknowledged"),
            "state.unacknowledged",
        );

        // Alpha over the page: `--rule` is 18% of the text colour, `--quiet` 55%.
        for (name, got, alpha) in [("rule", t.rule, 0.18), ("quiet", t.quiet, 0.55)] {
            assert!((got.a - alpha).abs() < 0.01, "{name} alpha {}", got.a);
            close(got, [text; 3], name);
        }
        // `by.other` and `state.resolved` are `--quiet`, by name in deck.css.
        assert_eq!(t.by.other, t.quiet);
        assert_eq!(t.state.resolved, t.quiet);

        let ld = |anchor: &str, prop: &str| light_dark(&css_expr(&css, anchor, prop), dark);
        close(t.usage.fine, ld(".usage-fine {", "color:"), "usage.fine");
        close(t.usage.warm, ld(".usage-warm {", "color:"), "usage.warm");
        close(t.usage.high, ld(".usage-high {", "color:"), "usage.high");
        close(
            t.usage.critical_bg,
            ld("background: light-dark(#b91c1c, #7f1d1d)", "background:"),
            "usage.critical_bg",
        );
        close(
            t.usage.critical,
            ld("color: light-dark(#fff, #fee2e2)", "color:"),
            "usage.critical",
        );
        for (name, got) in [
            ("green", t.accent.green),
            ("yellow", t.accent.yellow),
            ("red", t.accent.red),
            ("blue", t.accent.blue),
        ] {
            close(
                got,
                ld(&format!("[data-accent=\"{name}\"]"), "--accent:"),
                name,
            );
        }
        close(t.accent.plain, [text; 3], "accent.plain is the text colour");
        // The semantic roles are these same colours under a role's name (assumed A-R1).
        let r = theme::roles(dark);
        close(r.on_surface, [text; 3], "on_surface is the text colour");
        close(r.primary, rgb(t.accent.blue), "primary is the blue accent");
        close(r.error, rgb(t.accent.red), "error is the red accent");
        close(r.hover, [text; 3], "hover tints with the text colour");
        close(
            r.selection,
            rgb(t.accent.blue),
            "selection tints with the primary",
        );
    }
}

#[test]
fn the_font_is_the_deck() {
    let css = deck_css();
    let body = css_expr(&css, "font: 13px/1.6", "font:");
    for dark in [false, true] {
        let f = theme::tokens(dark).font;
        assert_eq!(f.family.first(), Some(&"Cascadia Mono"));
        assert_eq!(f.family.last(), Some(&"monospace"));
        assert!(
            f.family.iter().all(|name| body.contains(name)),
            "{:?} is not in deck.css's stack {body}",
            f.family
        );
        assert_eq!((f.size, f.line), (13.0, 1.6));
        assert!(body.starts_with("13px/1.6"), "{body}");
    }
}

#[test]
fn the_motion_is_springs_that_settle() {
    for (name, spring) in [
        ("panel", motion::panel),
        ("card", motion::card),
        ("press", motion::press),
    ] {
        let settles = spring.settling_duration(0.001);
        assert!(settles < 0.3, "{name} settles in {settles} s");
        assert!(settles > 0.0, "{name} never moves");
    }
}

#[test]
fn between_is_at_least_twice_within() {
    let (within, between, panels) = black_box((space::within, space::between, space::panels));
    assert!(between >= 2.0 * within);
    assert!(panels >= between);
    let steps = [
        space::s0,
        space::s1,
        space::s2,
        space::s3,
        space::s4,
        space::s5,
        space::s6,
        space::s7,
        space::s8,
    ];
    assert_eq!(steps, [0.0, 2.0, 4.0, 8.0, 12.0, 16.0, 24.0, 32.0, 48.0]);
    assert!(steps.iter().all(|s| s % 4.0 == 0.0 || *s == space::s1));
    assert_eq!(
        (space::within, space::pad, space::between, space::panels),
        (4.0, 8.0, 16.0, 24.0)
    );
    assert_eq!((space::row, space::card_line), (20.0, 24.0));
    assert_eq!(
        (space::cols.state_ch, space::cols.time_ch, space::cols.gap),
        (12.0, 7.0, 16.0)
    );
}

/// The calls on `src` that spell a spacing as a bare number: `.gap(8.0)`, `.padding(16)`.
fn spaced_by_hand(src: &str) -> Vec<String> {
    const CALLS: [&str; 7] = [
        ".gap(",
        ".padding(",
        ".margin(",
        ".height(",
        ".h(",
        ".pad(",
        ".padding_x(",
    ];
    src.lines()
        .enumerate()
        .flat_map(|(n, line)| {
            CALLS.iter().filter_map(move |call| {
                let arg = &line[line.find(call)? + call.len()..];
                arg.trim_start()
                    .starts_with(|c: char| c.is_ascii_digit())
                    .then(|| format!("line {}: {}", n + 1, line.trim()))
            })
        })
        .collect()
}

#[test]
fn the_scan_sees_a_number_spaced_by_hand() {
    let found = spaced_by_hand("col().gap(8.0).padding(space::pad).h(20.0)");
    assert_eq!(found.len(), 2, "{found:?}");
}

#[test]
fn no_region_spaces_by_hand() {
    let dir = root().join("src/regions");
    let mut seen = 0;
    for entry in fs::read_dir(&dir).expect("src/regions") {
        let path = entry.expect("entry").path();
        if path.extension().is_none_or(|e| e != "rs") {
            continue;
        }
        seen += 1;
        let found = spaced_by_hand(&fs::read_to_string(&path).expect("a region file"));
        assert!(found.is_empty(), "{}: {found:?}", path.display());
    }
    assert!(seen > 0, "no region files under {}", dir.display());
}
